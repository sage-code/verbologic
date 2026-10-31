#!/usr/bin/env python
"""verify-alphabet-glosses.py - check the meanings an alphabet article states.

The writing validator only proves that a `(word) /ipa/` pair matches the entry's facts.
It cannot tell whether the sentence around it says the right MEANING ("(urs) /urs/, which
means one"). This script asks Gemini, in separate requests from the ones that wrote the
pages, to judge every sentence that names a target-language word, in every page language,
and compares the main example with the stored translation (`exampleTranslation`).

    verify-alphabet-glosses.py --lang ro [--locales en,de] [--code L015,L025] [--json out.json]

Report only: nothing is written to the alphabet files. Exit code 1 when a wrong meaning is found.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]
PAIR = re.compile(r"\(([^()/\n]+)\)\s*(/[^/\n]+/)")
LANGUAGES = {"en": "English", "ro": "Romanian", "de": "German", "ru": "Russian", "it": "Italian",
             "es": "Spanish", "fr": "French", "hu": "Hungarian", "pt": "Portuguese"}
BATCH = 40


def load_gemini():
    spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.load_env()
    return module.gemini_json, os.environ.get("GEMINI_MODEL") or module.DEFAULT_GEMINI_MODEL


def sentences_with_words(entry: dict[str, Any], locales: list[str]) -> list[dict[str, Any]]:
    rows = []
    for locale in locales:
        for key, page in ((entry.get("sections") or {}).get(locale) or {}).items():
            for sentence in re.split(r"(?<=[.!?])\s+", str(page.get("text", ""))):
                for word, ipa in PAIR.findall(sentence):
                    rows.append({"code": entry["code"], "locale": locale, "page": key,
                                 "word": word.strip(), "ipa": ipa, "sentence": sentence.strip()})
    return rows


def judge(gemini, model: str, lang_name: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload = [{"id": i, "word": r["word"], "pageLanguage": LANGUAGES[r["locale"]], "sentence": r["sentence"]}
               for i, r in enumerate(rows)]
    prompt = (
        f"You are a careful {lang_name} lexicographer. Each item has a {lang_name} word and a sentence "
        "written in another language (`pageLanguage`) that mentions it.\n"
        "For each item decide:\n"
        "- `claims`: true if the sentence states or clearly implies what the word MEANS "
        "(a translation or gloss), false if it only quotes the word to show a sound or spelling.\n"
        "- `correct`: when `claims` is true, whether the stated meaning is a correct meaning of the "
        f"{lang_name} word. Judge the word itself, not the sentence's other claims about sounds.\n"
        "- `meaning`: the right meaning in the page language, in a few words, when `claims` is true "
        "and `correct` is false; otherwise an empty string.\n"
        'Answer with JSON only: {"results":[{"id":0,"claims":true,"correct":true,"meaning":""}]}, '
        "one object per item, same ids.\n\nITEMS:\n" + json.dumps(payload, ensure_ascii=False)
    )
    answer = gemini(prompt, 0.0, model)
    results = {int(r["id"]): r for r in answer.get("results", [])}
    return [results.get(i, {"claims": True, "correct": None, "meaning": ""}) for i in range(len(rows))]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lang", required=True, help="target language of the alphabet, e.g. ro")
    parser.add_argument("--locales", help="page languages to check (default: every page language)")
    parser.add_argument("--code", help="only these item codes, comma-separated")
    parser.add_argument("--json", help="write the full findings here")
    args = parser.parse_args()

    data = json.loads((ROOT / "src" / "data" / "alphabets" / f"{args.lang}.json").read_text(encoding="utf-8"))
    entries = data["letters"] + data["groups"]
    if args.code:
        wanted = set(args.code.split(","))
        entries = [e for e in entries if e["code"] in wanted]
    locales = args.locales.split(",") if args.locales else list(LANGUAGES)
    gemini, model = load_gemini()

    rows: list[dict[str, Any]] = []
    for entry in entries:
        rows.extend(sentences_with_words(entry, locales))
    print(f"{args.lang}: {len(entries)} entries, {len(rows)} sentence(s) naming a word, {len(locales)} language(s)")

    findings: list[dict[str, Any]] = []
    for start in range(0, len(rows), BATCH):
        chunk = rows[start:start + BATCH]
        for row, verdict in zip(chunk, judge(gemini, model, LANGUAGES[args.lang], chunk)):
            row.update(claims=bool(verdict.get("claims")), correct=verdict.get("correct"),
                       right=str(verdict.get("meaning") or ""))
        print(f"  judged {min(start + BATCH, len(rows))}/{len(rows)}")

    by_code = {e["code"]: e for e in entries}
    for row in rows:
        entry = by_code[row["code"]]
        translation = ((entry.get("exampleTranslation") or {}).get(row["locale"]) or "").strip().lower()
        row["stored"] = ""
        # the main example word has a stored translation: the sentence must contain it
        if row["word"].lower() == str(entry.get("example", "")).lower() and translation and row["claims"]:
            parts = [p.strip() for p in re.split(r"[,/;]", translation) if p.strip()]
            row["stored"] = translation
            if not any(p in row["sentence"].lower() for p in parts):
                row["correct"] = False if row["correct"] is not False else row["correct"]
                row["right"] = row["right"] or translation
                row["note"] = "main example does not state the stored translation"

    wrong = [r for r in rows if r["claims"] and r["correct"] is False]
    unsure = [r for r in rows if r["claims"] and r["correct"] is None]
    claims = sum(1 for r in rows if r["claims"])
    print(f"\nclaims a meaning: {claims} | judged wrong: {len(wrong)} | unclear: {len(unsure)}")
    for r in wrong:
        print(f"  WRONG {r['code']} [{r['locale']}] ({r['word']}): {r['sentence'][:140]}  -> should mean: {r['right']}")
    if args.json:
        Path(args.json).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if wrong else 0


if __name__ == "__main__":
    raise SystemExit(main())
