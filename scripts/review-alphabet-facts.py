#!/usr/bin/env python
"""review-alphabet-facts.py - fact-check the structured data of an alphabet file.

The page writer is only as correct as `src/data/alphabets/<lang>.json`: the glyph's IPA,
the example word and its IPA, and every pronunciation variation with its example words.
This asks Gemini, in a separate request, to check each entry like a phonetician would
and to list what is wrong (a wrong IPA, a word that does not contain the sound, a rule
that does not hold, a mixed accent) with a suggested correction.

    review-alphabet-facts.py --lang en [--code L317,L318] [--accent "General American"] [--json out.json]

Report only: nothing is written. Exit code 1 when a problem is found.
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
BATCH = 8
NAMES = {"en": "English", "ro": "Romanian", "de": "German", "ru": "Russian", "it": "Italian",
         "es": "Spanish", "fr": "French", "hu": "Hungarian", "pt": "Portuguese"}


def load_gemini():
    spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.load_env()
    return module.gemini_json, os.environ.get("GEMINI_MODEL") or module.DEFAULT_GEMINI_MODEL


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lang", required=True)
    parser.add_argument("--code", help="only these item codes, comma-separated")
    parser.add_argument("--accent", default="", help="the one accent every IPA must follow, e.g. 'General American'")
    parser.add_argument("--json", help="write the findings here")
    args = parser.parse_args()

    data = json.loads((ROOT / "src" / "data" / "alphabets" / f"{args.lang}.json").read_text(encoding="utf-8"))
    entries = data["letters"] + data["groups"]
    if args.code:
        wanted = set(args.code.split(","))
        entries = [e for e in entries if e["code"] in wanted]
    gemini, model = load_gemini()
    accent = f" Every IPA must follow one accent: {args.accent}." if args.accent else ""

    findings: list[dict[str, Any]] = []
    for start in range(0, len(entries), BATCH):
        chunk = entries[start:start + BATCH]
        payload = [{"code": e["code"], "glyph": e.get("glyph"), "ipa": e.get("ipa"), "example": e.get("example"),
                    "exampleIpa": e.get("exampleIpa"), "variations": e.get("variations")} for e in chunk]
        prompt = (
            f"You are a phonetician and {NAMES[args.lang]} teacher. Check each entry of a pronunciation course for "
            f"learners of {NAMES[args.lang]}.{accent} Check: (1) the IPA of the glyph/group, (2) the example word "
            "really contains that spelling and its IPA is right, (3) every variation's IPA is a real pronunciation of the "
            "spelling in the stated context, (4) every example word of a variation really has that pronunciation, "
            "(5) each `when` description is true (no invented rules, no wrong word-origin claims), (6) the IPA of the "
            "example words is consistent with one accent. List only REAL errors, not style. For each error give the "
            "exact field, what is wrong, and the corrected value.\n"
            'Answer JSON only: {"entries":[{"code":"L317","ok":true,"errors":[{"field":"variations[1].when",'
            '"problem":"...","fix":"..."}]}]} with one object per code.\n\nENTRIES:\n'
            + json.dumps(payload, ensure_ascii=False)
        )
        answer = gemini(prompt, 0.0, model)
        for row in answer.get("entries", []):
            findings.append(row)
        print(f"  checked {min(start + BATCH, len(entries))}/{len(entries)}", flush=True)

    bad = [f for f in findings if f.get("errors")]
    print(f"\nentries with errors: {len(bad)} of {len(entries)}")
    for row in bad:
        for err in row["errors"]:
            print(f"  {row['code']} {err.get('field')}: {err.get('problem')} -> {err.get('fix')}")
    if args.json:
        Path(args.json).write_text(json.dumps(findings, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
