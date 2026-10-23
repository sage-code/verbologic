"""Fill shared media translations with Gemini and generate native-voice audio.

The script operates on media/dictionary, media/lectures and media/stories
item.json files. It is report-only unless --apply is passed; existing
translations are never overwritten, and existing audio is reused unless
--overwrite-audio is set.

Two recordings exist per item and language:

  sound/<locale>.mp3   the short title/term recording (item["audio"])
  read/<locale>.mp3    the full article read (item["read"]), synthesized from
                       content/<track>/<TOPIC>/<ID>/<locale>.md

Examples:
  .venv/Scripts/python.exe scripts/generate-audio.py --all
  .venv/Scripts/python.exe scripts/generate-audio.py --all --apply
  .venv/Scripts/python.exe scripts/generate-audio.py --translate --track dictionary --apply
  .venv/Scripts/python.exe scripts/generate-audio.py --translate --track dictionary --chapter C1 --apply
  .venv/Scripts/python.exe scripts/generate-audio.py --audio --lang ro --apply
  .venv/Scripts/python.exe scripts/generate-audio.py --read --track stories --apply
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import edge_tts

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MEDIA_DIR = ROOT / "media"
CONTENT_DIR = ROOT / "content"
SIDEBARS_DIR = ROOT / "src" / "data" / "sidebars"
TRACKS = ("dictionary", "lectures", "stories")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.locales import LOCALES  # noqa: E402  (single locale registry)
LANGUAGE_NAMES = {
    "en": "English",
    "ro": "Romanian",
    "de": "German",
    "ru": "Russian",
    "it": "Italian",
    "es": "Spanish",
    "fr": "French",
    "hu": "Hungarian",
    "pt": "Portuguese",
}
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "models/gemini-3.5-flash-lite"
BATCH_SIZE = 8

# Each voice speaks the matching native locale. pt-PT is used for site locale pt.
VOICE_BY_LANG_GENDER = {
    "en": {"female": "en-US-AvaNeural", "male": "en-US-AndrewNeural"},
    "ro": {"female": "ro-RO-AlinaNeural", "male": "ro-RO-EmilNeural"},
    "de": {"female": "de-DE-KatjaNeural", "male": "de-DE-ConradNeural"},
    "ru": {"female": "ru-RU-SvetlanaNeural", "male": "ru-RU-DmitryNeural"},
    "it": {"female": "it-IT-ElsaNeural", "male": "it-IT-DiegoNeural"},
    "es": {"female": "es-ES-ElviraNeural", "male": "es-ES-AlvaroNeural"},
    "fr": {"female": "fr-FR-DeniseNeural", "male": "fr-FR-HenriNeural"},
    "hu": {"female": "hu-HU-NoemiNeural", "male": "hu-HU-TamasNeural"},
    "pt": {"female": "pt-PT-RaquelNeural", "male": "pt-PT-DuarteNeural"},
}


def load_env() -> None:
    env_file = ROOT / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def is_missing(value: Any) -> bool:
    return not isinstance(value, str) or not value.strip()


def read_items(track_filter: str | None):
    tracks = (track_filter,) if track_filter else TRACKS
    for track in tracks:
        root = MEDIA_DIR / track
        if not root.is_dir():
            raise FileNotFoundError(f"Media track directory not found: {root}")
        for path in sorted(root.rglob("item.json")):
            item = json.loads(path.read_text(encoding="utf-8"))
            if item.get("track") != track:
                raise ValueError(f"Track mismatch in {path}: expected {track!r}")
            for field in ("names", "description"):
                if not isinstance(item.get(field), dict):
                    raise ValueError(f"{path} must contain a {field!r} object")
            # Chapter/topic title manifests carry no per-language audio map.
            if item.get("audio") is not None and not isinstance(item["audio"], dict):
                raise ValueError(f"{path} must contain an 'audio' object")
            yield path, item


def locale_source(values: dict[str, Any]) -> tuple[str, str] | None:
    for locale in LOCALES:
        value = values.get(locale)
        if not is_missing(value):
            return locale, value.strip()
    return None


def build_translation_jobs(items):
    jobs = []
    skipped_names = 0
    for path, item in items:
        names = item["names"]
        descriptions = item["description"]
        missing_names = [lang for lang in LOCALES if is_missing(names.get(lang))]
        missing_descriptions = [
            lang for lang in LOCALES if is_missing(descriptions.get(lang))
        ]
        name_source = locale_source(names)
        description_source = locale_source(descriptions)

        job: dict[str, Any] = {
            "key": path.relative_to(MEDIA_DIR).as_posix(),
            "kind": str(item.get("kind", "item")),
            "context": {
                "code": item.get("code"),
                "chapter": item.get("chapter"),
                "topic": item.get("topic"),
                "tags": item.get("tags", []),
            },
            "names": None,
            "description": None,
            "generateDescription": False,
        }
        if missing_names and name_source:
            source_lang, source_text = name_source
            targets = [lang for lang in missing_names if lang != source_lang]
            if targets:
                job["names"] = {
                    "sourceLanguage": LANGUAGE_NAMES[source_lang],
                    "sourceText": source_text,
                    "targets": targets,
                }
        elif missing_names:
            skipped_names += len(missing_names)

        if missing_descriptions:
            if description_source:
                source_lang, source_text = description_source
                targets = [lang for lang in missing_descriptions if lang != source_lang]
                if targets:
                    job["description"] = {
                        "sourceLanguage": LANGUAGE_NAMES[source_lang],
                        "sourceText": source_text,
                        "targets": targets,
                    }
            elif name_source:
                job["generateDescription"] = True
                job["description"] = {
                    "sourceLanguage": "English",
                    "sourceText": None,
                    "targets": list(LOCALES),
                }

        if job["names"] or job["description"]:
            jobs.append((path, item, job))
    return jobs, skipped_names


def normalize_model(model: str) -> str:
    model = model.strip()
    if model.endswith("-light"):
        model = f"{model[:-len('-light')]}-lite"
    return model if model.startswith("models/") else f"models/{model}"


def format_http_error(error: urllib.error.HTTPError) -> str:
    detail = error.read().decode("utf-8", errors="replace")[:600]
    return f"HTTP {error.code}: {detail}"


def gemini_translate_batch(batch: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is required for translation. Set it in the project "
            ".env file or the process environment."
        )

    prompt = (
        "You are a careful multilingual language-learning editor. Translate all "
        "provided item names and descriptions into the requested locale codes. "
        "Descriptions marked generateDescription have no source description: "
        "write one concise, factual, learner-friendly sentence in English based "
        "only on the supplied name and context, then translate that sentence into "
        "all requested locales. Do not invent specific facts or add explanations. "
        "Preserve the meaning and natural phrasing of names. Return only a JSON "
        "object with shape {\"items\":[{\"key\":\"...\",\"names\":{\"de\":\"...\"},"
        "\"description\":{\"en\":\"...\",\"de\":\"...\"}}]}. Include every "
        "requested locale, use exact input keys, and return plain strings only.\n\n"
        f"ITEMS:\n{json.dumps(batch, ensure_ascii=False)}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    endpoint = (
        f"{GEMINI_API_URL}/{urllib.parse.quote(normalize_model(os.environ.get('GEMINI_MODEL') or DEFAULT_GEMINI_MODEL), safe='/')}"
        ":generateContent?"
        f"{urllib.parse.urlencode({'key': api_key})}"
    )
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                response_data = json.loads(response.read().decode("utf-8"))
            text = response_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"\A```(?:json)?\s*|\s*```\Z", "", text)
            result = json.loads(text)
            if not isinstance(result, dict) or not isinstance(result.get("items"), list):
                raise ValueError("Gemini returned JSON without an items array")
            translations = {}
            for translated_item in result["items"]:
                key = translated_item.get("key")
                if not isinstance(key, str) or key in translations:
                    raise ValueError("Gemini returned a missing or duplicate item key")
                translations[key] = translated_item
            expected = {entry["key"] for entry in batch}
            if set(translations) != expected:
                raise ValueError(
                    "Gemini response keys do not match the requested batch "
                    f"(missing={sorted(expected - set(translations))}, "
                    f"unexpected={sorted(set(translations) - expected)})"
                )
            for requested in batch:
                translated = translations[requested["key"]]
                for field in ("names", "description"):
                    target_locales = (requested.get(field) or {}).get("targets", [])
                    values = translated.get(field, {})
                    if not isinstance(values, dict):
                        raise ValueError(f"Gemini returned invalid {field} for {requested['key']}")
                    for locale in target_locales:
                        if is_missing(values.get(locale)):
                            raise ValueError(
                                f"Gemini omitted {field}.{locale} for {requested['key']}"
                            )
            return translations
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code < 600
            message = format_http_error(error)
            if not retryable or attempt == 2:
                raise RuntimeError(f"Gemini translation failed: {message}") from error
        except urllib.error.URLError as error:
            if attempt == 2:
                raise RuntimeError(
                    f"Gemini translation connection failed: {error.reason}"
                ) from error
        except (KeyError, IndexError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Invalid Gemini translation response: {error}") from error
        time.sleep(2 ** attempt)
    raise RuntimeError("Gemini translation failed after retries")


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", newline="\n", dir=path.parent, delete=False
    ) as temporary:
        temp_path = Path(temporary.name)
        temporary.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    try:
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def apply_translations(jobs, dry_run: bool) -> int:
    if dry_run:
        return len(jobs)
    changed = 0
    for offset in range(0, len(jobs), BATCH_SIZE):
        chunk = jobs[offset : offset + BATCH_SIZE]
        translated = gemini_translate_batch([job for _, _, job in chunk])
        for path, item, job in chunk:
            result = translated[job["key"]]
            for field in ("names", "description"):
                requested = job.get(field) or {}
                values = result.get(field, {})
                for locale in requested.get("targets", []):
                    if is_missing(item[field].get(locale)):
                        item[field][locale] = values[locale].strip()
                        changed += 1
            write_json_atomic(path, item)
        print(f"translated batch {offset // BATCH_SIZE + 1} ({len(chunk)} item(s))")
        time.sleep(1)
    return changed


def audio_path_for(path: Path, audio: dict[str, Any], locale: str, folder: str = "sound") -> Path:
    relative_path = audio.get("file") or f"{folder}/{locale}.mp3"
    target = (path.parent / relative_path).resolve()
    if not target.is_relative_to(path.parent.resolve()):
        raise ValueError(f"Audio path escapes its item directory: {path}: {relative_path}")
    return target


def display_media_path(path: Path) -> str:
    return f"media/{path.relative_to(MEDIA_DIR).as_posix()}"


async def synthesize(text: str, voice: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.stem}.tmp{output.suffix}")
    try:
        await edge_tts.Communicate(text, voice).save(str(temporary))
        if not temporary.is_file() or temporary.stat().st_size == 0:
            raise IOError(f"Edge TTS produced no audio for {output}")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def file_sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as audio_file:
        for chunk in iter(lambda: audio_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def voice_for(locale: str, item: dict[str, Any]) -> str:
    topic = str(item.get("topic", ""))
    match = re.search(r"T(\d+)$", topic)
    gender = "male" if match and int(match.group(1)) % 2 == 0 else "female"
    return VOICE_BY_LANG_GENDER[locale][gender]


async def apply_audio(
    items,
    lang_filter: str | None,
    dry_run: bool,
    overwrite: bool,
    owners: dict[str, str] | None = None,
) -> tuple[int, int, int]:
    generated = 0
    skipped = 0
    failed = 0
    owners = owners or {}
    for path, item in items:
        if not isinstance(item.get("audio"), dict):
            continue
        # Phonetic topic owned by one language: synthesise that voice only.
        owner = owners.get(str(item.get("topic", "")))
        changed = False
        for locale in LOCALES:
            if lang_filter and locale != lang_filter:
                continue
            if owner and locale != owner:
                continue
            text = item["names"].get(locale)
            if is_missing(text):
                skipped += 1
                continue
            tts_text = item.get("ttsText")
            if isinstance(tts_text, dict) and not is_missing(tts_text.get(locale)):
                text = tts_text[locale]
            output = audio_path_for(path, item["audio"].setdefault(locale, {}), locale)
            descriptor = item["audio"][locale]
            if output.is_file() and not overwrite:
                descriptor.update({
                    "file": output.relative_to(path.parent).as_posix(),
                    "status": "published",
                    "mime": "audio/mpeg",
                    "bytes": output.stat().st_size,
                    "sha1": file_sha1(output),
                })
                changed = True
                skipped += 1
                continue
            voice = voice_for(locale, item)
            if dry_run:
                print(
                    f"would generate: {path.relative_to(MEDIA_DIR).as_posix()} "
                    f"{locale} -> {display_media_path(output)} ({voice})"
                )
                generated += 1
                continue
            try:
                await synthesize(text.strip(), voice, output)
            except edge_tts.exceptions.NoAudioReceived as error:
                failed += 1
                print(
                    f"audio generation failed: {display_media_path(output)} "
                    f"({voice}): {error}",
                    file=sys.stderr,
                )
                continue
            descriptor.update({
                "file": output.relative_to(path.parent).as_posix(),
                "status": "published",
                "mime": "audio/mpeg",
                "bytes": output.stat().st_size,
                "sha1": file_sha1(output),
            })
            changed = True
            generated += 1
            print(f"generated: {display_media_path(output)} ({voice})")
        if changed and not dry_run:
            write_json_atomic(path, item)
    return generated, skipped, failed


FRONTMATTER_RE = re.compile(r"\A---\s*\r?\n.*?\r?\n---\s*(?:\r?\n|\Z)", re.DOTALL)


def article_text(track: str, topic: str, code: str, locale: str) -> str | None:
    """The article body for one locale, reduced to prose the TTS engine reads."""
    path = CONTENT_DIR / track / topic / code / f"{locale}.md"
    if not path.is_file():
        return None
    text = FRONTMATTER_RE.sub("", path.read_text(encoding="utf-8"))
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)  # images
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # links → their text
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)  # headings
    text = re.sub(r"[*_`>]+", "", text)  # emphasis / quotes / code marks
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() or None


async def apply_read(
    items,
    lang_filter: str | None,
    dry_run: bool,
    overwrite: bool,
    owners: dict[str, str] | None = None,
) -> tuple[int, int, int]:
    """Synthesize the full-article read (read/<locale>.mp3) from the content doc."""
    generated = 0
    skipped = 0
    failed = 0
    owners = owners or {}
    for path, item in items:
        track = str(item.get("track", ""))
        topic = str(item.get("topic", ""))
        code = str(item.get("code", ""))
        # Phonetic topic owned by one language: read that language's article only.
        owner = owners.get(topic)
        changed = False
        for locale in LOCALES:
            if lang_filter and locale != lang_filter:
                continue
            if owner and locale != owner:
                continue
            text = article_text(track, topic, code, locale)
            if is_missing(text):
                skipped += 1
                continue
            read_map = item.setdefault("read", {})
            if not isinstance(read_map, dict):
                raise ValueError(f"{path} must contain a 'read' object")
            output = audio_path_for(path, read_map.setdefault(locale, {}), locale, "read")
            descriptor = read_map[locale]
            if output.is_file() and not overwrite:
                descriptor.update({
                    "file": output.relative_to(path.parent).as_posix(),
                    "status": "published",
                    "mime": "audio/mpeg",
                    "bytes": output.stat().st_size,
                    "sha1": file_sha1(output),
                })
                changed = True
                skipped += 1
                continue
            voice = voice_for(locale, item)
            if dry_run:
                print(
                    f"would read: {path.relative_to(MEDIA_DIR).as_posix()} "
                    f"{locale} -> {display_media_path(output)} ({voice})"
                )
                generated += 1
                continue
            try:
                await synthesize(text, voice, output)
            except edge_tts.exceptions.NoAudioReceived as error:
                failed += 1
                print(
                    f"read generation failed: {display_media_path(output)} "
                    f"({voice}): {error}",
                    file=sys.stderr,
                )
                continue
            descriptor.update({
                "file": output.relative_to(path.parent).as_posix(),
                "status": "published",
                "mime": "audio/mpeg",
                "bytes": output.stat().st_size,
                "sha1": file_sha1(output),
            })
            changed = True
            generated += 1
            print(f"read: {display_media_path(output)} ({voice})")
        if changed and not dry_run:
            write_json_atomic(path, item)
    return generated, skipped, failed


def sidebar_paths(track_filter: str | None) -> list[Path]:
    """Sidebar files for the selected track(s) — the structure layer the UI
    renders chapter/topic names from (src/data/sidebars/library/<track>/sidebar.json)."""
    tracks = (track_filter,) if track_filter else TRACKS
    paths = []
    for track in tracks:
        path = SIDEBARS_DIR / "library" / track / "sidebar.json"
        if path.is_file():
            paths.append(path)
    return paths


def phonetic_source_langs(paths: list[Path]) -> dict[str, str]:
    """Topic code → the ONE language that owns its content (`sourceLang`).

    A phonetic topic teaches the sounds of a single target language: the German
    alphabet is not a translation of the Romanian one. Synthesising the other
    eight voices produces audio that media-index then discards, so the audio
    pass must generate exactly one voice per such topic.
    """
    owners: dict[str, str] = {}
    for path in paths:
        sidebar = json.loads(path.read_text(encoding="utf-8"))
        for section in sidebar.get("sections", []):
            for topic in section.get("topics", []):
                source = topic.get("sourceLang")
                if isinstance(source, str) and source:
                    owners[str(topic.get("code"))] = source
    return owners


def build_sidebar_jobs(paths: list[Path]):
    """One translation job per chapter and per topic whose `names` lack locales.

    Sidebars carry only `names` (no descriptions), so the job shape is the same
    as a manifest's names half. Keys are `<chapter>` / `<chapter>/<topic>` so a
    single sidebar's chapters and topics never collide.
    """
    jobs = []
    for path in paths:
        sidebar = json.loads(path.read_text(encoding="utf-8"))
        entries: list[tuple[str, dict[str, Any]]] = []
        for section in sidebar.get("sections", []):
            entries.append((str(section.get("code")), section))
            for topic in section.get("topics", []):
                entries.append((f"{section.get('code')}/{topic.get('code')}", topic))
        for key, entry in entries:
            names = entry.get("names")
            if not isinstance(names, dict):
                continue
            missing = [lang for lang in LOCALES if is_missing(names.get(lang))]
            if not missing:
                continue
            source = locale_source(names)
            if not source:
                continue
            source_lang, source_text = source
            targets = [lang for lang in missing if lang != source_lang]
            if not targets:
                continue
            jobs.append(
                (
                    path,
                    sidebar,
                    {
                        "key": key,
                        "kind": "sidebar",
                        "context": {"code": key, "track": sidebar.get("id")},
                        "names": {
                            "sourceLanguage": LANGUAGE_NAMES[source_lang],
                            "sourceText": source_text,
                            "targets": targets,
                        },
                        "description": None,
                        "generateDescription": False,
                    },
                )
            )
    return jobs


def apply_sidebar_translations(jobs, dry_run: bool) -> int:
    """Fill blank sidebar `names` locales, writing each sidebar once."""
    if dry_run:
        return len(jobs)
    changed = 0
    by_path: dict[Path, list[tuple[dict[str, Any], dict[str, Any]]]] = {}
    for path, sidebar, job in jobs:
        by_path.setdefault(path, []).append((sidebar, job))
    for path, entries in by_path.items():
        for offset in range(0, len(entries), BATCH_SIZE):
            chunk = entries[offset : offset + BATCH_SIZE]
            translated = gemini_translate_batch([job for _, job in chunk])
            for sidebar, job in chunk:
                result = translated[job["key"]]
                values = result.get("names", {})
                for locale in job["names"]["targets"]:
                    target = None
                    for section in sidebar.get("sections", []):
                        if str(section.get("code")) == job["key"]:
                            target = section
                            break
                        for topic in section.get("topics", []):
                            if f"{section.get('code')}/{topic.get('code')}" == job["key"]:
                                target = topic
                                break
                        if target:
                            break
                    if target is None:
                        continue
                    if is_missing(target["names"].get(locale)):
                        target["names"][locale] = values[locale].strip()
                        changed += 1
            print(f"translated sidebar batch {offset // BATCH_SIZE + 1} ({len(chunk)} entry(s))")
            time.sleep(1)
        write_json_atomic(path, sidebar)
    return changed


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--all", action="store_true", help="translate and generate audio")
    mode.add_argument("--translate", action="store_true", help="fill missing names/descriptions with Gemini")
    mode.add_argument("--audio", action="store_true", help="generate missing language audio")
    mode.add_argument("--read", action="store_true", help="generate missing full-article read audio from content docs")
    mode.add_argument("--sidebar", action="store_true", help="fill missing chapter/topic names in the sidebars (the structure the UI renders)")
    parser.add_argument("--track", choices=TRACKS, help="only this content track")
    parser.add_argument("--lang", choices=LOCALES, help="only this audio locale")
    parser.add_argument("--chapter", help="only this chapter code and its nested items (e.g. C1)")
    parser.add_argument("--topic", help="only this topic code")
    parser.add_argument("--id", help="only this item code (combined with --topic to disambiguate)")
    parser.add_argument("--kind", help="only items of this content kind")
    parser.add_argument("--apply", action="store_true", help="write translations and/or audio; otherwise report only")
    parser.add_argument("--overwrite-audio", action="store_true", help="regenerate audio even when its file exists")
    args = parser.parse_args()
    if args.overwrite_audio and not (args.audio or args.all or args.read):
        parser.error("--overwrite-audio requires --audio, --read, or --all")

    load_env()
    items = list(read_items(args.track))
    if args.chapter:
        items = [(path, item) for path, item in items if item.get("chapter") == args.chapter]
    if args.topic:
        items = [(path, item) for path, item in items if item.get("topic") == args.topic]
    if args.id:
        items = [(path, item) for path, item in items if item.get("code") == args.id]
    if args.kind:
        items = [(path, item) for path, item in items if item.get("kind") == args.kind]

    translate = args.all or args.translate
    generate_audio = args.all or args.audio
    generate_read = args.all or args.read
    translate_sidebar = args.sidebar

    if translate_sidebar:
        paths = sidebar_paths(args.track)
        sidebar_jobs = build_sidebar_jobs(paths)
        field_count = sum(len(job["names"]["targets"]) for _, _, job in sidebar_jobs)
        print(
            f"Sidebar translation plan: {len(sidebar_jobs)} chapter/topic entr(ies) "
            f"across {len(paths)} sidebar(s), {field_count} missing localized name(s)."
        )
        if not args.apply:
            print("Run with --apply to call Gemini and fill only blank names.")
        else:
            filled = apply_sidebar_translations(sidebar_jobs, dry_run=False)
            print(f"Filled {filled} sidebar name(s).")
        return

    jobs: list[tuple[Path, dict[str, Any], dict[str, Any]]] = []
    skipped_names = 0
    if translate:
        jobs, skipped_names = build_translation_jobs(items)
        field_count = sum(
            len((job.get("names") or {}).get("targets", []))
            + len((job.get("description") or {}).get("targets", []))
            for _, _, job in jobs
        )
        print(
            f"Translation plan: {len(jobs)} item(s), {field_count} missing localized "
            f"field(s); {skipped_names} name slot(s) lack a source translation."
        )
        if not args.apply:
            print("Run with --apply to call Gemini and fill only blank fields.")

    translated_fields = 0
    if translate and args.apply:
        translated_fields = apply_translations(jobs, dry_run=False)
        print(f"Filled {translated_fields} localized text field(s).")

    if generate_audio:
        if translate and args.apply:
            items = list(read_items(args.track))
            if args.chapter:
                items = [(path, item) for path, item in items if item.get("chapter") == args.chapter]
            if args.topic:
                items = [(path, item) for path, item in items if item.get("topic") == args.topic]
            if args.id:
                items = [(path, item) for path, item in items if item.get("code") == args.id]
            if args.kind:
                items = [(path, item) for path, item in items if item.get("kind") == args.kind]
        audio_count, skipped_audio, failed_audio = await apply_audio(
            items,
            args.lang,
            dry_run=not args.apply,
            overwrite=args.overwrite_audio,
            owners=phonetic_source_langs(sidebar_paths(args.track)),
        )
        verb = "Would generate" if not args.apply else "Generated"
        print(
            f"{verb} {audio_count} audio file(s); skipped {skipped_audio} "
            f"(existing audio or missing localized name); failed {failed_audio}."
        )
        if args.apply and audio_count:
            print("Audio descriptors were updated in item.json with file, bytes, SHA-1, and status.")

    if generate_read:
        read_count, skipped_read, failed_read = await apply_read(
            items,
            args.lang,
            dry_run=not args.apply,
            overwrite=args.overwrite_audio,
            owners=phonetic_source_langs(sidebar_paths(args.track)),
        )
        verb = "Would generate" if not args.apply else "Generated"
        print(
            f"{verb} {read_count} article read file(s); skipped {skipped_read} "
            f"(existing read or no article doc); failed {failed_read}."
        )
        if args.apply and read_count:
            print("Read descriptors were updated in item.json under 'read'.")

    if not translate and not generate_audio and not generate_read:
        gaps = sum(
            sum(is_missing(item["names"].get(locale)) for locale in LOCALES)
            + sum(is_missing(item["description"].get(locale)) for locale in LOCALES)
            for _, item in items
        )
        print(f"{len(items)} item(s) scanned; {gaps} missing name/description slot(s).")
        print("Choose --translate, --audio, --read, --sidebar, or --all. Add --apply to make changes.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
