"""Write the pronunciation lecture articles for LT01 topics that have no items yet.

  .venv/Scripts/python.exe scripts/create-lecture-articles.py --topic LT01T03 --preview
  .venv/Scripts/python.exe scripts/create-lecture-articles.py --apply

The seed (scripts/seeds/lectures-LT01-pronunciation.json) lists each item with
its teaching focus, a Romanian example, the hand-written IPA of that example and
its English gloss. One Gemini call per item writes the article in all nine site
languages from the same facts, so every locale teaches the same point.

Each article is written to content/lectures/<TOPIC>/<ID>/<locale>.md as a draft.
With --apply the item ids are also added to the topic in the lectures sidebar
(only when the topic has no items yet; existing items are never touched).
Existing article files are never overwritten unless --overwrite is passed.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "scripts" / "seeds" / "lectures-LT01-pronunciation.json"
CONTENT = ROOT / "content" / "lectures"
MEDIA = ROOT / "media"
SIDEBAR = ROOT / "src" / "data" / "sidebars" / "library" / "lectures" / "sidebar.json"

LOCALES = ["en", "es", "it", "fr", "de", "ru", "hu", "pt", "ro"]
LOCALE_NAMES = {
    "en": "English", "es": "Spanish", "it": "Italian", "fr": "French", "de": "German",
    "ru": "Russian", "hu": "Hungarian", "pt": "Portuguese", "ro": "Romanian",
}
LEVEL_NOTE = {
    "A1": "a primary-school learner (short, simple sentences)",
    "A2": "a middle-school learner (clear sentences, one idea per sentence)",
}
MAX_ATTEMPTS = 3

# Reuse the Gemini client and .env loader from the stories script (same
# project, same key and model), instead of keeping a second copy.
_spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
_stories = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_stories)
gemini_json = _stories.gemini_json
load_env = _stories.load_env
DEFAULT_GEMINI_MODEL = _stories.DEFAULT_GEMINI_MODEL


def article_prompt(item: dict[str, Any], topic: str, level: str) -> str:
    names = ", ".join(f"{LOCALE_NAMES[code]} ({code})" for code in LOCALES)
    return f"""You write one reference article for a pronunciation lecture on Romanian.
Learners are {LEVEL_NOTE.get(level, LEVEL_NOTE['A1'])}. They read the article next to
the Romanian audio, so the text must describe what the mouth, the stress and the
tone do, not only name the rule.

Topic: {topic}
Teaching point (English): {item['focus']}
Heading idea: {item['title']}
Romanian example: {item['example']}
Example IPA: {item['ipa']}
Example meaning (English): {item['gloss']}

Write the article in ALL of these languages: {names}.
Use the same facts in every language. Translate the teaching point faithfully;
do not invent a different rule for one language.

For each language give:
- "term": the name of this teaching point in that language, 1 to 4 words, for example
  "syllable", "sílaba", "Silbe". For Romanian it is the Romanian name, for example "silabă".
- "title": a short heading, at most 6 words.
- "summary": one sentence, at most 25 words, shown under the title.
- "body": Markdown, 3 or 4 sections. Every section starts with a "## " heading.
  Each section is 50 to 110 words. Write the Romanian example as: {item['example']} {item['ipa']}
  (bold is allowed for the key word, e.g. **{item['example']}**). Do not write front matter,
  a title line, a horizontal rule, or a code block in the body.
  Suggested sections: the sound or pattern; how to say it (mouth, stress or tone);
  examples; common mistakes for speakers of the reader's language.

Return one JSON object exactly like this, with a key for every language code:
{{"locales": {{"en": {{"term": "...", "title": "...", "summary": "...", "body": "..."}}, ...}}}}"""


def check_article(result: dict[str, Any], item: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    locales = result.get("locales")
    if not isinstance(locales, dict):
        return ["missing 'locales' object"]
    for code in LOCALES:
        entry = locales.get(code)
        if not isinstance(entry, dict):
            problems.append(f"{code}: missing")
            continue
        term = str(entry.get("term", "")).strip()
        title = str(entry.get("title", "")).strip()
        summary = str(entry.get("summary", "")).strip()
        body = str(entry.get("body", "")).strip()
        if not term or len(term.split()) > 6:
            problems.append(f"{code}: term empty or too long")
        if not title or len(title.split()) > 8:
            problems.append(f"{code}: title empty or too long")
        if not summary:
            problems.append(f"{code}: summary empty")
        if len(re.findall(r"^## ", body, flags=re.M)) < 2:
            problems.append(f"{code}: fewer than two '## ' sections")
        if re.search(r"^(---|```)", body, flags=re.M):
            problems.append(f"{code}: body has front matter, a rule or a code fence")
        if item["example"] not in body:
            problems.append(f"{code}: example '{item['example']}' not in body")
    return problems


def load_article(item: dict[str, Any], topic: str, level: str, model: str) -> dict[str, Any]:
    last = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            result = gemini_json(article_prompt(item, topic, level), 0.4, model)
        except (RuntimeError, ValueError, KeyError) as error:
            last = f"call failed: {error}"
        else:
            problems = check_article(result, item)
            if not problems:
                return result
            last = "; ".join(problems[:4])
        print(f"  {item['id']} attempt {attempt} rejected: {last}", file=sys.stderr)
        time.sleep(2)
    raise RuntimeError(f"{item['id']}: no valid article after {MAX_ATTEMPTS} attempts ({last})")


def document(topic: str, item: dict[str, Any], order: int, code: str, entry: dict[str, Any], terms: dict[str, str]) -> str:
    front = [
        "track: lectures",
        f"topic: {topic}",
        f"article: {item['id']}",
        f"locale: {code}",
        f"title: {json.dumps(str(entry['title']).strip(), ensure_ascii=False)}",
        f"summary: {json.dumps(str(entry['summary']).strip(), ensure_ascii=False)}",
        "status: draft",
        f"entity_id: {json.dumps(topic + ':' + item['id'])}",
        f"order: {order}",
        "terms:",
        *[f"  {locale}: {json.dumps(terms[locale], ensure_ascii=False)}" for locale in LOCALES],
    ]
    body = str(entry["body"]).strip()
    return "---\n" + "\n".join(front) + "\n---\n\n" + body + "\n"


def write_manifest(topic: str, item: dict[str, Any], level: str, terms: dict[str, str]) -> None:
    """Article items carry no media; this manifest only gives generate-audio --read a place for its MP3."""
    path = MEDIA / "lectures" / topic[:4] / topic / item["id"] / "item.json"
    manifest = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    manifest.update({
        "code": item["id"],
        "track": "lectures",
        "chapter": topic[:4],
        "topic": topic,
        "kind": "article",
        "entity_id": f"{topic}:{item['id']}",
        "cefr": level,
        "tags": manifest.get("tags", []),
        "locales": {code: {"name": terms[code]} for code in LOCALES},
    })
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sidebar_topic(topic: str) -> dict[str, Any]:
    data = json.loads(SIDEBAR.read_text(encoding="utf-8"))
    for section in data["sections"]:
        for entry in section["topics"]:
            if entry["code"] == topic:
                return entry
    raise SystemExit(f"topic {topic} not in lectures sidebar")


def add_items_to_sidebar(topic: str, ids: list[str]) -> None:
    raw = SIDEBAR.read_text(encoding="utf-8")
    data = json.loads(raw)
    for section in data["sections"]:
        for entry in section["topics"]:
            if entry["code"] == topic:
                if entry.get("items"):
                    raise SystemExit(f"{topic} already has items; not changing the sidebar")
                entry["items"] = ids
                out = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
                SIDEBAR.write_text(out.replace("\n", "\r\n") if "\r\n" in raw else out, encoding="utf-8")
                return
    raise SystemExit(f"topic {topic} not in lectures sidebar")


def main() -> int:
    parser = argparse.ArgumentParser(description="Write LT01 pronunciation lecture articles.")
    parser.add_argument("--topic", action="append", help="only this topic (repeatable), e.g. LT01T03")
    parser.add_argument("--only", help="only these item ids, comma-separated, e.g. L627,L628")
    parser.add_argument("--model", help="Gemini text model (default: GEMINI_MODEL from .env)")
    parser.add_argument("--preview", action="store_true", help="print one English article per selected item; writes nothing")
    parser.add_argument("--apply", action="store_true", help="write the articles and the sidebar items")
    parser.add_argument("--overwrite", action="store_true", help="replace existing article files")
    args = parser.parse_args()
    if not args.preview and not args.apply:
        parser.error("choose --preview or --apply")

    load_env()
    model = args.model or os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
    seed = json.loads(SEED.read_text(encoding="utf-8"))["topics"]
    only = set(args.only.split(",")) if args.only else None

    failed = False
    for topic, items in seed.items():
        if args.topic and topic not in args.topic:
            continue
        meta = sidebar_topic(topic)
        level = meta["level"]
        selected = [item for item in items if not only or item["id"] in only]
        if not selected:
            continue
        print(f"== {topic} ({level}) {len(selected)} items", flush=True)
        for order, item in enumerate(items):
            if item not in selected:
                continue
            if args.preview:
                try:
                    result = load_article(item, topic, level, model)
                except RuntimeError as error:
                    print(f"  FAILED {error}")
                    failed = True
                    continue
                print(f"\n--- {item['id']} en ---\n{result['locales']['en']['title']}\n{result['locales']['en']['body']}")
                continue
            done = all((CONTENT / topic / item["id"] / f"{code}.md").exists() for code in LOCALES)
            if done and not args.overwrite:
                print(f"  skipped {item['id']} (all locales exist)", flush=True)
                continue
            try:
                result = load_article(item, topic, level, model)
            except RuntimeError as error:
                print(f"  FAILED {error}", flush=True)
                failed = True
                continue
            terms = {code: str(result["locales"][code]["term"]).strip() for code in LOCALES}
            for code in LOCALES:
                path = CONTENT / topic / item["id"] / f"{code}.md"
                if path.exists() and not args.overwrite:
                    print(f"  kept {path.relative_to(ROOT)} (exists)")
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(document(topic, item, order, code, result["locales"][code], terms), encoding="utf-8")
            write_manifest(topic, item, level, terms)
            print(f"  wrote {item['id']} ({item['title']})", flush=True)

        if args.apply and not failed and not only and not meta.get("items"):
            ids = [item["id"] for item in items]
            add_items_to_sidebar(topic, ids)
            print(f"  sidebar: {topic} items set to {ids[0]}..{ids[-1]}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
