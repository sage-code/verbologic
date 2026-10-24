"""Manifest accessors for the `locales` + `files` shape.

Mirrors scripts/lib/manifest.mjs. planning/performance-and-content-refactor.md
§21: an item.json carries

    locales: { <locale>: { name, description, ipa, ttsText, example, context } }
    files:   { "<folder>/<locale>.mp3": { bytes, sha1 } }

`locales` is keyed by locale — one self-contained row each. `files` is keyed by
path and holds only the two facts that cannot be derived; a file's presence IS
its published status.
"""

from __future__ import annotations

from typing import Any

#: Manifest field -> the folder its files live in.
FOLDER = {"audio": "sound", "read": "read"}


def file_path(field: str, locale: str) -> str:
    """The path a field's file for one locale lives at, relative to the item dir."""
    return f"{FOLDER[field]}/{locale}.mp3"


def locale_row(item: dict[str, Any], locale: str) -> dict[str, Any]:
    """The locale row, or an empty dict when the locale has no content."""
    return (item.get("locales") or {}).get(locale) or {}


def name_of(item: dict[str, Any], locale: str) -> str | None:
    """A locale's display name (the old ``names[locale]``)."""
    return locale_row(item, locale).get("name")


def tts_text_of(item: dict[str, Any], locale: str) -> str | None:
    """The TTS respelling for one locale, if the manifest carries one."""
    return locale_row(item, locale).get("ttsText")


def file_facts(item: dict[str, Any], field: str, locale: str) -> dict[str, Any] | None:
    """The file facts for one field+locale, or None when the file is pending."""
    return (item.get("files") or {}).get(file_path(field, locale))


def is_published(item: dict[str, Any], field: str, locale: str) -> bool:
    """True when the field's file for this locale has been published."""
    return file_facts(item, field, locale) is not None


def set_file_facts(
    item: dict[str, Any], field: str, locale: str, *, bytes_: int, sha1: str
) -> None:
    """Record a published file."""
    item.setdefault("files", {})[file_path(field, locale)] = {
        "bytes": bytes_,
        "sha1": sha1,
    }


def clear_file_facts(item: dict[str, Any], field: str, locale: str) -> None:
    """Drop a file (back to pending)."""
    files = item.get("files")
    if files:
        files.pop(file_path(field, locale), None)


def set_locale_field(
    item: dict[str, Any], locale: str, field: str, value: Any
) -> None:
    """Set one locale field, creating the row when needed. Empty values are dropped."""
    if value is None or value == "":
        row = (item.get("locales") or {}).get(locale)
        if row:
            row.pop(field, None)
            if not row:
                item["locales"].pop(locale, None)
        return
    item.setdefault("locales", {}).setdefault(locale, {})[field] = value
