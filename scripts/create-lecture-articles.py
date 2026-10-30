"""Write the pronunciation lecture articles of ONE target language into chapter 1.

  .venv/Scripts/python.exe scripts/create-lecture-articles.py --target fr --scaffold
  .venv/Scripts/python.exe scripts/create-lecture-articles.py --target fr --topic LT01T03 --preview
  .venv/Scripts/python.exe scripts/create-lecture-articles.py --target fr --apply

Chapter 1 is the same for every language: the topics LT01T03..T06 are shared, and
each ITEM teaches one language (its manifest's `target`). This script adds one
language's items to those shared topics.

The seed (scripts/seeds/lectures-LT01-<target>.json) lists each item with its
teaching focus, an example word in the target language, the HAND-WRITTEN IPA of
that example and its English gloss. `--scaffold` writes an empty seed with the
shared topic list; fill in the examples and IPA (no G2P — see CLAUDE.md).

Every article is written ONCE, in simple English, about the target language
(there are no per-locale translations: the reader falls back to English).
Convention for the audio script: a target-language word goes in ( ) and is read by the
native voice of the target language; the IPA in / / right after it is shown to the reader
and is NEVER read (scripts/generate-audio.py, synthesize_sections_mixed), then the meaning.

Each article is written to content/lectures/<TOPIC>/<ID>.json (the `en` page; any other
language already in the file is kept) as a draft, plus
a small manifest (media/lectures/<chapter>/<TOPIC>/<ID>/item.json) with
`target` set. With --apply the new item ids are appended to the topic's items in
the lectures sidebar. Existing article files are never overwritten unless
--overwrite is passed.
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
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
import articles  # noqa: E402  (scripts/lib/articles.py: the shared article-file writer)
import glossary  # noqa: E402  (scripts/lib/glossary.py: the fixed IPA terms)

ROOT = Path(__file__).resolve().parents[1]
SEEDS = ROOT / "scripts" / "seeds"
CONTENT = ROOT / "content" / "lectures"
MEDIA = ROOT / "media"
SIDEBAR = ROOT / "src" / "data" / "sidebars" / "library" / "lectures" / "sidebar.json"

#: Every site language: `terms` (the item's name) must cover all of them.
LOCALES = ["en", "es", "it", "fr", "de", "ru", "hu", "pt", "ro"]
LOCALE_NAMES = {
    "en": "English", "es": "Spanish", "it": "Italian", "fr": "French", "de": "German",
    "ru": "Russian", "hu": "Hungarian", "pt": "Portuguese", "ro": "Romanian",
}
LEVEL_NOTE = {
    "A1": "a beginner (very short, simple sentences)",
    "A2": "a beginner who knows the basics (short sentences, one idea each)",
}
SECTION_TITLES = ["The sound", "How to say it", "Reading rules", "Common mistakes"]
MAX_SENTENCE_WORDS = 15
MAX_ATTEMPTS = 3

# Reuse the Gemini client and .env loader from the stories script (same
# project, same key and model), instead of keeping a second copy.
_spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
_stories = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_stories)
gemini_json = _stories.gemini_json
load_env = _stories.load_env
DEFAULT_GEMINI_MODEL = _stories.DEFAULT_GEMINI_MODEL


def seed_path(target: str) -> Path:
    return SEEDS / f"lectures-LT01-{target}.json"


SIMPLE_ENGLISH = """SIMPLE ENGLISH (strict):
- Every sentence has at most 15 words and one idea. Use the present tense, the active voice and "you".
- Use only common everyday words (the first 2000 words of English). Say "mouth", "tongue", "lips", "air", "voice".
- Use phonetic terms only from the PHONETIC TERMS glossary below, and say what each one means the first time you use it.
- No idioms, no phrasal verbs, no long noun chains, no passive sentences, no semicolons, dashes or colons.
- Do not use markdown: no bold, no italics, no backticks, no lists."""


def allowed_words(item: dict[str, Any]) -> dict[str, str]:
    """The ONLY target-language words an article may quote, each with its hand-written IPA.

    The seed row gives the main `example` and, optionally, `extra` rows {word, ipa, gloss}. Gemini
    must not add words of its own: its IPA is a guess, and a wrong transcription gets read aloud.
    """
    words = {item["example"]: item["ipa"]}
    for extra in item.get("extra") or []:
        words[extra["word"]] = extra["ipa"]
    return words


def topic_context(topic: str, target: str, item: dict[str, Any]) -> str:
    """Where this lesson sits: chapter, topic, its neighbours and the lessons already written."""
    data = json.loads(SIDEBAR.read_text(encoding="utf-8"))
    for section in data["sections"]:
        codes = [t["code"] for t in section["topics"]]
        if topic not in codes:
            continue
        at = codes.index(topic)
        names = {t["code"]: t["names"]["en"] for t in section["topics"]}
        before = names[codes[at - 1]] if at > 0 else "none"
        after = names[codes[at + 1]] if at + 1 < len(codes) else "none"
        done = []
        for other in sorted((CONTENT / topic).glob("*.json")):
            en = articles.read_article(other).get("locales", {}).get("en")
            manifest = MEDIA / "lectures" / topic[:4] / topic / other.stem / "item.json"
            same = manifest.exists() and json.loads(manifest.read_text(encoding="utf-8")).get("target") == target
            if en and same and other.stem != item["id"]:
                done.append(en["title"])
        return (
            f'Chapter: "{section["names"]["en"]}". Topic: "{names[topic]}" (comes after "{before}" '
            f'and before "{after}"). Lessons already written for {LOCALE_NAMES[target]} in this topic: '
            f'{", ".join(done) or "none"}. Teach only your own point; do not repeat those lessons.'
        )
    return ""


def article_prompt(item: dict[str, Any], topic: str, level: str, target: str) -> str:
    language = LOCALE_NAMES[target]
    names = ", ".join(f"{LOCALE_NAMES[code]} ({code})" for code in LOCALES)
    words = allowed_words(item)
    word_list = "\n".join(f"  ({word}) {ipa}" for word, ipa in words.items())
    return f"""You write one reference article for a pronunciation lecture about {language}.
The reader is {LEVEL_NOTE.get(level, LEVEL_NOTE['A1'])}.

CONTEXT. {topic_context(topic, target, item)}

{SIMPLE_ENGLISH}

{glossary.writing_block()}

It will be read aloud next to the {language} audio, so say what the mouth, the stress and the
tone DO. Do not write for speakers of one native language: never say "English speakers",
"Romanians" and so on. If you compare, use a very common English word in single quotes.

Topic: {topic}
Teaching point (English): {item['focus']}
Heading idea: {item['title']}
Main example: {item['example']} {item['ipa']}, which means: {item['gloss']}

CLOSED WORD LIST. These are the ONLY {language} words you may write, each with its IPA exactly as given:
{word_list}
Do not write any other {language} word, not even a common one, not even in a comparison. If you
need another example, say "another word" or use an English word in single quotes. You do not know
the right IPA of any other word, and a wrong word is read aloud and a wrong IPA is shown to learners.

AUDIO CONVENTION (strict). Every listed {language} word goes in round brackets and is followed AT
ONCE by its IPA between slashes, copied exactly from the list. Then give the meaning if it helps.
  Right: Listen to ({item['example']}) {item['ipa']}, which means {item['gloss']}.
  Wrong: Listen to {item['example']}.  /  ({item['example']}) with no IPA after it.  /  IPA changed.
The audio reads the word in brackets in a native voice of {language} and never reads the IPA. The IPA
is there so the reader can see the pronunciation, so every bracketed word needs it right after it.
Pronunciation is taught through these words: say "you hear it in ({item['example']}) {item['ipa']}",
never "the sound /x/" with a bare IPA, because a bare IPA is silent in the recording and leaves a hole.
Every sentence must still be complete and correct when all IPA is deleted from it. Use round brackets
for nothing else.

Write exactly four sections, with these exact headings, in this order:
## {SECTION_TITLES[0]}
## {SECTION_TITLES[1]}
## {SECTION_TITLES[2]}
## {SECTION_TITLES[3]}
Each section is 25 to 60 words. Do not write front matter, a title line, a horizontal rule or a code block.

Also give "term": the name of this teaching point in each of these languages, 1 to 4 words:
{names}.
Also give "title" (at most 6 words) and "summary" (one sentence, at most 25 words).

Return one JSON object exactly like this:
{{"title": "...", "summary": "...", "body": "...", "terms": {{"en": "...", "es": "...", "it": "...", "fr": "...", "de": "...", "ru": "...", "hu": "...", "pt": "...", "ro": "..."}}}}"""


def check_article(result: dict[str, Any], item: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    title = str(result.get("title", "")).strip()
    summary = str(result.get("summary", "")).strip()
    body = str(result.get("body", "")).strip()
    terms = result.get("terms")
    if not title or len(title.split()) > 8:
        problems.append("title empty or too long")
    if not summary:
        problems.append("summary empty")
    if not isinstance(terms, dict) or any(not str(terms.get(code, "")).strip() for code in LOCALES):
        problems.append("terms missing for some language")
    headings = re.findall(r"^## (.+)$", body, flags=re.M)
    if headings != SECTION_TITLES:
        problems.append(f"sections must be exactly {SECTION_TITLES}, got {headings}")
    if re.search(r"^(---|```)", body, flags=re.M):
        problems.append("body has front matter, a rule or a code fence")
    # Punctuation is the lesson in LT01T06 ("Ei... nu știu."), but a bracketed word cannot carry
    # it, so compare the words only.
    def words_only(text: str) -> str:
        return " ".join(re.findall(r"\w+", text.lower()))

    if not set(words_only(item["example"]).split()) <= set(words_only(body).split()):
        problems.append(f"example '{item['example']}' not in body")
    # The audio reads the bracketed word in a native voice and never the IPA: the
    # reader still needs the IPA after every word, and an IPA with no word before it
    # is silent, so the sentence around it would have a hole.
    bare = re.findall(r"\([^)]*\)(?! /)", body)
    if bare:
        problems.append(f"bracketed word without IPA after it: {bare[:3]}")
    orphan = re.findall(r"(?<!\) )/[^/\s]+/", body)
    if orphan:
        problems.append(f"IPA without its (word) before it: {orphan[:3]}; name the sound with an example word")
    # Closed list: only the seed's words, with the seed's IPA. Anything else is invented.
    allowed = allowed_words(item)
    for word, ipa in re.findall(r"\(([^)]*)\) (/[^/]+/)", body):
        if word not in allowed:
            problems.append(f"invented word ({word}); allowed: {list(allowed)}")
        elif allowed[word] != ipa:
            problems.append(f"({word}) has IPA {ipa}, must be {allowed[word]}")
    if re.search(r"[`*]|^\s*[-*] ", body, flags=re.M):
        problems.append("markdown in body (bold, backticks or list)")
    problems.extend(glossary.check_writing(body))
    if body.count("(") != body.count(")"):
        problems.append("unbalanced round brackets")
    spoken = re.sub(r"\([^)]*\)|/[^/\s]+/", "", body)
    for sentence in re.split(r"(?<=[.!?])\s+", spoken):
        if len(sentence.split()) > MAX_SENTENCE_WORDS:
            problems.append(f"sentence over {MAX_SENTENCE_WORDS} words: {sentence[:50]!r}")
            break
    return problems


def load_article(item: dict[str, Any], topic: str, level: str, target: str, model: str) -> dict[str, Any]:
    last = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            result = gemini_json(article_prompt(item, topic, level, target), 0.4, model)
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


def sections_of(body: str) -> list[dict[str, Any]]:
    """The generated body (`## heading` + paragraphs) as article sections.

    A paragraph is a run of non-blank lines; a heading may sit directly above its text.
    """
    sections: list[dict[str, Any]] = []
    buffer: list[str] = []

    def flush() -> None:
        if not buffer:
            return
        if not sections:
            raise ValueError("text before the first heading")
        sections[-1]["paragraphs"].append("\n".join(buffer))
        buffer.clear()

    for line in str(body).strip().splitlines():
        if line.startswith("## "):
            flush()
            sections.append({"title": line[3:].strip(), "paragraphs": []})
        elif line.strip():
            buffer.append(line.strip())
        else:
            flush()
    flush()
    return sections


def document(topic: str, item: dict[str, Any], order: int, result: dict[str, Any], target: str) -> dict[str, Any]:
    """The article file content: keeps every language already in the file, replaces `en`."""
    terms = {code: str(result["terms"][code]).strip() for code in LOCALES}
    path = articles.article_path(CONTENT.parent, "lectures", topic, item["id"])
    article = articles.read_article(path) if path.exists() else {"entity_id": f"{topic}:{item['id']}", "locales": {}}
    article["order"] = order
    article["terms"] = terms
    article["targets"] = [target]  # the language this lesson teaches; the reader of any other never sees it
    article["locales"]["en"] = {
        "title": str(result["title"]).strip(),
        "summary": str(result["summary"]).strip(),
        "status": "draft",
        "sections": sections_of(result["body"]),
    }
    return article


def write_manifest(topic: str, item: dict[str, Any], level: str, target: str, terms: dict[str, str]) -> None:
    """Article items carry no media; the manifest gives generate-audio --read a place for its MP3,
    and `target` names the ONE language this item teaches (the topic is shared by all of them)."""
    path = MEDIA / "lectures" / topic[:4] / topic / item["id"] / "item.json"
    manifest = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    manifest.update({
        "code": item["id"],
        "track": "lectures",
        "chapter": topic[:4],
        "topic": topic,
        "kind": "article",
        "target": target,
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


def all_item_ids() -> set[str]:
    data = json.loads(SIDEBAR.read_text(encoding="utf-8"))
    return {i for s in data["sections"] for t in s["topics"] for i in t.get("items", [])}


def next_ids(count: int) -> list[str]:
    """Item codes are globally unique per track: continue after the highest L-number in use."""
    used = [int(i[1:]) for i in all_item_ids() if re.fullmatch(r"L\d+", i)]
    start = max(used, default=0) + 1
    return [f"L{n:03d}" for n in range(start, start + count)]


def add_items_to_sidebar(topic: str, ids: list[str]) -> None:
    """Append this language's items to the shared topic (other languages' items stay)."""
    raw = SIDEBAR.read_text(encoding="utf-8")
    data = json.loads(raw)
    for section in data["sections"]:
        for entry in section["topics"]:
            if entry["code"] == topic:
                have = entry.setdefault("items", [])
                have.extend(i for i in ids if i not in have)
                out = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
                SIDEBAR.write_text(out.replace("\n", "\r\n") if "\r\n" in raw else out, encoding="utf-8")
                return
    raise SystemExit(f"topic {topic} not in lectures sidebar")


def scaffold(target: str) -> None:
    """Write an empty seed with the shared article topics, ready for hand-written examples."""
    path = seed_path(target)
    if path.exists():
        raise SystemExit(f"{path.relative_to(ROOT)} already exists; not overwriting")
    data = json.loads(SIDEBAR.read_text(encoding="utf-8"))
    topics: dict[str, Any] = {}
    for section in data["sections"]:
        if section["code"] != "LT01":
            continue
        for entry in section["topics"]:
            if entry["layout"] == "article":
                topics[entry["code"]] = []
    note = (
        f"Seed rows for the {LOCALE_NAMES[target]} items of LT01 topics {', '.join(topics)}. "
        "Row: {title, focus, example, ipa, gloss}. `id` is optional: a row without one gets the next free "
        "L-code. Teaching points differ per language (French has no free stress, Hungarian has vowel harmony): "
        "write the list this language needs, not a copy of another's. IPA is hand-transcribed; have a native "
        "speaker review it before publishing."
    )
    path.write_text(json.dumps({"_note": note, "topics": topics}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}: fill in the rows, then run --preview")


def main() -> int:
    parser = argparse.ArgumentParser(description="Write one language's LT01 pronunciation lecture articles.")
    parser.add_argument("--target", choices=LOCALES, help="the language the articles teach (default: every language whose seed file exists)")
    parser.add_argument("--topic", action="append", help="only this topic (repeatable), e.g. LT01T03")
    parser.add_argument("--only", help="only these item ids, comma-separated, e.g. L627,L628")
    parser.add_argument("--model", help="Gemini text model (default: GEMINI_MODEL from .env)")
    parser.add_argument("--scaffold", action="store_true", help="write an empty seed file for --target and stop")
    parser.add_argument("--preview", action="store_true", help="print one article per selected item; writes nothing")
    parser.add_argument("--apply", action="store_true", help="write the articles, manifests and sidebar items")
    parser.add_argument("--overwrite", action="store_true", help="replace existing article files")
    args = parser.parse_args()
    if args.scaffold and not args.target:
        parser.error("--scaffold needs --target")
    if not args.scaffold and not args.preview and not args.apply:
        parser.error("choose --scaffold, --preview or --apply")
    targets = [args.target] if args.target else [code for code in LOCALES if seed_path(code).exists()]
    status = 0
    for target in targets:
        args.target = target
        status |= run(args)
    return status


def run(args: argparse.Namespace) -> int:
    """One target language: write its missing articles for the selected topics."""
    if args.scaffold:
        scaffold(args.target)
        return 0

    load_env()
    model = args.model or os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
    path = seed_path(args.target)
    if not path.exists():
        raise SystemExit(f"no seed for '{args.target}': run with --scaffold, then fill in {path.relative_to(ROOT)}")
    seed = json.loads(path.read_text(encoding="utf-8"))["topics"]
    only = set(args.only.split(",")) if args.only else None

    # Rows without an id get the next free code, once, and the seed keeps it.
    changed_seed = False
    pending = [row for rows in seed.values() for row in rows if not row.get("id")]
    if pending and args.apply:
        for row, new_id in zip(pending, next_ids(len(pending))):
            row["id"] = new_id
        changed_seed = True

    failed = False
    for topic, items in seed.items():
        if args.topic and topic not in args.topic:
            continue
        meta = sidebar_topic(topic)
        level = meta["level"]
        selected = [item for item in items if item.get("id") and (not only or item["id"] in only)]
        if not selected:
            continue
        print(f"== {topic} ({level}) {args.target}: {len(selected)} items", flush=True)
        for order, item in enumerate(items):
            if item not in selected:
                continue
            if args.preview:
                try:
                    result = load_article(item, topic, level, args.target, model)
                except RuntimeError as error:
                    print(f"  FAILED {error}")
                    failed = True
                    continue
                print(f"\n--- {item['id']} ---\n{result['title']}\n{result['body']}")
                continue
            out = articles.article_path(CONTENT.parent, "lectures", topic, item["id"])
            if out.exists() and "en" in articles.read_article(out).get("locales", {}) and not args.overwrite:
                print(f"  skipped {item['id']} (English page exists)", flush=True)
                continue
            try:
                result = load_article(item, topic, level, args.target, model)
            except RuntimeError as error:
                print(f"  FAILED {error}", flush=True)
                failed = True
                continue
            terms = {code: str(result["terms"][code]).strip() for code in LOCALES}
            articles.write_article(out, document(topic, item, order, result, args.target))
            write_manifest(topic, item, level, args.target, terms)
            print(f"  wrote {item['id']} ({item['title']})", flush=True)

        if args.apply and not failed and not only:
            add_items_to_sidebar(topic, [item["id"] for item in selected])
            print(f"  sidebar: {topic} += {selected[0]['id']}..{selected[-1]['id']} ({args.target})")
    if changed_seed and args.apply:
        path.write_text(json.dumps({"_note": json.loads(path.read_text(encoding='utf-8')).get("_note", ""), "topics": seed}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
