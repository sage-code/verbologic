#!/usr/bin/env python3
"""Restructure per-language media manifests into shared, language-neutral items."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


TOPIC_RE = re.compile(r"^([CL]\d+)T\d+$")
CHAPTER_RE = re.compile(r"^[CL]\d+$")
FRONTMATTER_RE = re.compile(r"\A---\s*\r?\n(.*?)\r?\n---(?:\s*\r?\n|\Z)", re.DOTALL)
FIELD_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$")
LOCALE_FIELD_RE = re.compile(r"^\s{2}([A-Za-z]{2}):(?:\s+(.*))?$")

BASE_FIELDS = {
    "id",
    "lang",
    "kind",
    "term",
    "names",
    "ipa",
    "ttsText",
    "file",
    "key",
    "mime",
    "bytes",
    "sha1",
    "status",
    "entity_id",
    "legacy_entity_id",
    "tags",
}


@dataclass
class SourceManifest:
    path: Path
    locale: str
    topic: str
    chapter: str
    track: str
    data: dict[str, Any]
    audio_path: Path | None

    @property
    def code(self) -> str:
        return str(self.data["id"])

    @property
    def key(self) -> tuple[str, str, str, str]:
        return (self.track, self.chapter, self.topic, self.code)


@dataclass
class Item:
    track: str
    chapter: str
    topic: str
    code: str
    kind: str
    manifests: list[SourceManifest] = field(default_factory=list)
    names: dict[str, str] = field(default_factory=dict)
    descriptions: dict[str, str] = field(default_factory=dict)
    pronunciations: dict[str, dict[str, str]] = field(default_factory=dict)
    audio: dict[str, dict[str, Any]] = field(default_factory=dict)
    tags: set[str] = field(default_factory=set)
    metadata: dict[str, dict[str, Any]] = field(default_factory=lambda: defaultdict(dict))

    @property
    def key(self) -> tuple[str, str, str, str]:
        return (self.track, self.chapter, self.topic, self.code)


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] == '"':
        try:
            decoded = json.loads(value)
            if isinstance(decoded, str):
                return decoded
        except json.JSONDecodeError:
            pass
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1].replace("''", "'")
    return value


def parse_frontmatter(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}

    result: dict[str, Any] = {}
    current_map: str | None = None
    for line in match.group(1).splitlines():
        field_match = FIELD_RE.match(line)
        if field_match:
            key, raw_value = field_match.groups()
            if raw_value is None:
                result[key] = {}
                current_map = key
            else:
                result[key] = unquote(raw_value)
                current_map = None
            continue

        locale_match = LOCALE_FIELD_RE.match(line)
        if locale_match and current_map:
            key, raw_value = locale_match.groups()
            value = unquote(raw_value or "")
            result[current_map][key] = value
            continue

        if line.strip() and not line.startswith(" "):
            current_map = None

    return result


def read_descriptions(content_root: Path) -> dict[tuple[str, str, str], dict[str, Any]]:
    descriptions: dict[tuple[str, str, str], dict[str, Any]] = {}
    if not content_root.exists():
        return descriptions

    for path in content_root.rglob("*.md"):
        frontmatter = parse_frontmatter(path)
        topic = frontmatter.get("topic")
        code = frontmatter.get("article")
        locale = frontmatter.get("locale")
        if not all(isinstance(value, str) and value for value in (topic, code, locale)):
            continue

        key = (topic, code, locale)
        if key in descriptions:
            previous = descriptions[key].get("summary")
            current = frontmatter.get("summary")
            if previous != current:
                raise ValueError(f"Conflicting article summaries for {key}: {path}")
        else:
            descriptions[key] = frontmatter

    return descriptions


def topic_and_chapter(source_dir: Path, data: dict[str, Any]) -> tuple[str, str, str]:
    parent = source_dir.name
    code = data.get("id")
    kind = data.get("kind")

    if not isinstance(code, str) or not code:
        raise ValueError(f"Missing string id in {source_dir}")
    if not isinstance(kind, str) or not kind:
        raise ValueError(f"Missing string kind for {code} in {source_dir}")

    topic_match = TOPIC_RE.fullmatch(parent)
    if topic_match:
        chapter = topic_match.group(1)
        topic = parent
    elif CHAPTER_RE.fullmatch(parent):
        chapter = parent
        if kind == "chapter-title":
            topic = chapter
        elif kind == "topic-title" and TOPIC_RE.fullmatch(code):
            topic = code
        else:
            raise ValueError(f"Cannot determine topic for {code} in {source_dir}")
    else:
        raise ValueError(f"Unrecognized source folder {source_dir}")

    expected_track = "dictionary" if chapter.startswith("C") else "lectures"
    return expected_track, chapter, topic


def sha1_file(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_sources(audio_root: Path, locales: set[str]) -> list[SourceManifest]:
    sources: list[SourceManifest] = []
    for locale_dir in sorted(audio_root.iterdir()):
        if not locale_dir.is_dir() or locale_dir.name not in locales:
            continue
        locale = locale_dir.name
        for path in sorted(locale_dir.rglob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            track, chapter, topic = topic_and_chapter(path.parent, data)
            data_locale = data.get("lang")
            if data_locale != locale:
                raise ValueError(
                    f"Manifest locale mismatch in {path}: folder={locale}, lang={data_locale}"
                )

            filename = data.get("file")
            audio_path: Path | None = None
            if isinstance(filename, str) and filename:
                candidate = (path.parent / filename).resolve()
                if not candidate.is_relative_to(audio_root.resolve()):
                    raise ValueError(f"Audio path escapes media/audio: {path}: {filename}")
                audio_path = candidate if candidate.is_file() else None

            sources.append(
                SourceManifest(
                    path=path,
                    locale=locale,
                    topic=topic,
                    chapter=chapter,
                    track=track,
                    data=data,
                    audio_path=audio_path,
                )
            )
    return sources


def add_translation(item: Item, locale: str, value: Any, source: Path) -> None:
    if not isinstance(value, str) or not value:
        return
    previous = item.names.get(locale)
    if previous is not None and previous != value:
        raise ValueError(
            f"Conflicting {locale} names for {item.code}: {previous!r} vs {value!r} ({source})"
        )
    item.names[locale] = value


def build_items(
    sources: list[SourceManifest],
    locales: list[str],
    descriptions: dict[tuple[str, str, str], dict[str, Any]],
) -> dict[tuple[str, str, str, str], Item]:
    items: dict[tuple[str, str, str, str], Item] = {}
    occupied_audio: dict[tuple[tuple[str, str, str, str], str], Path] = {}

    for source in sources:
        item = items.setdefault(
            source.key,
            Item(
                track=source.track,
                chapter=source.chapter,
                topic=source.topic,
                code=source.code,
                kind=str(source.data["kind"]),
            ),
        )
        if item.kind != source.data["kind"]:
            raise ValueError(
                f"Conflicting kinds for {source.key}: {item.kind} vs {source.data['kind']}"
            )
        item.manifests.append(source)

        names = source.data.get("names", {})
        if isinstance(names, dict):
            for name_locale, name in names.items():
                if name_locale in locales:
                    add_translation(item, name_locale, name, source.path)
        add_translation(item, source.locale, source.data.get("term"), source.path)

        pronunciation = {
            key: source.data[key]
            for key in ("ipa", "ttsText")
            if isinstance(source.data.get(key), str) and source.data[key]
        }
        if pronunciation:
            item.pronunciations[source.locale] = pronunciation

        tags = source.data.get("tags")
        if isinstance(tags, list):
            item.tags.update(tag for tag in tags if isinstance(tag, str))

        audio_key = (item.key, source.locale)
        if audio_key in occupied_audio:
            raise ValueError(
                f"Multiple manifests for {item.key} and locale {source.locale}: "
                f"{occupied_audio[audio_key]} and {source.path}"
            )
        occupied_audio[audio_key] = source.path

        metadata = {
            key: value
            for key, value in source.data.items()
            if key not in BASE_FIELDS and value is not None
        }
        if metadata:
            item.metadata[source.locale].update(metadata)

        audio_entry: dict[str, Any] = {
            "file": f"sound/{source.locale}.mp3" if source.audio_path else None,
            "status": source.data.get("status", "pending"),
            "mime": source.data.get("mime", "audio/mpeg"),
            "bytes": source.audio_path.stat().st_size if source.audio_path else None,
            "sha1": sha1_file(source.audio_path) if source.audio_path else None,
        }
        item.audio[source.locale] = audio_entry

    for item in items.values():
        for locale in locales:
            article = descriptions.get((item.topic, item.code, locale), {})
            summary = article.get("summary")
            if isinstance(summary, str) and summary:
                item.descriptions[locale] = summary

            terms = article.get("terms", {})
            if isinstance(terms, dict):
                for name_locale, name in terms.items():
                    if name_locale in locales:
                        add_translation(item, name_locale, name, Path(f"content/{item.topic}/{item.code}/{locale}.md"))

    return items


def item_relative_path(item: Item) -> Path:
    base = Path(item.track) / item.chapter
    if item.kind == "chapter-title":
        return base
    if item.kind == "topic-title":
        return base / item.topic
    return base / item.topic / item.code


def serialize_item(item: Item, locales: list[str]) -> dict[str, Any]:
    return {
        "code": item.code,
        "track": item.track,
        "chapter": item.chapter,
        "topic": item.topic,
        "kind": item.kind,
        "names": {locale: item.names.get(locale) for locale in locales},
        "description": {locale: item.descriptions.get(locale) for locale in locales},
        "pronunciation": {
            locale: item.pronunciations.get(locale) for locale in locales
        },
        "audio": {
            locale: item.audio.get(
                locale,
                {
                    "file": None,
                    "status": "pending",
                    "mime": "audio/mpeg",
                    "bytes": None,
                    "sha1": None,
                },
            )
            for locale in locales
        },
        "tags": sorted(item.tags),
        "metadata": {locale: item.metadata[locale] for locale in locales if item.metadata[locale]},
    }


def create_plan(
    audio_root: Path,
    sources: list[SourceManifest],
    items: dict[tuple[str, str, str, str], Item],
    locales: list[str],
) -> tuple[dict[Path, dict[str, Any]], dict[Path, Path]]:
    manifests: dict[Path, dict[str, Any]] = {}
    audio_files: dict[Path, Path] = {}

    for item in items.values():
        item_dir = audio_root / item_relative_path(item)
        manifest_path = item_dir / "item.json"
        if manifest_path in manifests:
            raise ValueError(f"Destination manifest collision: {manifest_path}")
        manifests[manifest_path] = serialize_item(item, locales)

        for source in item.manifests:
            if not source.audio_path:
                if source.data.get("status") == "published":
                    print(
                        f"WARNING: published audio missing on disk: {source.path}",
                        file=sys.stderr,
                    )
                continue
            target = item_dir / "sound" / f"{source.locale}.mp3"
            if target in audio_files:
                raise ValueError(f"Destination audio collision: {target}")
            audio_files[target] = source.audio_path

    return manifests, audio_files


def validate_destinations(
    audio_root: Path, manifests: dict[Path, dict[str, Any]], audio_files: dict[Path, Path]
) -> None:
    tracks = {path.relative_to(audio_root).parts[0] for path in manifests}
    for track in tracks:
        destination = audio_root / track
        if destination.exists():
            raise FileExistsError(
                f"Target tree already exists: {destination}. "
                "Move it aside before running a fresh migration."
            )

    for target, source in audio_files.items():
        if not source.is_file():
            raise FileNotFoundError(f"Source audio disappeared: {source} (target {target})")


def apply_plan(
    audio_root: Path,
    manifests: dict[Path, dict[str, Any]],
    audio_files: dict[Path, Path],
    sources: list[SourceManifest],
) -> None:
    validate_destinations(audio_root, manifests, audio_files)
    tracks = {path.relative_to(audio_root).parts[0] for path in manifests}
    with tempfile.TemporaryDirectory(prefix=".media-reorganize-", dir=audio_root) as temporary:
        staging_root = Path(temporary)
        staged_manifests: dict[Path, Path] = {}
        staged_audio: dict[Path, Path] = {}

        for target, data in manifests.items():
            staged = staging_root / target.relative_to(audio_root)
            staged.parent.mkdir(parents=True, exist_ok=True)
            staged.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            staged_manifests[target] = staged

        for target, source in audio_files.items():
            staged = staging_root / target.relative_to(audio_root)
            staged.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, staged)
            if sha1_file(source) != sha1_file(staged):
                raise IOError(f"Audio verification failed after copy: {source} -> {staged}")
            staged_audio[target] = staged

        for target, staged in staged_manifests.items():
            parsed = json.loads(staged.read_text(encoding="utf-8"))
            if parsed["code"] != target.parent.name:
                raise IOError(f"Manifest verification failed: {staged}")

        for track in sorted(tracks):
            staged_track = staging_root / track
            destination = audio_root / track
            destination.parent.mkdir(parents=True, exist_ok=True)
            staged_track.replace(destination)

    # Remove legacy inputs only after every new manifest and recording is verified.
    referenced_audio = {source.audio_path for source in sources if source.audio_path}
    for source in sources:
        source.path.unlink()
    for audio_path in referenced_audio:
        if audio_path.exists():
            audio_path.unlink()

    for source_dir in sorted(
        {source.path.parent for source in sources}, key=lambda path: len(path.parts), reverse=True
    ):
        current = source_dir
        while current != audio_root and current.is_relative_to(audio_root):
            try:
                current.rmdir()
            except OSError:
                break
            current = current.parent


def title_flatten_plan(audio_root: Path) -> dict[Path, Path]:
    moves: dict[Path, Path] = {}
    for manifest_path in audio_root.rglob("item.json"):
        try:
            item = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid item manifest: {manifest_path}: {error}") from error

        kind = item.get("kind")
        if kind not in {"chapter-title", "topic-title"}:
            continue

        base = audio_root / str(item["track"]) / str(item["chapter"])
        destination = base if kind == "chapter-title" else base / str(item["topic"])
        if manifest_path.parent == destination:
            continue
        if manifest_path.parent != destination / str(item["code"]):
            raise ValueError(
                f"Unexpected title manifest location: {manifest_path}; expected "
                f"{destination / str(item['code']) / 'item.json'}"
            )

        for source in manifest_path.parent.rglob("*"):
            if not source.is_file():
                continue
            target = destination / source.relative_to(manifest_path.parent)
            if target in moves:
                raise ValueError(f"Duplicate title destination: {target}")
            if target.exists():
                raise FileExistsError(f"Title destination already exists: {target}")
            moves[source] = target

    return moves


def flatten_titles(audio_root: Path, apply: bool) -> int:
    moves = title_flatten_plan(audio_root)
    print(f"Title files to move: {len(moves)}")
    for source, target in sorted(moves.items()):
        print(f"  {source.relative_to(audio_root)} -> {target.relative_to(audio_root)}")
    if not apply:
        print("Dry run only. Re-run with --apply --flatten-titles to move files.")
        return len(moves)

    for source, target in moves.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        source.replace(target)
        if not target.is_file():
            raise IOError(f"Title file move verification failed: {target}")

    for directory in sorted(
        {source.parent for source in moves},
        key=lambda path: len(path.parts),
        reverse=True,
    ):
        current = directory
        while current != audio_root and current.is_relative_to(audio_root):
            try:
                current.rmdir()
            except OSError:
                break
            current = current.parent

    return len(moves)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repository root (defaults to the parent of scripts/)",
    )
    parser.add_argument("--apply", action="store_true", help="write the new layout and remove legacy files")
    parser.add_argument(
        "--flatten-titles",
        action="store_true",
        help="move chapter/topic title manifests and sound files out of redundant code folders",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    audio_root = root / "media" / "audio"
    if not audio_root.is_dir():
        parser.error(f"media audio directory not found: {audio_root}")
    if args.flatten_titles:
        moved = flatten_titles(audio_root, args.apply)
        print(f"Title flattening {'completed' if args.apply else 'planned'}: {moved} files.")
        return 0

    language_file = root / "src" / "data" / "language-names.json"
    if not language_file.is_file():
        parser.error(f"language registry not found: {language_file}")

    locales = list(json.loads(language_file.read_text(encoding="utf-8")).keys())
    sources = read_sources(audio_root, set(locales))
    if not sources:
        parser.error("no legacy language/topic manifests found")

    descriptions = read_descriptions(root / "content")
    items = build_items(sources, locales, descriptions)
    manifests, audio_files = create_plan(audio_root, sources, items, locales)
    validate_destinations(audio_root, manifests, audio_files)

    missing_names = sum(
        not item.names.get(locale) for item in items.values() for locale in locales
    )
    missing_descriptions = sum(
        not item.descriptions.get(locale) for item in items.values() for locale in locales
    )
    missing_audio = sum(
        item.audio.get(locale, {}).get("file") is None
        for item in items.values()
        for locale in locales
    )
    print(f"Source manifests: {len(sources)}")
    print(f"Shared item records: {len(items)}")
    print(f"New item.json files: {len(manifests)}")
    print(f"Audio files to copy: {len(audio_files)}")
    print(f"Missing localized names: {missing_names}")
    print(f"Missing localized descriptions: {missing_descriptions}")
    print(f"Missing localized audio files: {missing_audio}")
    for locale in locales:
        absent_names = sum(not item.names.get(locale) for item in items.values())
        absent_descriptions = sum(
            not item.descriptions.get(locale) for item in items.values()
        )
        absent_audio = sum(
            item.audio.get(locale, {}).get("file") is None for item in items.values()
        )
        print(
            f"  {locale}: names missing={absent_names}, "
            f"descriptions missing={absent_descriptions}, audio missing={absent_audio}"
        )
    if not args.apply:
        print("Dry run only. Re-run with --apply to migrate files.")
        return 0

    apply_plan(audio_root, manifests, audio_files, sources)
    print("Migration completed and verified.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
