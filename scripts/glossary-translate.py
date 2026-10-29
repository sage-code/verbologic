#!/usr/bin/env python
"""glossary-translate.py - step 2 of the glossary: Gemini translates the English terms.

    python scripts/glossary-translate.py [--lang xx] [--redo]

Fills `locales.<xx> = {text, status: "draft"}` for every term that has none.
`checked` entries are never touched, even with --redo (that re-asks only drafts).
Step 3 is a review by hand: change `draft` to `checked` where the term is right.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
import glossary  # noqa: E402

_spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
_stories = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_stories)

LANGS = {"es": "Spanish", "it": "Italian", "fr": "French", "de": "German", "ru": "Russian",
         "hu": "Hungarian", "pt": "Portuguese", "ro": "Romanian"}
BATCH = 25


def prompt(language: str, terms: list[dict]) -> str:
    rows = "\n".join(f'{t["id"]} | {t["en"]} | {t["define"]}' for t in terms)
    return f"""You translate technical terms of the International Phonetic Alphabet (IPA) chart into {language}.
Give, for each row, the standard term that a {language} phonetics textbook or school book uses.
Rules:
- Use the established {language} phonetics term. Do not invent a word and do not copy the English word
  unless {language} phonetics really uses it.
- Use the normal dictionary form (singular, lower case; for an adjective, the masculine singular form).
- If the standard term is a short phrase, give the phrase.
- If you are not sure of the standard term, give your best choice and add the id to "unsure".
Rows (id | English | meaning):
{rows}

Return one JSON object: {{"terms": {{"<id>": "<{language} term>"}}, "unsure": ["<id>"]}}"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang")
    parser.add_argument("--redo", action="store_true", help="ask again for drafts")
    args = parser.parse_args()
    _stories.load_env()
    model = os.environ.get("GEMINI_MODEL") or _stories.DEFAULT_GEMINI_MODEL
    data = json.loads(glossary.PATH.read_text(encoding="utf-8"))
    for code, language in LANGS.items():
        if args.lang and args.lang != code:
            continue
        todo = [t for t in data["terms"]
                if code not in t.get("locales", {}) or (args.redo and t["locales"][code]["status"] == "draft")]
        for start in range(0, len(todo), BATCH):
            batch = todo[start:start + BATCH]
            result = _stories.gemini_json(prompt(language, batch), 0.2, model)
            unsure = set(result.get("unsure", []))
            for term in batch:
                text = str(result.get("terms", {}).get(term["id"], "")).strip()
                if not text:
                    continue
                entry = {"text": text, "status": "draft"}
                if term["id"] in unsure:
                    entry["unsure"] = True
                term.setdefault("locales", {})[code] = entry
            print(f"{code}: {min(start + BATCH, len(todo))}/{len(todo)}")
    glossary.PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
