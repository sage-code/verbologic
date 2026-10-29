"""Make every character of every story unmistakable, in all nine languages.

A picture book is drawn from its text, so a reader and an illustrator must know
what each character IS. A line such as "his small friend Pip sits in the grass"
leaves the kind open: Pip could be anything, and the picture gets it wrong. This
script asks Gemini to review each English story and, where a character is
vague, to add its kind (and its sex, and whether it is one or several) at the
first mention, with the smallest edit that does it. It then:

- writes the edited English paragraphs, summary and `context:` map;
- re-translates the changed story into the other eight languages, keeping the
  title (so the name audio stays valid) and the paragraph count (so the
  pictures and reading pages line up);
- writes every language's document and the manifest's name/description.

Nothing else changes. Pictures and read recordings for an edited story are NOT
regenerated here: the read audio needs `generate-audio.py --read --id <code>`,
and the pictures need `generate-story-images.py --overwrite`, both run after this.

Examples:
  .venv/Scripts/python.exe scripts/review-story-characters.py --topic ST01T01 --code S013
  .venv/Scripts/python.exe scripts/review-story-characters.py --all
  .venv/Scripts/python.exe scripts/review-story-characters.py --all --dry-run
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import re
import sys
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
MEDIA = ROOT / "media"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.locales import DEFAULT_LOCALE, LOCALES  # noqa: E402  (single locale registry)
from lib import articles  # noqa: E402  (scripts/lib/articles.py: the shared article-file reader/writer)

#: Words per minute of reading, the same figure create-stories uses for `minutes`.
WORDS_PER_MINUTE = 90


def load_module(name: str, file: str):
    """Import a sibling script by path: its hyphenated name is not a module name."""
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def review_prompt(level: str, summary: str, paragraphs: list[str], context: dict[str, str]) -> str:
    count = len(paragraphs)
    numbered = "\n".join(f"{index + 1}. {text}" for index, text in enumerate(paragraphs))
    return (
        "You check an English story for a children's picture book. Every paragraph is drawn "
        "as a picture, so an illustrator and a young reader must know exactly who each "
        "character is.\n\n"
        "For EVERY character (a person, an animal, a creature, or a talking object that acts), "
        "the text must make these clear at its first mention:\n"
        "- what kind it is: for an animal, its kind (a mouse, a bear, a frog); for a person, "
        "whether it is a boy, a girl, a man, a woman, a mother, a king, and so on;\n"
        "- its sex when it matters, shown by he or she;\n"
        "- whether it is one or several.\n"
        "A vague word such as \"friend\", \"creature\", \"someone\", \"a little one\" or \"the "
        "stranger\" is NOT enough unless the kind is stated earlier in the story. Every "
        "pronoun must point at one clear character.\n\n"
        "Fix only what is unclear, with the smallest edit: add the kind (and the sex) where "
        'the character first appears, for example "His small friend Pip, a little brown '
        'mouse, sits in the grass." Do not change the plot, do not add or remove actions, '
        f"and keep exactly {count} paragraphs in their original order. Keep simple English at "
        f"CEFR {level}.\n\n"
        "Then list every character that acts in the story in \"context\": the key is the name "
        "the text uses (or the role, if it has no name), and the value is one short phrase "
        "saying what it IS, with the sex for a human, for example \"a little brown mouse\", "
        "\"a girl with a red hood\", \"a fairy, she carries a wand\", \"two white swans\". Keep the "
        "look words the current context already gives (size, colour, clothes, what it carries): "
        "the pictures are drawn from them.\n\n"
        "Return only a JSON object with these keys:\n"
        "\"changed\": true if you edited any paragraph or the summary, otherwise false;\n"
        "\"summary\": the one-sentence summary (edited only if it needs the same fix);\n"
        f"\"paragraphs\": the list of all {count} paragraphs, edited or not;\n"
        "\"context\": the object described above.\n\n"
        f"Current summary: {summary}\n"
        f"Current context: {json.dumps(context, ensure_ascii=False)}\n\n"
        f"Story:\n{numbered}"
    )


def check_review(result: dict[str, Any], count: int, clean_strings) -> list[str]:
    """Problems with the review, or [] when it can be written back safely."""
    problems: list[str] = []
    if not isinstance(result.get("changed"), bool):
        problems.append('"changed" must be true or false')
    if not isinstance(result.get("summary"), str) or not result["summary"].strip():
        problems.append("missing summary")
    paragraphs = clean_strings(result.get("paragraphs"))
    if paragraphs is None or len(paragraphs) != count:
        problems.append(f"must have exactly {count} paragraphs")
    else:
        result["paragraphs"] = paragraphs
    context = result.get("context")
    if not isinstance(context, dict) or not context:
        problems.append("context must name at least one character")
    elif not all(isinstance(what, str) and what.strip() for what in context.values()):
        problems.append("every context entry needs a phrase")
    return problems


def read_story(path: Path) -> dict[str, Any]:
    """The English page of a story's article file: the fields we keep, plus its paragraphs."""
    article = articles.read_article(path)
    en = article["locales"][DEFAULT_LOCALE]
    return {
        "title": en.get("title", ""),
        "summary": en.get("summary", ""),
        "paragraphs": [re.sub(r"\s+", " ", p).strip() for p in en.get("paragraphs", []) if p.strip()],
        "context": dict(article.get("context") or {}),
        "per_page": int(article.get("paragraphsPerPage") or 1),
        "order": article.get("order", ""),
        "status": en.get("status") or "draft",
    }


def story_items(topic: str | None, code: str | None) -> list[dict[str, Any]]:
    out = []
    for manifest in sorted(MEDIA.glob("stories/*/*/*/item.json")):
        item = json.loads(manifest.read_text(encoding="utf-8"))
        if item.get("kind") != "story":
            continue
        if topic and item.get("topic") != topic:
            continue
        if code and item.get("code") != code:
            continue
        out.append({"manifest": manifest, "item": item})
    return out


def write_documents(
    writer, topic: str, code: str, story: dict[str, Any], texts: dict[str, dict[str, Any]],
    per_page: int,
) -> None:
    """The story's article file, every language, through create-stories' own layout."""
    words = sum(len(p.split()) for p in story["paragraphs"])
    minutes = max(1, math.ceil(words / WORDS_PER_MINUTE))
    articles.write_article(
        articles.article_path(CONTENT, "stories", topic, code),
        writer.story_article(topic, code, texts, minutes, per_page, context=story["context"]),
    )


def update_manifest(path: Path, item: dict[str, Any], texts: dict[str, dict[str, Any]]) -> None:
    """The manifest's per-language name and description follow the new title and summary."""
    locales = item.setdefault("locales", {})
    for loc in LOCALES:
        row = locales.setdefault(loc, {})
        row["name"] = texts[loc]["title"]
        row["description"] = texts[loc]["summary"]
    path.write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def review_story(writer, path: Path, level: str, model: str, dry_run: bool) -> dict[str, Any] | None:
    story = read_story(path)
    count = len(story["paragraphs"])
    review = writer.with_retries(
        f"{path.stem} review",
        lambda: writer.gemini_json(review_prompt(level, story["summary"], story["paragraphs"], story["context"]), 0.3, model),
        lambda result: check_review(result, count, writer.clean_strings),
    )
    if not review.get("changed"):
        return None
    return {"story": story, "review": review}


def translate_story(writer, level: str, model: str, story: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    """The other languages, re-translated from the edited English."""
    fresh = {"title": story["title"], "summary": review["summary"], "paragraphs": review["paragraphs"]}
    others = [loc for loc in LOCALES if loc != DEFAULT_LOCALE]
    return writer.with_retries(
        f"{story['title']} translations",
        lambda: writer.gemini_json(writer.translation_prompt(fresh, level, others), 0.3, model),
        lambda result: writer.check_translations(result, fresh, others),
    )["locales"], fresh


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all", action="store_true", help="every story")
    scope.add_argument("--topic", help="every story of this topic (e.g. ST01T01)")
    parser.add_argument("--code", help="only this story code (with --topic)")
    parser.add_argument("--dry-run", action="store_true", help="review and report; write nothing")
    args = parser.parse_args()
    if args.code and not args.topic:
        parser.error("--code needs --topic")

    load_env()
    writer = load_module("create_stories", "create-stories.py")
    model = os.environ.get("GEMINI_MODEL", "")
    if not model:
        raise SystemExit("GEMINI_MODEL is required (set it in .env).")

    items = story_items(args.topic, args.code)
    if not items:
        print("no story manifests matched", file=sys.stderr)
        return 1

    changed = unchanged = failed = 0
    for entry in items:
        item = entry["item"]
        topic, code = str(item["topic"]), str(item["code"])
        level = str(item.get("cefr", "A1"))
        path = articles.article_path(CONTENT, "stories", topic, code)
        if not path.is_file():
            continue
        try:
            found = review_story(writer, path, level, model, args.dry_run)
        except Exception as error:  # noqa: BLE001 - report and keep going
            print(f"{code}: review FAILED {error}", file=sys.stderr)
            failed += 1
            continue
        if found is None:
            print(f"{code}: characters are clear, unchanged")
            unchanged += 1
            continue

        story, review = found["story"], found["review"]
        print(f"{code} ({level}) {story['title']!r}: CHANGED")
        for before, after in zip(story["paragraphs"], review["paragraphs"]):
            if before != after:
                print(f"  - {before}\n  + {after}")
        print("  context: " + "; ".join(f"{name} = {what}" for name, what in review["context"].items()))
        if args.dry_run:
            changed += 1
            continue
        try:
            translated, fresh = translate_story(writer, level, model, story, review)
        except Exception as error:  # noqa: BLE001 - keep the story as it was
            print(f"{code}: translation FAILED {error}; story left unchanged", file=sys.stderr)
            failed += 1
            continue
        texts = {DEFAULT_LOCALE: {"title": story["title"], "summary": fresh["summary"], "paragraphs": fresh["paragraphs"]}}
        for loc in LOCALES:
            if loc == DEFAULT_LOCALE:
                continue
            # The title stays: the name audio is recorded from it.
            texts[loc] = {
                "title": story_title_of(path, loc),
                "summary": translated[loc]["summary"],
                "paragraphs": translated[loc]["paragraphs"],
            }
        story_out = {"paragraphs": fresh["paragraphs"], "context": review["context"]}
        write_documents(writer, topic, code, story_out, texts, story["per_page"])
        update_manifest(entry["manifest"], item, texts)
        changed += 1

    verb = "Would change" if args.dry_run else "Changed"
    print(f"{verb} {changed} story(ies); unchanged {unchanged}; failed {failed}")
    return 1 if failed else 0


def story_title_of(path: Path, loc: str) -> str:
    """A language's current title, read from the article file."""
    return articles.read_article(path)["locales"][loc]["title"]


if __name__ == "__main__":
    raise SystemExit(main())
