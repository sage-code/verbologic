"""Locale registry loader for Python scripts.

Reads src/data/navigation.json — the single source of truth for the set of
interface languages — so no script re-declares the list. Mirrors
src/data/locales.ts (Vue/TS) and scripts/lib/locales.mjs (Node).
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_NAVIGATION = ROOT / "src" / "data" / "navigation.json"

#: Every registered interface language, in navigation.json order.
LOCALE_ENTRIES: list[dict] = json.loads(_NAVIGATION.read_text(encoding="utf-8"))["languages"]

#: Lowercase locale codes, in navigation.json order.
LOCALES: tuple[str, ...] = tuple(entry["locale"] for entry in LOCALE_ENTRIES)

#: The fallback locale — canonical language for shared article prose.
DEFAULT_LOCALE = "en"


def is_locale(value: object) -> bool:
    """True when ``value`` is a registered locale code."""
    return isinstance(value, str) and value in LOCALES
