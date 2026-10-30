"""Give Russian names a ttsText the Russian voices can read.

The Russian Edge TTS voices refuse some Latin-letter names (Hungarian "Ú",
Czech "Š", ...) with NoAudioReceived, so the audio pass fails for them. This
script finds every Russian name that fails on either Russian voice, builds a
Russian spelling for it (Latin letters read as Russian letter names, accents
as "с акутом"-style words), and keeps that spelling only when both voices
read it. Names that already work are not touched.

  .venv/Scripts/python.exe scripts/fix-ru-tts-text.py            # report only
  .venv/Scripts/python.exe scripts/fix-ru-tts-text.py --apply    # write ttsText

The display name (`name`) is never changed; ttsText is what the TTS engine
reads. Rerun `./run.sh create sound --missing --target ...` afterwards to make
the audio.
"""
import argparse
import asyncio
import json
import sys
import unicodedata
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
MEDIA_DIR = ROOT / "media"
TRACKS = ("dictionary", "lectures", "stories")
LOCALE = "ru"
# The two Russian voices of scripts/generate-audio.py (VOICE_BY_LANG_GENDER["ru"]).
# A name must read on both, because the topic decides which voice an item gets.
VOICES = ("ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural")
CONCURRENCY = 2

LATIN_LETTERS = {
    "a": "а", "b": "бэ", "c": "цэ", "d": "дэ", "e": "е", "f": "эф", "g": "гэ",
    "h": "ха", "i": "и", "j": "жи", "k": "ка", "l": "эль", "m": "эм", "n": "эн",
    "o": "о", "p": "пэ", "q": "ку", "r": "эр", "s": "эс", "t": "тэ", "u": "у",
    "v": "вэ", "w": "дубль-вэ", "x": "икс", "y": "ы", "z": "зэт",
}
# Combining marks (after NFD) -> the Russian words for them.
ACCENTS = {
    "́": "с акутом",
    "̀": "с грависом",
    "̈": "с умлаутом",
    "̂": "с циркумфлексом",
    "̋": "с двойным акутом",
    "̌": "с карон",
    "̧": "с седилью",
    "̨": "с огоньком",
    "̊": "с кружочком",
    "̃": "с тильдой",
    "̆": "с бревисом",
    "̦": "с запятой",
}
# Letters that have no decomposed form to split.
SPECIAL_LETTERS = {"ß": "эсцет"}


def russian_reading(name: str) -> str:
    """A Russian spelling of a Latin-letter name; Cyrillic and other characters pass through."""
    out = []
    for char in name:
        if char in SPECIAL_LETTERS:
            out.append(SPECIAL_LETTERS[char])
            continue
        decomposed = unicodedata.normalize("NFD", char)
        base, marks = decomposed[0], decomposed[1:]
        lower = base.lower()
        if lower in LATIN_LETTERS:
            spoken = LATIN_LETTERS[lower]
            out.append(spoken.capitalize() if base.isupper() else spoken)
            out.extend(" " + ACCENTS[m] + " " for m in marks if m in ACCENTS)
        else:
            out.append(char)
    return " ".join("".join(out).split())


async def reads(text: str, voice: str) -> bool:
    """True when the voice returns audio for the text. A refusal is retried once: the service is flaky under load."""
    for attempt in range(2):
        try:
            size = 0
            async for chunk in edge_tts.Communicate(text, voice).stream():
                if chunk["type"] == "audio":
                    size += len(chunk["data"])
            if size:
                return True
        except edge_tts.exceptions.NoAudioReceived:
            pass
        except Exception:  # noqa: BLE001 - network error: retry once
            pass
        await asyncio.sleep(1)
    return False


async def reads_on_any_voice(text: str, semaphore: asyncio.Semaphore) -> bool:
    """The generator falls back to the sibling voice, so one working voice is enough."""
    async with semaphore:
        for voice in VOICES:
            if await reads(text, voice):
                return True
    return False


def manifests():
    for track in TRACKS:
        root = MEDIA_DIR / track
        if root.is_dir():
            yield from sorted(root.rglob("item.json"))


def main() -> int:
    # Names are Cyrillic and Latin with accents; the Windows console default (cp1252) cannot print them.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write ttsText into the manifests")
    args = parser.parse_args()

    # Collect every Russian name that has no ttsText yet, with the manifests that use it.
    users: dict[str, list[Path]] = {}
    for path in manifests():
        item = json.loads(path.read_text(encoding="utf-8"))
        row = (item.get("locales") or {}).get(LOCALE) or {}
        name = (row.get("name") or "").strip()
        if name and not (row.get("ttsText") or "").strip():
            users.setdefault(name, []).append(path)

    print(f"{len(users)} distinct Russian name(s) without ttsText across the manifests.")

    async def probe_all():
        semaphore = asyncio.Semaphore(CONCURRENCY)
        names = list(users)
        results = await asyncio.gather(*(reads_on_any_voice(n, semaphore) for n in names))
        failing = [n for n, ok in zip(names, results) if not ok]
        return failing

    failing = asyncio.run(probe_all())
    print(f"{len(failing)} of them fail on a Russian voice.")

    fixes: dict[str, str] = {}
    unresolved: list[str] = []
    if failing:
        candidates = {name: russian_reading(name) for name in failing}

        async def probe_candidates():
            semaphore = asyncio.Semaphore(CONCURRENCY)
            texts = [c for c in candidates.values() if c and c != ""]
            results = await asyncio.gather(*(reads_on_any_voice(t, semaphore) for t in texts))
            return dict(zip(texts, results))

        ok_by_text = asyncio.run(probe_candidates())
        for name, text in candidates.items():
            if text == name:
                # Already readable: the first probe was a flaky refusal, so no override is needed.
                continue
            if text and ok_by_text.get(text):
                fixes[name] = text
            else:
                unresolved.append(name)

    for name, text in fixes.items():
        print(f"  {name!r} -> ttsText {text!r}  ({len(users[name])} manifest(s))")
    for name in unresolved:
        print(f"  {name!r}: no working spelling found; needs a hand-written ttsText", file=sys.stderr)

    if not args.apply:
        print(f"Report only: {len(fixes)} fix(es) ready, {len(unresolved)} unresolved. Run with --apply to write them.")
        return 0

    written = 0
    for name, text in fixes.items():
        for path in users[name]:
            item = json.loads(path.read_text(encoding="utf-8"))
            item["locales"][LOCALE]["ttsText"] = text
            path.write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            written += 1
    print(f"Wrote ttsText into {written} manifest(s); {len(unresolved)} name(s) still need a hand-written ttsText.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
