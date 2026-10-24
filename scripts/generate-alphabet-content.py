"""Author comprehensive alphabet articles for every language with Gemini.

The alphabet data files (src/data/alphabets/<lang>.json) are the authoring
surface for the phonetic topics: the manifests and the article pages are both
DERIVED from them (see src/types/phonetic.ts). This script fills the fields the
articles need but that were never authored:

  exampleIpa          IPA of the example word
  exampleTranslation  the example word's meaning, per UI locale
  variations[]        the letter's pronunciation variants, each with its own
                      IPA, the context it occurs in, and example words
  sections{}          the four article sections per UI locale
                      (sound · howToSay · spelling · compare)

Existing values are never overwritten unless --overwrite is passed, so the
script is safe to re-run as content grows.

Examples:
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --lang ro
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --all --apply
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --lang de --apply --overwrite
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
ALPHABETS = ROOT / "src" / "data" / "alphabets"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.locales import LOCALES  # noqa: E402  (single locale registry)

LANGUAGE_NAMES = {
    "en": "English",
    "ro": "Romanian",
    "de": "German",
    "ru": "Russian",
    "it": "Italian",
    "es": "Spanish (Spain)",
    "fr": "French (France)",
    "hu": "Hungarian",
    "pt": "European Portuguese",
}
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "models/gemini-3.8-flash"
BATCH_SIZE = 1
#: Parallel Gemini calls. Each call is one entry x one locale group; the API
#: tolerates this comfortably and it turns a ~9h sequential run into ~1h.
CONCURRENCY = 8
SECTION_KEYS = ("sound", "howToSay", "spelling", "compare")
# Four sections x nine locales of real prose is ~14k characters, which sits
# right at the model's output ceiling and truncates intermittently. Sections
# are therefore requested in locale groups; the metadata half (example IPA,
# translations, variations) is small enough to ask for in one go.
LOCALE_GROUPS = (("en", "ro", "de"), ("ru", "it", "es"), ("fr", "hu", "pt"))


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


def normalize_model(model: str) -> str:
    model = model.strip()
    if model.endswith("-light"):
        model = f"{model[:-len('-light')]}-lite"
    return model if model.startswith("models/") else f"models/{model}"


def is_missing(value: Any) -> bool:
    return not isinstance(value, str) or not value.strip()


def alphabet_path(lang: str) -> Path:
    return ALPHABETS / f"{lang}.json"


def load_alphabet(lang: str) -> dict[str, Any]:
    return json.loads(alphabet_path(lang).read_text(encoding="utf-8"))


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def entries_of(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [*(data.get("letters") or []), *(data.get("groups") or [])]


def pending_entries(data: dict[str, Any], overwrite: bool) -> list[dict[str, Any]]:
    """Entries that still need authored content (including partial ones)."""
    out = []
    for entry in entries_of(data):
        if overwrite:
            out.append(entry)
            continue
        needs = (
            is_missing(entry.get("example"))
            or is_missing(entry.get("exampleIpa"))
            or not entry.get("exampleTranslation")
            or not entry.get("variations")
            or not entry.get("sections")
            # A run that lost a call leaves some locale groups empty; those
            # entries are still pending even though `sections` exists.
            or incomplete_locales(entry)
        )
        if needs:
            out.append(entry)
    return out


def incomplete_locales(entry: dict[str, Any]) -> tuple[str, ...]:
    """The locale groups an entry is still missing sections for."""
    have = set((entry.get("sections") or {}).keys())
    return tuple(
        group for group in LOCALE_GROUPS if not set(group).issubset(have)
    )


def build_request(entry: dict[str, Any], lang: str) -> dict[str, Any]:
    """The per-entry payload sent to Gemini (kept small and factual)."""
    return {
        "code": entry.get("code"),
        "glyph": entry.get("glyph"),
        "ipa": entry.get("ipa"),
        "letterName": entry.get("letterName"),
        "example": entry.get("example"),
        "existingNote": (entry.get("note") or {}).get("en"),
    }


def prompt_for(batch: list[dict[str, Any]], lang: str, locales: tuple[str, ...]) -> str:
    language = LANGUAGE_NAMES[lang]
    return (
        f"You are an expert {language} teacher and phonetician writing the "
        f"alphabet articles for a language-learning site. The target language "
        f"is {language}. For EACH entry below, produce:\n\n"
        "1. `example`: a common, concrete example word in the target language "
        "that STARTS WITH this letter (or contains this group), and "
        "`exampleIpa`: its IPA in slashes, with the stressed syllable marked "
        "(e.g. /ˈa.pfel/).\n"
        "2. `exampleTranslation`: the example word's meaning in EVERY one of "
        f"these explanation languages: {', '.join(locales)}. One short gloss "
        "each (1-3 words), not a sentence.\n"
        "3. `variations`: the letter's real pronunciation variants in "
        f"{language}, most common first. Each variant is an object with "
        "`ipa` (slashes), `when` (a short phrase in English naming the context, "
        "e.g. 'in an open stressed syllable'), and `examples` (1-2 objects of "
        "`word` + `ipa`, real words in the target language). Give 1-4 variants. "
        "If the letter has only one sound, give exactly one variant.\n"
        "4. `sections`: an object keyed by explanation locale "
        f"({', '.join(locales)}). Each value has four keys:\n"
        "   - `sound`: {title, text} — what the letter sounds like, its IPA, "
        "and how it differs from the nearest sound in the learner's language.\n"
        "   - `howToSay`: {title, text} — mouth/tongue/lips instructions a "
        "learner can follow.\n"
        "   - `spelling`: {title, text} — how the letter is written and how it "
        "behaves in words (position, capitalisation, common spellings).\n"
        "   - `compare`: {title, text} — the pronunciation variants and the "
        "words that show them, plus a warning about the mistakes learners make.\n"
        "   Write each `text` as 2-4 full sentences of genuinely useful prose "
        "in that explanation language. Do NOT just restate the IPA. Use "
        "`**bold**` for emphasis and backticks for IPA inline. Never leave a "
        "locale out.\n\n"
        "Return ONLY JSON of the shape "
        '{"items":[{"code":"L001","example":"...","exampleIpa":"/.../",'
        '"exampleTranslation":{"en":"..."},"variations":[...],"sections":{...}}]}. '
        "Include every entry exactly once, in the order given, and no commentary.\n\n"
        f"ENTRIES:\n{json.dumps(batch, ensure_ascii=False)}"
    )


def call_gemini(
    batch: list[dict[str, Any]], lang: str, locales: tuple[str, ...]
) -> dict[str, dict[str, Any]]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required (set it in .env).")

    payload = {
        "contents": [{"parts": [{"text": prompt_for(batch, lang, locales)}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
            # These responses are large (4 sections x 3 locales per entry), so
            # the default cap truncates the JSON mid-string.
            "maxOutputTokens": 16384,
            # Gemini 3.x spends output tokens on internal reasoning by default,
            # which eats the budget before the JSON is complete.
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    model = normalize_model(os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL)
    endpoint = (
        f"{GEMINI_API_URL}/{urllib.parse.quote(model, safe='/')}:generateContent?"
        f"{urllib.parse.urlencode({'key': api_key})}"
    )
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                body = json.loads(response.read().decode("utf-8"))
            text = body["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"\A```(?:json)?\s*|\s*```\Z", "", text)
            result = json.loads(text)
            items = result if isinstance(result, list) else result.get("items")
            if not isinstance(items, list):
                raise ValueError("Gemini returned JSON without an items array")
            by_code: dict[str, dict[str, Any]] = {}
            for item in items:
                code = item.get("code")
                if not isinstance(code, str) or code in by_code:
                    raise ValueError("Gemini returned a missing or duplicate code")
                by_code[code] = item
            expected = {entry["code"] for entry in batch}
            if not set(by_code).issubset(expected):
                raise ValueError(f"unexpected codes: {sorted(set(by_code) - expected)}")
            return by_code
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code < 600
            detail = error.read().decode("utf-8", errors="replace")[:400]
            if not retryable or attempt == 3:
                raise RuntimeError(f"Gemini HTTP {error.code}: {detail}") from error
        except urllib.error.URLError as error:
            if attempt == 3:
                raise RuntimeError(f"Gemini connection failed: {error.reason}") from error
        except TimeoutError as error:
            if attempt == 3:
                raise RuntimeError("Gemini request timed out") from error
        except (KeyError, IndexError, json.JSONDecodeError, ValueError) as error:
            if attempt == 3:
                raise RuntimeError(f"Invalid Gemini response: {error}") from error
        time.sleep(2**attempt)
    raise RuntimeError("Gemini generation failed after retries")


def apply_result(
    entry: dict[str, Any], result: dict[str, Any], overwrite: bool, locales: tuple[str, ...]
) -> int:
    """Merge one Gemini result into an entry. Returns the number of fields set."""
    changed = 0

    example_ipa = result.get("exampleIpa")
    if isinstance(example_ipa, str) and example_ipa.strip() and (overwrite or is_missing(entry.get("exampleIpa"))):
        entry["exampleIpa"] = example_ipa.strip()
        changed += 1

    example = result.get("example")
    if isinstance(example, str) and example.strip() and (overwrite or is_missing(entry.get("example"))):
        entry["example"] = example.strip()
        changed += 1

    translations = result.get("exampleTranslation")
    if isinstance(translations, dict):
        current = entry.get("exampleTranslation") or {}
        merged = dict(current)
        for locale in locales:
            value = translations.get(locale)
            if isinstance(value, str) and value.strip() and (overwrite or is_missing(merged.get(locale))):
                merged[locale] = value.strip()
                changed += 1
        if merged:
            entry["exampleTranslation"] = merged

    variations = result.get("variations")
    if isinstance(variations, list) and variations and (overwrite or not entry.get("variations")):
        cleaned = []
        for variant in variations:
            if not isinstance(variant, dict):
                continue
            ipa = variant.get("ipa")
            when = variant.get("when")
            if not isinstance(ipa, str) or not ipa.strip():
                continue
            examples = []
            for example in variant.get("examples") or []:
                if not isinstance(example, dict):
                    continue
                word = example.get("word")
                word_ipa = example.get("ipa")
                if isinstance(word, str) and word.strip():
                    examples.append(
                        {"word": word.strip(), "ipa": (word_ipa or "").strip()}
                    )
            cleaned.append(
                {
                    "ipa": ipa.strip(),
                    "when": (when or "").strip(),
                    "examples": examples,
                }
            )
        if cleaned:
            entry["variations"] = cleaned
            changed += 1

    sections = result.get("sections")
    if isinstance(sections, dict):
        current = entry.get("sections") or {}
        merged = dict(current)
        for locale in locales:
            value = sections.get(locale)
            if not isinstance(value, dict):
                continue
            row = {}
            for key in SECTION_KEYS:
                section = value.get(key)
                if not isinstance(section, dict):
                    continue
                text = section.get("text")
                if not isinstance(text, str) or not text.strip():
                    continue
                row[key] = {
                    "title": (section.get("title") or "").strip(),
                    "text": text.strip(),
                }
            if row and (overwrite or not merged.get(locale)):
                merged[locale] = row
                changed += 1
        if merged:
            entry["sections"] = merged

    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lang", choices=LOCALES, help="only this target language")
    parser.add_argument("--all", action="store_true", help="every language with an alphabet file")
    parser.add_argument("--apply", action="store_true", help="write the generated content")
    parser.add_argument("--overwrite", action="store_true", help="replace existing content")
    args = parser.parse_args()

    load_env()
    langs = [args.lang] if args.lang else sorted(p.stem for p in ALPHABETS.glob("*.json"))
    if not args.lang and not args.all:
        parser.error("choose --lang <code> or --all")

    grand_total = 0
    for lang in langs:
        data = load_alphabet(lang)
        pending = pending_entries(data, args.overwrite)
        print(f"{lang}: {len(entries_of(data))} entries, {len(pending)} need content")
        if not pending:
            continue
        if not args.apply:
            for entry in pending:
                print(f"  would author: {entry.get('code')} {entry.get('glyph')!r}")
            continue

        changed = 0
        # Each (entry, locale-group) pair is an independent Gemini call, so they
        # run concurrently: 363 entries x 3 groups is ~1100 calls, which is
        # hours of wall time sequentially. The pool is small enough to stay
        # under the API's rate limit.
        jobs = [
            (entry, locales)
            for entry in pending
            # An entry missing only its example word still needs one call; fall
            # back to the first group so the job list is never empty.
            for locales in (incomplete_locales(entry) or (LOCALE_GROUPS[0],))
        ]
        total_jobs = len(jobs)
        completed = 0
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            futures = {
                pool.submit(call_gemini, [build_request(entry, lang)], lang, locales): (entry, locales)
                for entry, locales in jobs
            }
            for future in as_completed(futures):
                entry, locales = futures[future]
                completed += 1
                try:
                    results = future.result()
                except RuntimeError as error:
                    print(
                        f"  skipping {entry.get('code')} [{locales[0]}/{locales[-1]}]: {error}",
                        file=sys.stderr,
                    )
                    continue
                result = results.get(entry["code"])
                if result:
                    changed += apply_result(entry, result, args.overwrite, locales)
                if completed % 10 == 0 or completed == total_jobs:
                    write_json_atomic(alphabet_path(lang), data)
                    print(
                        f"  {completed}/{total_jobs} call(s) done, {changed} field(s) written",
                        flush=True,
                    )
        write_json_atomic(alphabet_path(lang), data)
        grand_total += changed
        print(f"{lang}: wrote {changed} field(s)")

    if args.apply:
        print(f"Done — {grand_total} field(s) written.")
    else:
        print("Run with --apply to call Gemini and write the content.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
