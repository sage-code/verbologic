"""Scaffold the media repository skeleton (binary folders + readme placeholders).

Three-layer content model (see media/readme.md):
  1. Sidebars (structure)   — src/data/sidebars/…/sidebar.json (build-inlined; NOT scaffolded here)
  2. Media (repository)   — media files, each with its own sibling <ID>.json manifest
  3. Location config        — src/data/media.config.json (R2 root + section → path)

This script creates only the repository's binary folder skeleton: one folder per
configured section path (from src/data/media.config.json), with `audio/`
partitioned one subfolder per UI locale. Folders are kept visible to Git by a
one-line readme.md placeholder. Idempotent: existing files are never overwritten.

Run from the repo root:  .venv/Scripts/python.exe scripts/scaffold-media.py
Add --dry-run to print the plan without touching the disk.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media"
CONFIG = ROOT / "src" / "data" / "media.config.json"
NAVIGATION = ROOT / "src" / "data" / "navigation.json"

LANGUAGE_PARTITIONED = ("audio",)  # only audio gets one subfolder per UI locale
PLACEHOLDER = "readme.md"


def languages() -> list[str]:
    """Lowercase UI locale codes from the single source of truth.

    Reads `locale`, never `code` — the two differ for Spanish ("SP" vs "es").
    """
    data = json.loads(NAVIGATION.read_text(encoding="utf-8"))
    return [entry["locale"] for entry in data["languages"]]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create the media repository skeleton (binary folders + readme placeholders)."
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="print the plan without writing anything"
    )
    args = parser.parse_args()

    if not CONFIG.exists():
        parser.error("src/data/media.config.json is missing — it maps sections to R2 paths")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    section_paths = sorted({path.rstrip("/") for path in config.get("sections", {}).values()})
    locales = languages()

    created = kept = 0

    def create(folder: Path, line: str) -> None:
        nonlocal created, kept
        target = folder / PLACEHOLDER
        label = f"{target.relative_to(ROOT).as_posix()}  ({line.strip()})"
        if args.dry_run:
            print(f"{'kept' if target.exists() else 'create':>6}: {label}")
            return
        folder.mkdir(parents=True, exist_ok=True)
        if target.exists():
            kept += 1
            return
        target.write_text(line, encoding="utf-8")
        created += 1
        print(f"create: {label}")

    for section_path in section_paths:
        media = section_path.split("/")[-1]
        if media in LANGUAGE_PARTITIONED:
            for lang in locales:
                create(MEDIA / section_path / lang, f"{lang} {media} files")
        else:
            create(MEDIA / section_path, f"{media} files")

    if not args.dry_run:
        print(f"done: {created} created, {kept} kept (existing files are never overwritten)")


if __name__ == "__main__":
    main()