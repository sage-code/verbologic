"""Write the Romanian version of the LT02 (Introduction to Grammar) articles, in simple Romanian.

  .venv/Scripts/python.exe scripts/create-grammar-articles.py --chapter LT02 [--topic LT02T09] [--id L838] [--overwrite] [--dry-run]

Language rule (planning/lectures-grammar-culture-plan.md): a lecture after LT01 is written in the
language it teaches, natively, never translated. The grammar of Romanian is described in Romanian,
and a complex idea is explained with simpler Romanian words (the language bootstraps itself).

For each item of the chapter that has no `ro` text yet, this asks Gemini to write one article in
two reading pages, the same shape as the English one:

  Ce este                    an explanation and three very short examples
  Cum funcționează în română a short paragraph and a small table of forms

The English article is passed only as an OUTLINE of what the item covers. The result is written
into the item's `locales.ro` through scripts/lib/articles.py, and the item's Romanian name
(`terms.ro`) becomes the title. Nothing is uploaded here; run
`./run.sh create read LT02 --lang ro` afterwards for the read-aloud.
"""
from __future__ import annotations

import argparse
import html
import importlib.util
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib import articles  # noqa: E402

# Reuse the Gemini caller, env loader and retry loop of the story pipeline.
_spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
stories = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(stories)

#: A stronger model than the stories use: a grammar lesson must not contain wrong Romanian.
DEFAULT_MODEL = "models/gemini-3.8-flash"

LECTURES = ROOT / "content" / "lectures"
SIDEBAR = ROOT / "src" / "data" / "sidebars" / "library" / "lectures" / "sidebar.json"

#: Romanian features the model must respect (the plan's "how the same topic differs by language").
ROMANIAN_FACTS = (
    "Facts about Romanian that the text must respect: three genders (masculin, feminin, neutru); "
    "five cases in practice (nominativ, acuzativ, genitiv, dativ, vocativ), shown by endings and by the "
    "articles; the definite article is a SUFFIX (om -> omul, casă -> casa); the indefinite article is a "
    "separate word (un, o, niște); subject pronouns are usually dropped (Vorbesc românește.); verbs have "
    "four conjugation classes (-a, -ea, -e, -i/-î) and the infinitive is marked by 'a' (a fi, a avea, a cânta); "
    "the usual past is the perfect compus (am cântat); the future is 'voi cânta' or 'o să cânt'; the "
    "subjunctive uses 'să' (vreau să merg); after verbs like a vrea, a putea, a trebui, a ști, a începe, a-i plăcea "
    "modern Romanian uses 'să + verb', NEVER the infinitive (Vreau să învăț, Pot să merg, Trebuie să plec, Îmi place să "
    "citesc; never 'Vreau a învăța'); the infinitive appears only as the dictionary form (a învăța), after a "
    "preposition (pentru a învăța, fără a întreba) and as a noun (A citi este plăcut); "
    "the imperative has its own forms (cântă! cântați!); "
    "negation is 'nu' before the verb; questions keep the word order and use intonation or a question word. "
    "If Romanian does not have the feature the item is about, say so in one clear sentence and explain how "
    "Romanian does the same job."
)

SIMPLE_RO = (
    "Write SIMPLE Romanian for a learner: short sentences (at most 15 words), common everyday words, one idea "
    "per sentence, the active voice, no idioms, no long chains of nouns, no semicolons. When you must use a "
    "grammar word (substantiv, verb, gen...) explain it at once with plain words. Use the correct Romanian "
    "letters: ă â î ș ț (comma below, never the cedilla ş ţ)."
)


def gemini(prompt: str, temperature: float, model: str) -> dict[str, Any]:
    """gemini_json that waits and retries when the API says "too many requests" (HTTP 429)."""
    for wait in range(8):
        try:
            return stories.gemini_json(prompt, temperature, model)
        except RuntimeError as error:
            if "429" not in str(error) or wait == 7:
                raise
            print(f"  rate limited, waiting 70 s ({wait + 1}/7)", file=sys.stderr)
            time.sleep(70)
    raise RuntimeError("unreachable")


def load_topics() -> dict[str, dict[str, str]]:
    sidebar = json.loads(SIDEBAR.read_text(encoding="utf-8"))
    topics: dict[str, dict[str, str]] = {}
    for section in sidebar["sections"]:
        for topic in section["topics"]:
            topics[topic["code"]] = {"en": topic["names"]["en"], "ro": topic["names"].get("ro", ""), "level": topic.get("level", "A1")}
    return topics


def outline_of(english: dict[str, Any]) -> str:
    """The English article as a plain outline: its headings, ideas and example words."""
    lines = [f"Item (English): {english.get('title', '')}", f"Idea: {english.get('summary', '')}"]
    for section in english.get("sections", []):
        lines.append(f"Section: {section.get('title', '')}")
        for block in section.get("blocks", []):
            kind = block.get("type")
            if kind == "paragraphs":
                lines.extend(f"  - {p}" for p in block.get("paragraphs", []))
            elif kind == "bullets":
                lines.extend(f"  - example: {i}" for i in block.get("items", []))
            elif kind == "table":
                headers = re.findall(r"<th>(.*?)</th>", block.get("html", ""))
                lines.append(f"  - table with columns: {', '.join(headers)}")
    return "\n".join(lines)


def prompt_for(topic: dict[str, str], item_ro: str, english: dict[str, Any], notes: list[str]) -> str:
    parts = [
        "You write a short grammar lesson for learners of ROMANIAN, in Romanian.",
        f"Chapter: Introducere în gramatică. Topic: {topic['ro'] or topic['en']} ({topic['en']}). "
        f"Item (Romanian title): {item_ro}.",
        "The English lesson below is only an OUTLINE of the idea this item teaches. Do NOT translate it. "
        "Write the lesson natively about how ROMANIAN works, with genuine Romanian examples.",
        ROMANIAN_FACTS,
        SIMPLE_RO,
        "Return one JSON object with exactly these keys:\n"
        '  "summary": one sentence, at most 25 words;\n'
        '  "what": {"paragraph": 2 to 4 short sentences explaining the idea, '
        '"examples": exactly 3 very short Romanian example sentences or words, each showing the idea};\n'
        '  "how": {"paragraph": 2 to 4 short sentences on how Romanian does it (forms, endings, order), '
        '"table": {"headers": [2 or 3 column titles], "rows": [3 to 6 rows, each a list of cells, one string per column]}}.\n'
        "Every table cell is a real Romanian form or word, correct and spelled with the right diacritics. "
        "In an example, put the important form between ** ** (for example: Copilul **mănâncă** un măr.). "
        "Every example must be natural, modern Romanian that a native speaker would really say; never force a form "
        "that sounds old-fashioned or wrong (for example, say 'Vreau să cânt', not 'Vreau a cânta'). "
        "No other markup, no HTML, no English words.",
        "English outline:\n" + outline_of(english),
    ]
    if notes:
        parts.append("Fix these problems from the previous attempt: " + "; ".join(notes))
    return "\n\n".join(parts)


CEDILLA = re.compile("[şţŞŢ]")
LATIN_ENGLISH = re.compile(r"\b(the|and|with|noun|verb form|singular form)\b", re.IGNORECASE)


def check(result: dict[str, Any]) -> list[str]:
    problems: list[str] = []

    def text(value: Any, label: str, low: int, high: int) -> str:
        if not isinstance(value, str) or not value.strip():
            problems.append(f"{label} is empty")
            return ""
        words = len(value.split())
        if not low <= words <= high:
            problems.append(f"{label} has {words} words (need {low}-{high})")
        return value

    everything: list[str] = []
    everything.append(text(result.get("summary"), "summary", 4, 30))
    what = result.get("what") or {}
    how = result.get("how") or {}
    everything.append(text(what.get("paragraph"), "what.paragraph", 12, 90))
    examples = what.get("examples")
    if not isinstance(examples, list) or len(examples) != 3 or not all(isinstance(e, str) and e.strip() for e in examples):
        problems.append("what.examples must be exactly 3 non-empty strings")
    else:
        everything.extend(examples)
    everything.append(text(how.get("paragraph"), "how.paragraph", 12, 100))
    table = how.get("table") or {}
    headers, rows = table.get("headers"), table.get("rows")
    if not isinstance(headers, list) or not 2 <= len(headers) <= 3 or not all(isinstance(h, str) and h.strip() for h in headers):
        problems.append("table.headers must be 2 or 3 strings")
    elif not isinstance(rows, list) or not 3 <= len(rows) <= 6:
        problems.append("table needs 3 to 6 rows")
    else:
        everything.extend(headers)
        for row in rows:
            if not isinstance(row, list) or len(row) != len(headers) or not all(isinstance(c, str) and c.strip() for c in row):
                problems.append("every table row needs one non-empty string per column")
                break
            everything.extend(row)
    joined = " ".join(everything)
    if CEDILLA.search(joined):
        problems.append("use comma-below ș ț, not the cedilla letters ş ţ")
    if re.search(r"[<>]", joined):
        problems.append("no HTML in the text")
    if LATIN_ENGLISH.search(" ".join(e for e in everything if e not in (examples or [])) ):
        problems.append("English words found; write in Romanian only")
    return problems


def proofread_prompt(item_ro: str, result: dict[str, Any]) -> str:
    return (
        "You are a strict proofreader and teacher of ROMANIAN grammar. Below is a short grammar lesson "
        f"for learners, titled '{item_ro}', as JSON. Check EVERY sentence and every table cell for: wrong or "
        "unnatural Romanian, wrong grammar (for example a doubled 'voi voi', a missing article or ending), "
        "spelling and diacritics (ă â î ș ț with comma below), wrong forms in the table, and statements about "
        "Romanian that are false. Fix each problem with the simplest correct Romanian; keep the same JSON "
        "structure, the same keys, exactly 3 examples, and the ** ** around the key form in examples. Keep the "
        "language simple. Return the corrected JSON object only.\n\n" + json.dumps(result, ensure_ascii=False)
    )


def block_table(headers: list[str], rows: list[list[str]]) -> str:
    esc = html.escape
    head = "".join(f"<th>{esc(h.strip())}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td><strong>{esc(c.strip())}</strong></td>" for c in row) + "</tr>" for row in rows)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def locale_text(title: str, result: dict[str, Any]) -> dict[str, Any]:
    what, how = result["what"], result["how"]
    return {
        "title": title,
        "summary": result["summary"].strip(),
        "status": "draft",
        "sections": [
            {
                "title": "Ce este",
                "blocks": [
                    {"type": "paragraphs", "paragraphs": [what["paragraph"].strip()]},
                    {"type": "bullets", "items": [e.strip() for e in what["examples"]]},
                ],
            },
            {
                "title": "Cum funcționează în română",
                "blocks": [
                    {"type": "paragraphs", "paragraphs": [how["paragraph"].strip()]},
                    {"type": "table", "html": block_table(how["table"]["headers"], how["table"]["rows"])},
                ],
            },
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Write the Romanian LT02 articles in simple Romanian.")
    parser.add_argument("--chapter", default="LT02")
    parser.add_argument("--topic", help="only this topic, e.g. LT02T09")
    parser.add_argument("--id", help="only this item id (a comma-separated list is fine), e.g. L838")
    parser.add_argument("--overwrite", action="store_true", help="rewrite items that already have a Romanian text")
    parser.add_argument("--dry-run", action="store_true", help="list what would be written and call nothing")
    parser.add_argument("--model", help="Gemini text model (default: GEMINI_MODEL from .env)")
    args = parser.parse_args()

    stories.load_env()
    import os

    model = args.model or DEFAULT_MODEL
    topics = load_topics()
    wanted_ids = set(args.id.split(",")) if args.id else None
    written = skipped = failed = 0
    paths = sorted(LECTURES.glob(f"{args.chapter}T*/L*.json"), key=lambda p: (p.parent.name, int(re.sub(r"\D", "", p.stem))))
    for path in paths:
        topic_code = path.parent.name
        if args.topic and topic_code != args.topic:
            continue
        item_id = path.stem
        if wanted_ids and item_id not in wanted_ids:
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
        if args.dry_run:
            print(f"  {topic_code}:{item_id} {title}: would write")
            written += 1
            continue
        try:
            result = stories.with_retries(
                f"{topic_code}:{item_id}",
                lambda: gemini(prompt_for(topic, title, english, list(stories.RETRY_NOTES)), 0.3, model),
                check,
            )
            result = stories.with_retries(
                f"{topic_code}:{item_id} proofread",
                lambda: gemini(proofread_prompt(title, result), 0.1, model),
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
