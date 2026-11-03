"""Write the Romanian articles of LT03 to LT10 (grammar in context), in simple Romanian.

  .venv/Scripts/python.exe scripts/create-context-articles.py --chapter LT03 [--topic LT03T01] [--id L926] [--overwrite] [--dry-run]

Same rule as create-grammar-articles.py: written natively in Romanian, never translated; the English
article of the item is only an outline of its THEME. These articles are about Romania and its
language, so the English outline's own country and grammar focus are only hints.

Article template (planning/lectures-grammar-culture-plan.md), five sections:

  Despre această lecție   2 to 3 sentences, no grammar yet
  În context              a short text or dialogue that shows the theme
  Note de gramatică       2 to 3 numbered notes: a one-line rule, the sentence it explains,
                          sometimes a small table, and "Vezi Introducere în gramatică: <topic>"
  Observație              2 to 3 bullet points: a difference from English or a common mistake
  Notă culturală          2 to 3 sentences about Romania

Facts (LT07 to LT10 especially) must be well known and checkable; the text is written as `draft`
and needs a fact review before it is called reviewed. Nothing is uploaded here.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib import articles  # noqa: E402

_spec = importlib.util.spec_from_file_location("create_grammar", ROOT / "scripts" / "create-grammar-articles.py")
grammar = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(grammar)
stories = grammar.stories

LECTURES = grammar.LECTURES
DEFAULT_MODEL = grammar.DEFAULT_MODEL

#: How many grammar notes a level may have (the plan's budget).
NOTES_BY_LEVEL = {"A1": (1, 2), "A2": (2, 3), "B1": (2, 4), "B2": (2, 4), "C1": (2, 4)}


def lt02_topics() -> list[str]:
    """The Romanian names of the LT02 topics, the only valid targets of a "Vezi" link."""
    sidebar = json.loads(grammar.SIDEBAR.read_text(encoding="utf-8"))
    section = next(s for s in sidebar["sections"] if s["code"] == "LT02")
    return [t["names"]["ro"] for t in section["topics"]]


def prompt_for(chapter: str, topic: dict[str, str], item_ro: str, english: dict[str, Any], links: list[str], notes: list[str]) -> str:
    low, high = NOTES_BY_LEVEL.get(topic["level"], (2, 3))
    parts = [
        "You write one short lesson for learners of ROMANIAN, in Romanian, about Romania and the Romanian language.",
        f"Chapter: {chapter}. Topic: {topic['ro'] or topic['en']} ({topic['en']}). Item (Romanian title): {item_ro}. "
        f"Level: {topic['level']}.",
        "The English lesson below is only an OUTLINE of the theme of this item. Do NOT translate it. Write natively "
        "about ROMANIA and ROMANIAN: use Romanian places, names, foods, customs and everyday situations, and choose "
        "the Romanian grammar points that really fit the theme (the English lesson's own country and grammar focus "
        "are only hints).",
        grammar.ROMANIAN_FACTS,
        grammar.SIMPLE_RO,
        "Facts: use only well-known, checkable facts. No exact date, number or name unless you are certain of it; "
        "when unsure, speak in general terms. Never invent a person, a law or a statistic.",
        "Return one JSON object with exactly these keys:\n"
        '  "summary": one sentence, at most 25 words;\n'
        '  "about": 2 to 3 short sentences saying what the lesson is about and why it helps; no grammar yet;\n'
        '  "context": {"paragraph": 2 to 4 short sentences that set the scene, '
        '"dialog": 4 to 6 lines, each {"speaker": a Romanian first name, "text": one short Romanian sentence or two}};\n'
        f'  "notes": a list of {low} to {high} grammar notes, each {{"title": a short title, "rule": ONE plain sentence '
        'stating the rule, "sentence": ONE sentence copied word for word from the dialogue or paragraph that the rule '
        'explains, "see": one of the exact LT02 topic names listed below, "table": either null or '
        '{"headers": [2 or 3 column titles], "rows": [3 to 5 rows of cells]} showing forms of Romanian}};\n'
        '  "notice": 2 or 3 short bullet sentences: what differs from English, or a common mistake;\n'
        '  "culture": 2 to 3 short sentences with a safe, well-known fact about Romania.\n'
        "Allowed values for \"see\": " + "; ".join(links) + ".\n"
        "Every Romanian example must be natural, modern Romanian that a native speaker would really say (for example "
        "'Vreau să învăț', never 'Vreau a învăța'). Put the key form between ** ** inside a rule or sentence. "
        "No other markup, no HTML, no English words.",
        "English outline:\n" + grammar.outline_of(english),
    ]
    if notes:
        parts.append("Fix these problems from the previous attempt: " + "; ".join(notes))
    return "\n\n".join(parts)


def proofread_prompt(item_ro: str, result: dict[str, Any]) -> str:
    return (
        "You are a strict proofreader and teacher of ROMANIAN. Below is a short lesson for learners, titled "
        f"'{item_ro}', as JSON. Check EVERY sentence and table cell for wrong or unnatural Romanian, wrong grammar, "
        "spelling and diacritics (ă â î ș ț with comma below), wrong forms in tables, and any statement about Romania "
        "that is false, uncertain or invented: replace a doubtful date, number or name with a safe general statement. "
        "Check that each note's 'sentence' really appears word for word in the dialogue or paragraph (fix the note "
        "or the text so that it does) and that its 'rule' is correct. Keep the same JSON structure and keys, the same "
        "number of notes, and the allowed 'see' values. Keep the language simple. Return the corrected JSON only.\n\n"
        + json.dumps(result, ensure_ascii=False)
    )


def check_factory(links: list[str], low: int, high: int):
    def check(result: dict[str, Any]) -> list[str]:
        problems: list[str] = []
        strings: list[str] = []

        def text(value: Any, label: str, lo: int, hi: int) -> str:
            if not isinstance(value, str) or not value.strip():
                problems.append(f"{label} is empty")
                return ""
            words = len(value.split())
            if not lo <= words <= hi:
                problems.append(f"{label} has {words} words (need {lo}-{hi})")
            strings.append(value)
            return value

        text(result.get("summary"), "summary", 4, 30)
        text(result.get("about"), "about", 10, 70)
        context = result.get("context") or {}
        paragraph = text(context.get("paragraph"), "context.paragraph", 10, 90)
        dialog = context.get("dialog")
        spoken = ""
        if not isinstance(dialog, list) or not 4 <= len(dialog) <= 6:
            problems.append("context.dialog needs 4 to 6 lines")
        else:
            for line in dialog:
                if not isinstance(line, dict) or not str(line.get("speaker", "")).strip() or not str(line.get("text", "")).strip():
                    problems.append("every dialog line needs a speaker and a text")
                    break
                strings.append(str(line["text"]))
                spoken += " " + str(line["text"])
        notes = result.get("notes")
        if not isinstance(notes, list) or not low <= len(notes) <= high:
            problems.append(f"notes needs {low} to {high} items")
        else:
            haystack = re.sub(r"\*\*", "", paragraph + spoken)
            for note in notes:
                if not isinstance(note, dict):
                    problems.append("a note is not an object")
                    break
                text(note.get("title"), "note.title", 1, 10)
                text(note.get("rule"), "note.rule", 4, 40)
                sentence = re.sub(r"\*\*", "", str(note.get("sentence") or "")).strip()
                strings.append(sentence)
                if not sentence or sentence not in haystack:
                    problems.append(f"note sentence is not word for word in the text: {sentence[:50]!r}")
                if note.get("see") not in links:
                    problems.append(f"note.see must be one of the LT02 topic names, not {note.get('see')!r}")
                table = note.get("table")
                if table:
                    headers, rows = table.get("headers"), table.get("rows")
                    if not isinstance(headers, list) or not 2 <= len(headers) <= 3 or not isinstance(rows, list) or not 3 <= len(rows) <= 6:
                        problems.append("a note table needs 2-3 columns and 3-6 rows")
                    elif not all(isinstance(r, list) and len(r) == len(headers) and all(isinstance(c, str) and c.strip() for c in r) for r in rows):
                        problems.append("every table row needs one string per column")
                    else:
                        strings.extend(headers)
                        for row in rows:
                            strings.extend(row)
        for key, lo, hi in (("notice", 2, 3),):
            items = result.get(key)
            if not isinstance(items, list) or not lo <= len(items) <= hi or not all(isinstance(i, str) and i.strip() for i in items):
                problems.append(f"{key} needs {lo} to {hi} sentences")
            else:
                strings.extend(items)
        text(result.get("culture"), "culture", 8, 70)
        joined = " ".join(strings)
        if grammar.CEDILLA.search(joined):
            problems.append("use comma-below ș ț, not the cedilla letters ş ţ")
        if re.search(r"[<>]", joined):
            problems.append("no HTML in the text")
        if grammar.LATIN_ENGLISH.search(joined):
            problems.append("English words found; write in Romanian only")
        return problems

    return check


def locale_text(title: str, result: dict[str, Any]) -> dict[str, Any]:
    context = result["context"]
    notes_blocks: list[dict[str, Any]] = []
    for number, note in enumerate(result["notes"], start=1):
        notes_blocks.append({
            "type": "paragraphs",
            "paragraphs": [
                f"**{number}. {note['title'].strip()}** {note['rule'].strip()}",
                f"{note['sentence'].strip()}",
                f"Vezi Introducere în gramatică: {note['see']}.",
            ],
        })
        table = note.get("table")
        if table:
            notes_blocks.append({"type": "table", "html": grammar.block_table(table["headers"], table["rows"])})
    return {
        "title": title,
        "summary": result["summary"].strip(),
        "status": "draft",
        "sections": [
            {"title": "Despre această lecție", "blocks": [{"type": "paragraphs", "paragraphs": [result["about"].strip()]}]},
            {
                "title": "În context",
                "blocks": [
                    {"type": "paragraphs", "paragraphs": [context["paragraph"].strip()]},
                    {"type": "dialog", "lines": [{"speaker": l["speaker"].strip(), "text": l["text"].strip()} for l in context["dialog"]]},
                ],
            },
            {"title": "Note de gramatică", "blocks": notes_blocks},
            {"title": "Observație", "blocks": [{"type": "bullets", "items": [i.strip() for i in result["notice"]]}]},
            {"title": "Notă culturală", "blocks": [{"type": "paragraphs", "paragraphs": [result["culture"].strip()]}]},
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Write the Romanian LT03-LT10 articles in simple Romanian.")
    parser.add_argument("--chapter", required=True, help="LT03 .. LT10")
    parser.add_argument("--topic")
    parser.add_argument("--id", help="an item id, or a comma-separated list")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--model")
    args = parser.parse_args()
    if args.chapter in ("LT01", "LT02"):
        parser.error("use create-grammar-articles.py for LT02; LT01 is written per reader language elsewhere")

    stories.load_env()
    model = args.model or DEFAULT_MODEL
    topics = grammar.load_topics()
    links = lt02_topics()
    wanted = set(args.id.split(",")) if args.id else None
    written = skipped = failed = 0
    paths = sorted(LECTURES.glob(f"{args.chapter}T*/L*.json"), key=lambda p: (p.parent.name, int(re.sub(r"\D", "", p.stem))))
    for path in paths:
        topic_code, item_id = path.parent.name, path.stem
        if (args.topic and topic_code != args.topic) or (wanted and item_id not in wanted):
            continue
        article = articles.read_article(path)
        if "ro" in article["locales"] and not args.overwrite:
            skipped += 1
            continue
        english = article["locales"].get("en")
        title = (article.get("terms") or {}).get("ro") or ""
        if not english or not title:
            print(f"  {topic_code}:{item_id}: no English outline or Romanian title, skipped", file=sys.stderr)
            skipped += 1
            continue
        topic = topics.get(topic_code, {"en": topic_code, "ro": "", "level": "A1"})
        low, high = NOTES_BY_LEVEL.get(topic["level"], (2, 3))
        if args.dry_run:
            print(f"  {topic_code}:{item_id} {title}: would write")
            written += 1
            continue
        check = check_factory(links, low, high)
        try:
            result = stories.with_retries(
                f"{topic_code}:{item_id}",
                lambda: grammar.gemini(prompt_for(args.chapter, topic, title, english, links, list(stories.RETRY_NOTES)), 0.3, model),
                check,
            )
            result = stories.with_retries(
                f"{topic_code}:{item_id} proofread",
                lambda: grammar.gemini(proofread_prompt(title, result), 0.1, model),
                check,
            )
        except RuntimeError as error:
            print(f"!! {error}", file=sys.stderr)
            failed += 1
            continue
        article["locales"]["ro"] = locale_text(title, result)
        articles.write_article(path, article)
        print(f"  {topic_code}:{item_id}: wrote '{title}'")
        written += 1
    print(f"{'Would write' if args.dry_run else 'Wrote'} {written}; skipped {skipped}; failed {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
