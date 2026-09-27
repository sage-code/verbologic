"""Generate MP3s for pending media manifests with Microsoft Edge TTS.

Adapted from a sibling project's per-page TTS scripts (Edge TTS was the
reusable core there; everything else was bespoke HTML-table scraping that
doesn't apply here). Verbologic's pipeline is manifest-driven instead
(manual/MAINTENANCE.md 3.3): every media file has a sibling <ID>.json with
the text to speak (`term`) and a `status` of "pending" until a file lands
next to it.

This script walks media/audio/**/<ID>.json, finds manifests that are not yet
"published" and have no <ID>.mp3 sitting next to them, and synthesizes one
with the voice mapped from the manifest's `lang`. It never touches the JSON
manifests themselves — `run media manifest` reconciles those from the files
this script drops (scripts/media-sync.mjs's cmdManifest), exactly like a
human-recorded or externally-sourced MP3 arriving.

Mispronunciation fixes: Microsoft's edge-tts endpoint only allows <voice>/
<prosody> in SSML — a <phoneme> pronunciation override is stripped server-side
(fails with NoAudioReceived even for plain ASCII text), so there is no way to
feed it IPA. The only lever is respelling the synthesis input text itself. Add
an optional `"ttsText"` field to the manifest JSON with that respelling (e.g.
"gumă" -> "guumă") — it is fed to the TTS engine instead of `term`, while the
displayed `term`/`names`/`ipa` stay correct. Edit the field, then re-run this
script with `--id <manifest-id>` to regenerate just that word.

Usage (from repo root):
  .venv/Scripts/python.exe scripts/generate-audio.py [--dry-run] [--lang ro]
                                                      [--topic C1T01] [--overwrite]

Then: ./run media manifest   (promotes pending -> published)
      ./run media verify     (sanity check)
      ./run media upload --apply   (ships to R2)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

# Windows' console defaults to cp1252, which can't print diacritics (ă, î, ș…)
# that show up in `term` text — force utf-8 so this doesn't crash mid-run.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / "media" / "audio"

# One neural voice per track language (manifest.lang). Extend as new track
# languages get manifest-based (non-legacy) audio content.
VOICE_BY_LANG = {
    "ro": "ro-RO-AlinaNeural",
    "en": "en-US-AvaNeural",
}


def iter_manifests(lang_filter: str | None, topic_filter: str | None, id_filter: str | None):
    if not AUDIO_DIR.exists():
        return
    for manifest_path in sorted(AUDIO_DIR.glob("*/*/*.json")):
        lang, topic = manifest_path.parent.parent.name, manifest_path.parent.name
        if lang_filter and lang != lang_filter:
            continue
        if topic_filter and topic != topic_filter:
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if id_filter:
            if manifest.get("id") != id_filter:
                continue
        elif manifest.get("status") == "published":
            continue
        yield manifest_path, manifest, lang, topic


async def synthesize(text: str, voice: str, out_file: Path) -> None:
    communicator = edge_tts.Communicate(text, voice)
    await communicator.save(str(out_file))


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lang", help="Only this manifest lang (e.g. ro, en)")
    parser.add_argument("--topic", help="Only this topic code (e.g. C1T01)")
    parser.add_argument("--id", help="Regenerate exactly this manifest id, published or not (e.g. a pronunciation fix)")
    parser.add_argument("--overwrite", action="store_true", help="Regenerate even if an mp3 already exists")
    parser.add_argument("--dry-run", action="store_true", help="List what would be generated; write nothing")
    args = parser.parse_args()

    generated = 0
    skipped_existing = 0
    skipped_no_voice = 0
    skipped_no_term = 0
    missing_voices: set[str] = set()

    for manifest_path, manifest, lang, topic in iter_manifests(args.lang, args.topic, args.id):
        item_id = manifest["id"]
        # The mp3's base name follows the manifest's own filename (A002.json ->
        # A002.mp3), matching every already-published manifest in the repo —
        # not the semantic `id` field, which is a separate internal key.
        out_file = manifest_path.with_suffix(".mp3")

        if out_file.exists() and not args.overwrite and not args.id:
            skipped_existing += 1
            continue

        term = manifest.get("term")
        if not term:
            skipped_no_term += 1
            print(f"skip (no term): {lang}/{topic}/{item_id}")
            continue

        voice = VOICE_BY_LANG.get(lang)
        if not voice:
            skipped_no_voice += 1
            missing_voices.add(lang)
            continue

        tts_text = manifest.get("ttsText") or term

        if args.dry_run:
            note = f" [TTS text override: \"{tts_text}\"]" if tts_text != term else ""
            print(f"would generate: {lang}/{topic}/{item_id} -> {out_file.relative_to(ROOT)}  ({voice}: \"{term}\"){note}")
            generated += 1
            continue

        await synthesize(tts_text, voice, out_file)
        generated += 1
        print(f"generated: {out_file.relative_to(ROOT)}" + (f" (spoke \"{tts_text}\")" if tts_text != term else ""))

    verb = "would generate" if args.dry_run else "generated"
    print(
        f"\n{verb} {generated} · skipped (already on disk) {skipped_existing} "
        f"· skipped (no term) {skipped_no_term} · skipped (no voice for lang) {skipped_no_voice}"
    )
    if missing_voices:
        print(f"unmapped langs (add to VOICE_BY_LANG): {', '.join(sorted(missing_voices))}")
    if generated and not args.dry_run:
        print("\nNext: ./run media manifest   (promotes pending -> published)")
        print("      ./run media verify")
        print("      ./run media upload --apply")


if __name__ == "__main__":
    asyncio.run(main())
