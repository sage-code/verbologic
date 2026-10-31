#!/usr/bin/env python
"""review-alphabet-intros.py - does the first paragraph of each alphabet page make sense?

The writing validator proves the IPA and word pairs match the facts. It cannot tell
whether the opening paragraph is a sensible definition ("This letter is spoken as
(school)" is not). This script gives an independent Gemini request the entry's facts and
the first paragraph of the `sound` page in every language and lists the paragraphs that
mislead, contradict the facts, or do not read as a clear introduction to the letter.

    review-alphabet-intros.py --lang ro [--locales en,de] [--code L022] [--json out.json]

Report only: nothing is written to the alphabet files. Exit code 1 when a problem is found.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = {"en": "English", "ro": "Romanian", "de": "German", "ru": "Russian", "it": "Italian",
             "es": "Spanish", "fr": "French", "hu": "Hungarian", "pt": "Portuguese"}
BATCH = 20


def load_gemini():
    spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.load_env()
    return module.gemini_json, os.environ.get("GEMINI_MODEL") or module.DEFAULT_GEMINI_MODEL


def first_paragraph(entry: dict[str, Any], locale: str) -> str:
    page = ((entry.get("sections") or {}).get(locale) or {}).get("sound") or {}
    return str(page.get("text", "")).strip().split("\n\n")[0].strip()


def judge(gemini, model: str, lang_name: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload = [{"id": i, "pageLanguage": LANGUAGES[r["locale"]], "glyph": r["glyph"], "ipa": r["ipa"],
                "example": r["example"], "paragraph": r["text"]} for i, r in enumerate(rows)]
    prompt = (
        f"You are a phonetics teacher who knows {lang_name} well, reviewing the OPENING paragraph of a lesson "
        f"page about one {lang_name} letter or letter group, written for learners in the page language "
        "(`pageLanguage`). Each item gives the glyph, its IPA, the example word and the paragraph.\n"
        "Decide whether a learner would understand the paragraph and be told only true things. It is a PROBLEM when:\n"
        "- it says or implies the letter is 'spoken as', 'called' or 'the same as' a whole word, instead of "
        "saying the letter makes a sound heard in that word;\n"
        "- a stated meaning, sound, IPA or claim about the letter is wrong;\n"
        "- it defines something with a vague, circular or nonsensical phrase;\n"
        "- a sentence does not make sense in the page language, or is awkward enough to confuse a learner;\n"
        "- it says nothing useful about the letter's sound.\n"
        "Do NOT flag style, repetition or length. Answer with JSON only: "
        '{"results":[{"id":0,"ok":true,"problem":""}]}. For ok=false give `problem` in English in one short '
        "sentence naming the exact phrase at fault. One object per item, same ids.\n\nITEMS:\n"
        + json.dumps(payload, ensure_ascii=False)
    )
    answer = gemini(prompt, 0.0, model)
    results = {int(r["id"]): r for r in answer.get("results", [])}
    return [results.get(i, {"ok": True, "problem": ""}) for i in range(len(rows))]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lang", required=True, help="the alphabet's language, e.g. ro")
    parser.add_argument("--locales", help="page languages to review (default: every one that has pages)")
    parser.add_argument("--code", help="only these item codes, comma-separated")
    parser.add_argument("--json", help="write the findings here")
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
        for locale in locales:
            text = first_paragraph(entry, locale)
            if text:
                rows.append({"code": entry["code"], "locale": locale, "glyph": entry.get("glyph", entry["code"]),
                             "ipa": entry.get("ipa", ""), "example": entry.get("example", ""), "text": text})
    print(f"{args.lang}: {len(entries)} entries, {len(rows)} opening paragraph(s)")

    for start in range(0, len(rows), BATCH):
        chunk = rows[start:start + BATCH]
        for row, verdict in zip(chunk, judge(gemini, model, LANGUAGES[args.lang], chunk)):
            row.update(ok=bool(verdict.get("ok", True)), problem=str(verdict.get("problem") or ""))
        print(f"  reviewed {min(start + BATCH, len(rows))}/{len(rows)}")

    bad = [r for r in rows if not r["ok"]]
    print(f"\nproblems: {len(bad)} of {len(rows)}")
    for r in bad:
        print(f"  {r['code']} [{r['locale']}] {r['glyph']}: {r['problem']}\n      {r['text'][:200]}")
    if args.json:
        Path(args.json).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
