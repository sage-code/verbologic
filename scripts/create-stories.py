"""Create new illustrated stories for a topic: Gemini writes, translates and illustrates them.

  ./run.sh create story <TOPIC> <n>

For each of the n stories this:

1. Reads the topic's level from the stories sidebar (its `level`, e.g. A1 for
   ST01T02). Every story in a topic is written at that level.
2. Asks Gemini for an English story that follows the level's reading rules:
   how many paragraphs, how many paragraphs per reading page, and how simple the
   English is. Below B1 the English is simplified.
3. Asks Gemini for the same story in the other eight site languages, with the
   same number of paragraphs in each, so every reading page lines up everywhere.
4. Writes content/stories/<TOPIC>/<CODE>/<locale>.md for all nine locales, the
   media manifest media/stories/<CHAPTER>/<TOPIC>/<CODE>/item.json, and appends
   the code to the topic's items in the stories sidebar.
5. Paints one picture per reading page (scripts/generate-story-images.py).
6. Synthesizes the title audio and the full read (scripts/generate-audio.py),
   then reconciles the manifests (scripts/media-sync.mjs manifest).

Reading pages, per level (the same numbers the reader and the picture generator
use, via the article's `paragraphsPerPage`):

  A1  one paragraph a page      3-5 paragraphs
  A2  two paragraphs a page     6-8 paragraphs
  B1  three paragraphs a page   9-12 paragraphs
  B2+ three paragraphs a page   more pages, so more paragraphs

Every story has at least three pages, and so at least three pictures.

Nothing is uploaded here. Review the new files, then publish them with
'./run.sh media upload --apply' and rebuild with './run.sh build'.

Examples:
  ./run.sh create story ST01T02 2
  .venv/Scripts/python.exe scripts/create-stories.py ST01T02 1 --skip-audio
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content" / "stories"
MEDIA = ROOT / "media" / "stories"
SIDEBAR = ROOT / "src" / "data" / "sidebars" / "library" / "stories" / "sidebar.json"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.locales import DEFAULT_LOCALE, LOCALES  # noqa: E402  (single locale registry)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "models/gemini-3.5-flash-lite"

#: The fewest reading pages a story may have, and so the fewest pictures.
MIN_PAGES = 3

LANGUAGE_NAMES = {
    "en": "English",
    "ro": "Romanian",
    "de": "German",
    "ru": "Russian",
    "it": "Italian",
    "es": "Spanish",
    "fr": "French",
    "hu": "Hungarian",
    "pt": "Portuguese",
}

#: Reading rules per CEFR level. `per_page` is the article's paragraphsPerPage;
#: `paragraphs` is the (least, most) paragraphs a story of that level may have.
LEVELS: dict[str, dict[str, Any]] = {
    "A1": {
        "per_page": 1,
        "paragraphs": (3, 5),
        "english": (
            "very simple English: short sentences of about four to eight words, "
            "the present simple, only everyday words, no idioms and no phrasal verbs"
        ),
    },
    "A2": {
        "per_page": 2,
        "paragraphs": (6, 8),
        "english": (
            "simple English: short sentences, the past simple and the present "
            "continuous, and common linking words such as and, but, because, then"
        ),
    },
    "B1": {
        "per_page": 3,
        "paragraphs": (9, 12),
        "english": (
            "clear, natural English with some variety: compound sentences, the past "
            "perfect, simple conditionals, and new words explained by their context"
        ),
    },
    "B2": {
        "per_page": 3,
        "paragraphs": (12, 18),
        "english": "fluent, natural English with varied sentence structure and some idioms",
    },
    "C1": {
        "per_page": 3,
        "paragraphs": (15, 24),
        "english": "sophisticated, idiomatic English with rich vocabulary and subtle tone",
    },
    "C2": {
        "per_page": 3,
        "paragraphs": (18, 30),
        "english": "near-native English with full nuance, wordplay and complex syntax",
    },
}


def load_env() -> None:
    env_file = ROOT / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_model(model: str) -> str:
    model = model.strip()
    return model if model.startswith("models/") else f"models/{model}"


def gemini_json(prompt: str, temperature: float, model: str) -> dict[str, Any]:
    """One Gemini call that must return a JSON object."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required (set it in the project .env file).")
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "responseMimeType": "application/json"},
    }
    endpoint = (
        f"{GEMINI_API_URL}/{urllib.parse.quote(normalize_model(model), safe='/')}:generateContent?"
        f"{urllib.parse.urlencode({'key': api_key})}"
    )
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Gemini HTTP {error.code}: {detail}") from error
    text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    text = re.sub(r"\A```(?:json)?\s*|\s*```\Z", "", text)
    result = json.loads(text)
    if not isinstance(result, dict):
        raise ValueError("Gemini did not return a JSON object")
    return result


def story_prompt(topic_name: str, level: str, existing_titles: list[str]) -> str:
    spec = LEVELS[level]
    low, high = spec["paragraphs"]
    per_page = spec["per_page"]
    taken = ", ".join(f'"{title}"' for title in existing_titles) or "none yet"
    return (
        "You write short illustrated stories for a language-learning website. The "
        "stories are read by people learning English, and every page of a story "
        "gets a picture.\n\n"
        f'Collection: "{topic_name}". Every story in this collection is a CEFR {level} '
        f"story, so write it at that level.\n\n"
        f"Language: {spec['english']}.\n\n"
        "Structure:\n"
        f"- Write between {low} and {high} paragraphs. Each paragraph is one to three "
        "sentences and shows one clear moment: who is there, where they are, and what "
        "happens, so that it can be drawn as a picture.\n"
        f"- The paragraphs are read {per_page} to a page, so the story is a sequence of "
        "pages, and each page moves the plot forward.\n"
        "- Tell a complete story: a beginning that introduces the characters, a middle "
        "with one problem, and an ending that solves it with a gentle lesson or a "
        "warm feeling.\n"
        "- Keep the same characters and setting throughout, and use their names the same way each time.\n"
        "- Tell an original story, or a well-known public-domain tale told in your own "
        "words, that suits the collection.\n"
        f"- Do not reuse these titles: {taken}.\n\n"
        'Return only a JSON object with the keys "title" (a short title), "summary" '
        '(one sentence of at most 25 words) and "paragraphs" (a list of strings). '
        "Plain text in every string: no markdown, no numbering, no stage directions."
    )


def translation_prompt(story: dict[str, Any], level: str, locales: list[str]) -> str:
    count = len(story["paragraphs"])
    names = ", ".join(f"{LANGUAGE_NAMES[loc]} ({loc})" for loc in locales)
    shape = '{"locales": {"de": {"title": "...", "summary": "...", "paragraphs": ["..."]}}}'
    return (
        f"Translate this English learning story into {names}. The story is for learners "
        f"at CEFR {level}, so keep each translation simple and natural in its own language.\n\n"
        "Rules:\n"
        f"- Return exactly {count} paragraphs in every language, in the same order, one per "
        "English paragraph. Never merge, split or drop a paragraph: the pictures and the "
        "reading pages line up with them.\n"
        "- Translate the title and the summary too. Keep the names of people and places "
        "consistent with the English.\n"
        "- Plain text only, no markdown.\n\n"
        f"Return only a JSON object of this shape, with every language code as a key: {shape}\n\n"
        f"ENGLISH:\n{json.dumps(story, ensure_ascii=False)}"
    )


def clean_strings(values: Any) -> list[str] | None:
    if not isinstance(values, list):
        return None
    cleaned = [re.sub(r"\s+", " ", v).strip() for v in values if isinstance(v, str)]
    return cleaned if len(cleaned) == len(values) and all(cleaned) else None


def check_story(story: dict[str, Any], level: str) -> list[str]:
    """Problems with the English story, or [] when it follows the level's rules."""
    problems = []
    title, summary = story.get("title"), story.get("summary")
    if not isinstance(title, str) or not title.strip():
        problems.append("missing title")
    if not isinstance(summary, str) or not summary.strip():
        problems.append("missing summary")
    paragraphs = clean_strings(story.get("paragraphs"))
    if paragraphs is None:
        problems.append("paragraphs must be a list of non-empty strings")
        return problems
    story["paragraphs"] = paragraphs
    low, high = LEVELS[level]["paragraphs"]
    if not low <= len(paragraphs) <= high:
        problems.append(f"{len(paragraphs)} paragraphs, {level} needs {low} to {high}")
    pages = math.ceil(len(paragraphs) / LEVELS[level]["per_page"])
    if pages < MIN_PAGES:
        problems.append(f"{pages} page(s), a story needs at least {MIN_PAGES}")
    return problems


def check_translations(result: dict[str, Any], story: dict[str, Any], locales: list[str]) -> list[str]:
    """Problems with the translations, or [] when every language is complete and aligned."""
    problems = []
    translated = result.get("locales")
    if not isinstance(translated, dict):
        return ['translations must be under "locales"']
    count = len(story["paragraphs"])
    for loc in locales:
        entry = translated.get(loc)
        if not isinstance(entry, dict):
            problems.append(f"missing {loc}")
            continue
        if not isinstance(entry.get("title"), str) or not entry["title"].strip():
            problems.append(f"{loc} has no title")
        if not isinstance(entry.get("summary"), str) or not entry["summary"].strip():
            problems.append(f"{loc} has no summary")
        paragraphs = clean_strings(entry.get("paragraphs"))
        if paragraphs is None or len(paragraphs) != count:
            problems.append(f"{loc} must have exactly {count} paragraphs")
            continue
        entry["paragraphs"] = paragraphs
    return problems


def with_retries(label: str, attempt, validate) -> Any:
    """Run `attempt` until its result passes `validate`, up to three times."""
    problems: list[str] = []
    for number in range(1, 4):
        try:
            result = attempt()
            problems = validate(result)
            if not problems:
                return result
        except (RuntimeError, ValueError, KeyError, IndexError, TypeError) as error:
            problems = [str(error)]
        print(f"  {label}: attempt {number} rejected: {'; '.join(problems)}", file=sys.stderr)
    raise RuntimeError(f"{label} failed after three attempts: {'; '.join(problems)}")


def stories_in_topic(topic: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """The sidebar's section and topic entries for a stories topic code."""
    sidebar = json.loads(SIDEBAR.read_text(encoding="utf-8"))
    for section in sidebar.get("sections", []):
        for entry in section.get("topics", []):
            if entry.get("code") == topic:
                return section, entry
    return None


def existing_titles(topic: str) -> list[str]:
    titles = []
    for path in sorted((CONTENT / topic).glob("*/en.md")):
        match = re.search(r"^title:\s*(.+)$", path.read_text(encoding="utf-8")[:600], re.MULTILINE)
        if match:
            titles.append(match.group(1).strip().strip("'\""))
    return titles


def next_code(topic: str, chapter: str) -> str:
    """The next free story code: one past the highest used in the sidebar, content or media."""
    used = set()
    found = stories_in_topic(topic)
    if found:
        used.update(found[1].get("items", []))
    for folder in (CONTENT / topic, MEDIA / chapter / topic):
        if folder.is_dir():
            used.update(p.name for p in folder.iterdir() if p.is_dir())
    numbers = [int(code[1:]) for code in used if re.fullmatch(r"S\d{3}", code)]
    return f"S{(max(numbers) if numbers else 0) + 1:03d}"


def article_document(
    topic: str, code: str, locale: str, title: str, summary: str,
    paragraphs: list[str], minutes: int, per_page: int,
) -> str:
    """One locale's article: front matter as the content schema expects, then the paragraphs."""
    front = [
        "---",
        "track: stories",
        f"topic: {topic}",
        f"article: {code}",
        f"entity_id: '{topic}:{code}'",
        f"locale: {locale}",
        f"title: {json.dumps(title, ensure_ascii=False)}",
        f"summary: {json.dumps(summary, ensure_ascii=False)}",
        "status: draft",
        f"order: {int(code[1:])}",
        f"minutes: {minutes}",
        f"paragraphsPerPage: {per_page}",
        "---",
        "",
    ]
    return "\n".join(front) + "\n\n".join(paragraphs) + "\n"


def write_story(topic: str, chapter: str, code: str, level: str, story: dict[str, Any], translated: dict[str, Any]) -> None:
    """Write the nine article documents and the media manifest for one story."""
    per_page = LEVELS[level]["per_page"]
    words = sum(len(p.split()) for p in story["paragraphs"])
    minutes = max(1, math.ceil(words / 90))
    texts = {DEFAULT_LOCALE: {"title": story["title"], "summary": story["summary"], "paragraphs": story["paragraphs"]}}
    texts.update({loc: translated["locales"][loc] for loc in LOCALES if loc != DEFAULT_LOCALE})

    folder = CONTENT / topic / code
    folder.mkdir(parents=True, exist_ok=True)
    for loc in LOCALES:
        text = texts[loc]
        (folder / f"{loc}.md").write_text(
            article_document(topic, code, loc, text["title"], text["summary"], text["paragraphs"], minutes, per_page),
            encoding="utf-8",
            newline="\n",
        )

    item = {
        "code": code,
        "track": "stories",
        "chapter": chapter,
        "topic": topic,
        "kind": "story",
        "entity_id": f"{topic}:{code}",
        "cefr": level,
        "tags": [f"level#{level}"],
        "locales": {loc: {"name": texts[loc]["title"], "description": texts[loc]["summary"]} for loc in LOCALES},
        "files": {},
    }
    manifest = MEDIA / chapter / topic / code / "item.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def add_to_sidebar(topic: str, code: str) -> None:
    sidebar = json.loads(SIDEBAR.read_text(encoding="utf-8"))
    entry = next(
        (topic_entry for section in sidebar.get("sections", [])
         for topic_entry in section.get("topics", []) if topic_entry.get("code") == topic),
        None,
    )
    if entry is None:
        raise RuntimeError(f"topic {topic} is not in the stories sidebar")
    if code not in entry.setdefault("items", []):
        entry["items"].append(code)
    SIDEBAR.write_text(json.dumps(sidebar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def run_step(label: str, args: list[str]) -> bool:
    print(f"\n== {label}")
    result = subprocess.run(args, cwd=ROOT)
    if result.returncode != 0:
        print(f"!! {label} exited with code {result.returncode}", file=sys.stderr)
    return result.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create n illustrated stories for a stories topic, at the topic's CEFR level."
    )
    parser.add_argument("topic", help="stories topic code, e.g. ST01T02")
    parser.add_argument("count", type=int, help="how many stories to create")
    parser.add_argument("--model", help="Gemini text model (default: GEMINI_MODEL from .env)")
    parser.add_argument("--skip-audio", action="store_true", help="do not synthesize title and read audio")
    args = parser.parse_args()

    load_env()
    if args.count < 1:
        parser.error("count must be at least 1")
    topic = args.topic.upper()
    found = stories_in_topic(topic)
    if found is None:
        parser.error(f"{topic} is not a topic in src/data/sidebars/library/stories/sidebar.json")
    _, entry = found
    level = entry.get("level")
    if level not in LEVELS:
        parser.error(f"{topic} has level {level!r}; the story rules cover {', '.join(LEVELS)}")
    chapter = topic[:4]
    topic_name = entry.get("names", {}).get("en", topic)
    model = args.model or os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
    other_locales = [loc for loc in LOCALES if loc != DEFAULT_LOCALE]

    print(f"Creating {args.count} {level} stor{'y' if args.count == 1 else 'ies'} for {topic} ({topic_name}).")
    created: list[str] = []
    failed: list[str] = []
    for _ in range(args.count):
        code = next_code(topic, chapter)
        print(f"\n### {code}")
        try:
            titles = existing_titles(topic)
            story = with_retries(
                f"{code} story",
                lambda: gemini_json(story_prompt(topic_name, level, titles), 0.9, model),
                lambda result: check_story(result, level),
            )
            translated = with_retries(
                f"{code} translation",
                lambda: gemini_json(translation_prompt(story, level, other_locales), 0.3, model),
                lambda result: check_translations(result, story, other_locales),
            )
        except RuntimeError as error:
            print(f"!! {error}", file=sys.stderr)
            failed.append(f"{code}: text ({error})")
            break

        write_story(topic, chapter, code, level, story, translated)
        add_to_sidebar(topic, code)
        created.append(code)
        print(f"  wrote {len(story['paragraphs'])} paragraph(s) in {len(LOCALES)} languages: '{story['title']}'")

        if not run_step(f"{code} pictures (one per reading page)", [
            sys.executable, str(ROOT / "scripts" / "generate-story-images.py"), "--topic", topic, "--code", code,
        ]):
            failed.append(f"{code}: pictures (re-run: generate-story-images.py --topic {topic} --code {code})")
        if not args.skip_audio:
            for mode in ("--audio", "--read"):
                if not run_step(f"{code} audio {mode[2:]}", [
                    sys.executable, str(ROOT / "scripts" / "generate-audio.py"),
                    "--track", "stories", "--topic", topic, "--id", code, mode, "--apply",
                ]):
                    failed.append(f"{code}: audio {mode[2:]}")

    if created:
        run_step("media manifest (reconcile files on disk)", ["node", "scripts/media-sync.mjs", "manifest"])

    print("\nCreated: " + (", ".join(created) or "nothing"))
    for problem in failed:
        print(f"Needs attention: {problem}", file=sys.stderr)
    print("Next: review content/stories/" + topic + "/ and media/stories/" + chapter + "/" + topic + "/, then")
    print("      './run.sh validate', './run.sh build', and './run.sh media upload --apply' to publish.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
