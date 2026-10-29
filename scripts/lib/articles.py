"""Article files for Python scripts: the twin of scripts/lib/articles.mjs.

One JSON per story or lecture item, every language inside:

    content/stories/<TOPIC>/<CODE>.json
    content/lectures/<TOPIC>/<ID>.json

The canonical form is shared with the Node writer and must stay byte-identical
to it (planning/content-in-database.md section 5): 2-space indentation, final
newline, LF line endings, keys in a fixed order, non-ASCII text left readable.
`scripts/check-articles.mjs` compares the two writers on every file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from locales import LOCALES  # noqa: E402

ARTICLE_KEYS = [
    "entity_id", "targets", "order", "minutes", "paragraphsPerPage",
    "terms", "related", "video", "image", "context", "locales",
]
LOCALE_KEYS = ["title", "summary", "status", "sourceSha", "reviewedAt", "sections", "paragraphs"]


def _rank(keys: list[str] | tuple[str, ...]):
    def key(name: str) -> tuple[int, str]:
        return (keys.index(name), "") if name in keys else (len(keys), name)

    return key


def canonicalize(article: dict[str, Any]) -> dict[str, Any]:
    """Reorder an article into canonical key order (no value changes)."""
    out: dict[str, Any] = {}
    for name in sorted(article, key=_rank(ARTICLE_KEYS)):
        if name != "locales":
            out[name] = article[name]
            continue
        locales: dict[str, Any] = {}
        for code in sorted(article["locales"], key=_rank(LOCALES)):
            doc = article["locales"][code]
            locales[code] = {k: doc[k] for k in sorted(doc, key=_rank(LOCALE_KEYS))}
        out["locales"] = locales
    return out


def serialize(article: dict[str, Any]) -> str:
    """The exact text of an article file."""
    return json.dumps(canonicalize(article), indent=2, ensure_ascii=False) + "\n"


def read_article(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_article(path: Path, article: dict[str, Any]) -> bool:
    """Write an article in canonical form; False when the file was already up to date."""
    text = serialize(article)
    if path.exists() and path.read_bytes() == text.encode("utf-8"):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    # newline="" keeps LF on Windows: text mode would turn it into CRLF.
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(text)
    return True


def article_path(content_root: Path, track: str, topic: str, item_id: str) -> Path:
    return content_root / track / topic / f"{item_id}.json"
