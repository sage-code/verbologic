"""Listen to a sample of clips and check that each says what the site shows (S3a of planning/lt01-all-languages-plan.md).

  .venv/Scripts/python.exe scripts/verify-clip-text.py --chapter LT01 --sound 140 --read 60 --json temp/clip-sample.json

Picks clips at random, spread over topics and languages, among the ones with no recorded text hash
(`node scripts/audit-sound.mjs --chapter LT01` calls them unverified). Each clip goes to Gemini as audio
with the text it should say; Gemini answers what it hears and whether it matches. A letter clip is
right when it says that letter's name in any form; a read clip is right when it reads that page (the
IPA is not read, and words in brackets are spoken by another voice).

If the mismatch rate is small, `audit-sound.mjs --baseline` can stamp the unverified clips as trusted.
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]
LOCALES = ["en", "ro", "de", "ru", "it", "es", "fr", "hu", "pt"]
NAMES = {"en": "English", "ro": "Romanian", "de": "German", "ru": "Russian", "it": "Italian",
         "es": "Spanish", "fr": "French", "hu": "Hungarian", "pt": "Portuguese"}

_spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
_stories = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_stories)
_stories.load_env()
MODEL = os.environ.get("GEMINI_MODEL") or _stories.DEFAULT_GEMINI_MODEL


def judge(audio: Path, language: str, expected: str, kind: str) -> dict:
    rule = (
        "It is the name of a title, an item or a letter. It is right when the clip says that name. "
        "A single letter is right when it says that letter's name in any common form."
        if kind == "sound"
        else "It is a read-aloud of a short lesson page. The IPA symbols are not read and some quoted words are said "
        "in another language's voice. It is right when the clip reads this page's content."
    )
    prompt = (
        f"Listen to this audio clip. It should be spoken in {language} and say the text below.\n{rule}\n"
        f"TEXT: {expected[:900]}\n"
        'Answer with one JSON object: {"heard": "<a short transcript of what you hear>", "language": "<language heard>", '
        '"matches": true or false}.'
    )
    payload = {
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": "audio/mpeg", "data": base64.b64encode(audio.read_bytes()).decode()}},
        ]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    model = _stories.normalize_model(MODEL)
    url = (f"{_stories.GEMINI_API_URL}/{urllib.parse.quote(model, safe='/')}:generateContent?"
           f"{urllib.parse.urlencode({'key': os.environ['GEMINI_API_KEY']})}")
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data = json.loads(response.read().decode("utf-8"))
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            answer = json.loads(re.sub(r"\A```(?:json)?\s*|\s*```\Z", "", text))
            if isinstance(answer, list):  # the model sometimes wraps the object in a list
                answer = next((a for a in answer if isinstance(a, dict)), {})
            if isinstance(answer, dict):
                return answer
        except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError):
            time.sleep(2 * (attempt + 1))
    return {"heard": "", "language": "", "matches": None}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chapter", default="LT01")
    ap.add_argument("--sound", type=int, default=140)
    ap.add_argument("--read", type=int, default=60)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--json")
    args = ap.parse_args()
    random.seed(args.seed)

    base = ROOT / "media" / "lectures" / args.chapter[:4]
    pool: dict[str, list] = {"sound": [], "read": []}
    for path in base.rglob("item.json"):
        item = json.loads(path.read_text(encoding="utf-8"))
        topic = item.get("topic") or item.get("code")
        if not str(topic).startswith(args.chapter):
            continue
        is_title = str(item.get("kind", "")).endswith("-title")
        for loc in LOCALES:
            row = (item.get("locales") or {}).get(loc) or {}
            facts = (item.get("files") or {}).get(f"sound/{loc}.mp3")
            clip = path.parent / "sound" / f"{loc}.mp3"
            if row.get("name") and facts and not facts.get("text") and not facts.get("copyOf") and clip.exists():
                pool["sound"].append((topic, item["code"], loc, clip, str(row.get("ttsText") or row["name"])))
            rfacts = (item.get("files") or {}).get(f"read/{loc}.mp3")
            rclip = path.parent / "read" / f"{loc}.mp3"
            article = ROOT / "content" / "lectures" / str(topic) / f"{item['code']}.json"
            if not is_title and rfacts and not rfacts.get("text") and rclip.exists() and article.exists():
                page = json.loads(article.read_text(encoding="utf-8")).get("locales", {}).get(loc)
                if page and page.get("sections"):
                    text = " ".join(s["title"] + ". " + " ".join(s["paragraphs"]) for s in page["sections"])
                    pool["read"].append((topic, item["code"], loc, rclip, text))

    chosen = []
    for kind, count in (("sound", args.sound), ("read", args.read)):
        rows = pool[kind]
        random.shuffle(rows)
        # spread: round-robin over (topic, language) buckets
        buckets: dict[tuple, list] = {}
        for row in rows:
            buckets.setdefault((row[0], row[2]), []).append(row)
        picked = []
        while len(picked) < min(count, len(rows)):
            for key in list(buckets):
                if buckets[key] and len(picked) < count:
                    picked.append(buckets[key].pop())
        chosen += [(kind, *row) for row in picked]
    print(f"sample: {len(chosen)} clip(s) from {sum(len(v) for v in pool.values())} unverified", flush=True)

    results = []
    for number, (kind, topic, code, loc, clip, expected) in enumerate(chosen, 1):
        verdict = judge(clip, NAMES[loc], expected, kind)
        results.append({"kind": kind, "topic": topic, "code": code, "locale": loc, "expected": expected[:120], **verdict})
        if verdict.get("matches") is not True:
            print(f"  {code} {kind}/{loc}: expected {expected[:60]!r} heard {str(verdict.get('heard'))[:80]!r} ({verdict.get('language')}) matches={verdict.get('matches')}", flush=True)
        if number % 20 == 0:
            print(f"  judged {number}/{len(chosen)}", flush=True)
    ok = sum(1 for r in results if r["matches"] is True)
    bad = sum(1 for r in results if r["matches"] is False)
    unknown = len(results) - ok - bad
    print(f"\nmatches {ok} | mismatches {bad} | undecided {unknown} of {len(results)}")
    if args.json:
        Path(args.json).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
