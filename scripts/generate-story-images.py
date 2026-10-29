"""Generate a story's illustrations with Gemini, in a Grigorescu-like style.

A story is a children's picture book: the reader shows one picture beside the
text, and the picture changes as the reader turns the page. Every reading page
gets exactly one picture, so the picture count is the page count.

A reading page holds the story's `paragraphsPerPage` paragraphs (front matter of
the English document): one at A1, two at A2, three from B1 up. The page split
here is the one the reading view makes, so picture N belongs to page N. A story
must have at least three pages, and therefore at least three pictures.

Every picture is a perfect square (1:1, 896x896) before it is saved, so the file on
disk is the file the page shows. The reader shows the whole picture, not a crop,
so the composition keeps the subject inside the frame.

The pictures are SHARED by every language the story is translated into — they
live in the item's own `images/` folder, not under a locale — so they are
generated once from the story's own language and reused everywhere.

Characters stay the same across the pages. The English document's `context:`
front matter says what each named character IS (`Pip: a white goose`). Every
picture gets that map, the story so far, and the picture before it, so a later
page that names the goose only as "Pip" still draws a goose. Write the map with
`--backfill-context` for stories that do not have one yet.

Style: Nicolae Grigorescu, the Romanian impressionist. Visible brush strokes,
warm earthy palette, soft dappled light, deliberately not photorealistic. The
prompt forbids text in the image: a generated caption would be in the wrong
language for eight of the nine locales, and it would duplicate the paragraph
the reader is already showing.

Pipeline after generating (the pictures are uploaded like any other media):

  node scripts/media-sync.mjs manifest
  node scripts/media-sync.mjs upload --apply

Examples:
  .venv/Scripts/python.exe scripts/generate-story-images.py --topic ST01T02
  .venv/Scripts/python.exe scripts/generate-story-images.py --topic ST01T02 --code S001 --overwrite
  .venv/Scripts/python.exe scripts/generate-story-images.py --all --dry-run
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media"
CONTENT = ROOT / "content"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.locales import LOCALES  # noqa: E402  (single locale registry)
from lib import articles  # noqa: E402  (scripts/lib/articles.py: the shared article-file reader/writer)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"
#: The image model. Flash is fast and cheap enough for a whole library; the
#: pro model is better at composition but costs several times as much per
#: picture, which does not pay off for a 1-5 picture storybook.
DEFAULT_IMAGE_MODEL = "models/gemini-3.1-flash-image"

FRONTMATTER_RE = re.compile(r"^---\s*\n.*?\n---\s*\n", re.DOTALL)

#: The house style. Grigorescu painted Romanian rural life in loose, warm
#: impressionist strokes; the point is that a child sees a PAINTING, not a
#: photograph, so the prompt asks for visible brushwork and forbids the
#: glossy, over-rendered look image models default to.
STYLE = (
    "A children's storybook illustration painted in the impressionist style of "
    "Nicolae Grigorescu: visible loose brush strokes, warm earthy palette of "
    "ochre, olive green and soft blue, dappled sunlight, gentle and friendly "
    "mood, painterly and deliberately NOT photorealistic. "
    "No text, no lettering, no captions, no watermark, no signature."
)

#: The fewest reading pages a story may have, and so the fewest pictures.
MIN_PAGES = 3
#: The canonical story language. Pictures are described from its text.
CANONICAL = "en"
#: Paragraphs on one reading page when the story's front matter does not say.
DEFAULT_PARAGRAPHS_PER_PAGE = 1

#: The picture's pixel size: a perfect square. 896 keeps a 2x screen sharp at the
#: picture's size on the reader (about 440-520 CSS px square on desktop).
PICTURE_SIZE = 896

#: 1:1, the reader's picture panel is always square (verbologic story page, the
#: picture beside the text on landscape screens, below it on portrait ones).
ASPECT_RATIO = "1:1"


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


def article_file(topic: str, code: str) -> Path:
    """The story's article file: every language of one story in content/stories/<TOPIC>/<CODE>.json."""
    return articles.article_path(CONTENT, "stories", topic, code)


def load_article(topic: str, code: str) -> dict[str, Any] | None:
    path = article_file(topic, code)
    return articles.read_article(path) if path.is_file() else None


def paragraphs_per_page(topic: str, code: str) -> int:
    """How many paragraphs one reading page holds, from the article's `paragraphsPerPage`.

    The article schema reads the same field (1 to 3), so the reader and this
    generator cut the story identically.
    """
    article = load_article(topic, code)
    return int(article.get("paragraphsPerPage", DEFAULT_PARAGRAPHS_PER_PAGE)) if article else DEFAULT_PARAGRAPHS_PER_PAGE


def fit_picture(raw: bytes) -> bytes:
    """Centre-crop to a square and resize to PICTURE_SIZE x PICTURE_SIZE.

    A portrait picture loses its top and bottom, a landscape one its left and
    right, so the subject stays in the middle of whichever way it was drawn. The
    resize gives every story the same pixel size. JPEG output, as the manifests
    expect.
    """
    from io import BytesIO

    from PIL import Image

    image = Image.open(BytesIO(raw)).convert("RGB")
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((PICTURE_SIZE, PICTURE_SIZE), Image.LANCZOS)
    out = BytesIO()
    image.save(out, format="JPEG", quality=88, optimize=True, progressive=True)
    return out.getvalue()


def story_paragraphs(track: str, topic: str, code: str, locale: str) -> list[str]:
    """The story body as reading pages — one paragraph per page.

    The same rule the reading view paginates by for a document with no
    headings, so picture N can be anchored to the page it first appears on.
    """
    article = load_article(topic, code) if track == "stories" else None
    doc = (article or {}).get("locales", {}).get(locale)
    if not doc:
        return []
    paragraphs = [re.sub(r"\s+", " ", p).strip() for p in doc.get("paragraphs", [])]
    return [p for p in paragraphs if p]


def story_pages(paragraphs: list[str], per_page: int) -> list[list[str]]:
    """Group the story's paragraphs into reading pages, `per_page` to a page.

    The same grouping the reading view makes (`paginate()` in [doc].vue), so
    picture N is drawn for exactly the paragraphs the reader shows on page N.
    Only the last page may be short.
    """
    size = max(1, per_page)
    return [paragraphs[start:start + size] for start in range(0, len(paragraphs), size)]


def story_context(topic: str, code: str) -> dict[str, str]:
    """The story's characters and what each one is, from the article's `context` map.

    One `Name: what it is` entry per character. A story without one returns an
    empty map, and its pictures then rely on the text alone.
    """
    article = load_article(topic, code)
    return dict((article or {}).get("context") or {})


def write_story_context(path: Path, context: dict[str, str]) -> None:
    """Add a `context` map to the story's article file (refuses to replace an existing one)."""
    article = articles.read_article(path)
    if article.get("context"):
        raise ValueError(f"{path}: already has a context")
    article["context"] = context
    articles.write_article(path, article)


#: Composition for the reader's panel. The reader shows the WHOLE picture (it is
#: never cropped to fit), so nothing the story needs may sit at the very edge:
#: the subjects stay well inside the frame and the edges carry only background.
COMPOSITION = (
    "Frame: a perfect square 1:1 picture, filled edge to edge with painting — no "
    "border, no white margin, no vignette, no frame. Place the main characters "
    "large and well inside the frame, with their faces in the upper-middle of the "
    "picture and the key action inside the central three-fifths of the width. "
    "Keep a margin of background (sky, foliage, ground) around the characters, "
    "so no character, hand, or detail the story needs touches an edge."
)


def build_prompt(
    title: str,
    characters: dict[str, str],
    earlier: list[str],
    page: list[str],
    index: int,
    total: int,
) -> str:
    """One picture's prompt: the style, the characters, the story so far, and the page.

    A character keeps the kind it was introduced as. The text may later name it
    by its name alone ("Pip is sad"), so the prompt states what each named
    character IS, and gives the earlier pages so the reader's introduction of it
    is in view. The page may hold several paragraphs; the picture shows the
    moment they share.
    """
    position = (
        "This is the opening picture of the story."
        if index == 0
        else f"This is picture {index + 1} of {total}, later in the same story."
    )
    parts = [STYLE, COMPOSITION, f"Story: \"{title}\". {position}"]
    if characters:
        cast = "\n".join(f"- {name}: {what}" for name, what in characters.items())
        parts.append(
            "The characters of this story. Draw each one as the kind of creature or "
            "person described here, with the same look and clothes in every picture, "
            "even on a page that names it only by its name:\n" + cast
        )
    if earlier:
        parts.append(
            "The story so far, from the earlier pages. The characters are introduced "
            "here, so keep their kind and appearance:\n" + "\n\n".join(earlier)
        )
    if index > 0:
        parts.append(
            "The previous picture of this story is attached. Keep its characters, "
            "their appearance and the setting, and change only what this page's "
            "moment requires."
        )
    moment = "\n\n".join(page)
    parts.append(
        "Illustrate the main moment that this page describes, showing the characters "
        "and setting in it. Keep the characters visually consistent with a single "
        "storybook: same kind, same clothing, same age, same colours.\n\n"
        f"Text of this page to illustrate:\n{moment}"
    )
    return "\n\n".join(parts)


def call_gemini_image(prompt: str, model: str, reference: bytes | None = None) -> bytes:
    """Ask Gemini for one picture; returns the raw image bytes.

    `reference` is the picture drawn just before this one. Sending it as an input
    keeps the same characters and setting across the pages, where text alone let
    them drift.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required (set it in .env).")
    parts: list[dict[str, Any]] = []
    if reference:
        parts.append({"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(reference).decode("ascii")}})
    parts.append({"text": prompt})
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            # 1:1 matches the reader's picture panel (see ASPECT_RATIO).
            "imageConfig": {"aspectRatio": ASPECT_RATIO},
        },
    }
    url = f"{GEMINI_API_URL}/{model}:generateContent?key={api_key}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Gemini HTTP {error.code}: {detail}") from error
    for candidate in data.get("candidates") or []:
        for part in (candidate.get("content") or {}).get("parts") or []:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])
    raise RuntimeError("Gemini returned no image data")


def story_title(topic: str, code: str, locale: str) -> str:
    """The story's title in its own language, from the article file."""
    article = load_article(topic, code)
    doc = (article or {}).get("locales", {}).get(locale)
    return doc["title"] if doc and doc.get("title") else code


def story_items(topic: str | None, code: str | None) -> list[tuple[Path, dict[str, Any]]]:
    """Every story manifest to consider, filtered by topic and code."""
    out: list[tuple[Path, dict[str, Any]]] = []
    for manifest_path in sorted(MEDIA.glob("stories/*/*/*/item.json")):
        item = json.loads(manifest_path.read_text(encoding="utf-8"))
        if item.get("kind") != "story":
            continue
        if topic and item.get("topic") != topic:
            continue
        if code and item.get("code") != code:
            continue
        out.append((manifest_path, item))
    return out


def characters_prompt(text: str) -> str:
    """Ask for the story's named characters, each with what it is."""
    return (
        "Below is a short children's story. List its characters: every person, animal, "
        "creature or talking object that acts in it, named or not. For each one, write a "
        "short phrase saying what it IS and its main look, for example "
        '"Pip": "a small white goose with an orange beak". Use the name exactly as the '
        'story writes it. A character with no name is keyed by its role, for example '
        '"the fairy": "a small winged fairy with a wand". At most four characters. Return '
        "only a JSON object that maps each key to its phrase, with no other keys.\n\nStory:\n"
        + text
    )


def backfill_context(items: list[tuple[Path, dict[str, Any]]], dry_run: bool) -> int:
    """Write a `context:` map into every English story that does not have one yet.

    One Gemini text call per story, reading the English text. The map is then
    part of the document, so the picture generator and every later run see it.
    """
    import importlib.util

    # create-stories.py owns the text model call; load it rather than copy it.
    spec = importlib.util.spec_from_file_location("create_stories", Path(__file__).with_name("create-stories.py"))
    writer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(writer)
    model = os.environ.get("GEMINI_MODEL", "")
    if not model:
        raise SystemExit("GEMINI_MODEL is required for --backfill-context (set it in .env).")

    written = 0
    skipped = 0
    failed = 0
    for _, item in items:
        topic = str(item["topic"])
        code = str(item["code"])
        path = article_file(topic, code)
        if not path.is_file():
            skipped += 1
            continue
        if story_context(topic, code):
            print(f"  {code}: has a context, skipped")
            skipped += 1
            continue
        text = "\n\n".join(story_paragraphs("stories", topic, code, CANONICAL))
        try:
            found = writer.gemini_json(characters_prompt(text), 0.2, model)
        except Exception as error:  # noqa: BLE001 - report and keep going
            print(f"  {code}: FAILED {error}", file=sys.stderr)
            failed += 1
            continue
        context = {str(name): str(what).strip() for name, what in found.items() if str(what).strip()}
        if not context:
            print(f"  {code}: no named characters found, skipped")
            skipped += 1
            continue
        print(f"  {code}: " + "; ".join(f"{name} = {what}" for name, what in context.items()))
        if not dry_run:
            write_story_context(path, context)
        written += 1

    verb = "Would write" if dry_run else "Wrote"
    print(f"{verb} a context for {written} story(ies); skipped {skipped}; failed {failed}")
    return 1 if failed else 0


def write_manifest(path: Path, item: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(item, ensure_ascii=False, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Generate a story's illustrations with Gemini in a Grigorescu "
            "impressionist style. Every reading page gets one square picture, and "
            "the pictures are shared by every language the story is "
            "translated into."
        )
    )
    parser.add_argument("--topic", help="only this story topic (e.g. ST01T02)")
    parser.add_argument("--code", help="only this story code (e.g. S001)")
    parser.add_argument("--all", action="store_true", help="every story")
    parser.add_argument("--overwrite", action="store_true", help="regenerate existing pictures")
    parser.add_argument("--dry-run", action="store_true", help="report the plan, write nothing")
    parser.add_argument("--model", default=DEFAULT_IMAGE_MODEL, help="Gemini image model")
    parser.add_argument(
        "--backfill-context",
        action="store_true",
        help="write a `context:` character map into English stories that lack one (text only, no pictures)",
    )
    args = parser.parse_args()

    load_env()
    if not (args.topic or args.code or args.all):
        parser.error("pass --topic, --code or --all")

    items = story_items(args.topic, args.code)
    if not items:
        print("no story manifests matched", file=sys.stderr)
        return 1
    if args.backfill_context:
        return backfill_context(items, args.dry_run)

    written = 0
    skipped = 0
    failed = 0
    for manifest_path, item in items:
        topic = str(item["topic"])
        code = str(item["code"])
        # The story's own language is the one its prose was written in; the
        # pictures are shared, so one language is enough to describe them.
        source = next((loc for loc in LOCALES if story_paragraphs("stories", topic, code, loc)), None)
        if not source:
            print(f"  {code}: no story text, skipped", file=sys.stderr)
            skipped += 1
            continue
        paragraphs = story_paragraphs("stories", topic, code, source)
        if not paragraphs:
            print(f"  {code}: empty story, skipped", file=sys.stderr)
            skipped += 1
            continue
        per_page = paragraphs_per_page(topic, code)
        pages = story_pages(paragraphs, per_page)
        if len(pages) < MIN_PAGES:
            print(f"  {code}: {len(pages)} page(s), a story needs at least {MIN_PAGES}; skipped", file=sys.stderr)
            skipped += 1
            continue
        # One picture per reading page: the count is the page count.
        count = len(pages)
        title = story_title(topic, code, source)
        item_dir = manifest_path.parent
        images_dir = item_dir / "images"
        characters = story_context(topic, code)

        print(f"{code} [{item.get('cefr')}] {title!r}: {count} page(s), {per_page} paragraph(s) per page, one picture each")
        if not characters:
            print(f"  {code}: no `context` in the article file, pictures rely on the text alone (run --backfill-context)")
        for index, page in enumerate(pages):
            target = images_dir / f"{index}.jpg"
            if target.is_file() and not args.overwrite:
                print(f"  [{index}] page {index + 1}: exists, skipped")
                skipped += 1
                continue
            earlier = [paragraph for previous in pages[:index] for paragraph in previous]
            prompt = build_prompt(title, characters, earlier, page, index, count)
            if args.dry_run:
                print(f"  [{index}] page {index + 1}: would generate")
                written += 1
                continue
            # The picture drawn just before this one is the reference for this one.
            previous_picture = images_dir / f"{index - 1}.jpg"
            reference = previous_picture.read_bytes() if index > 0 and previous_picture.is_file() else None
            try:
                raw = call_gemini_image(prompt, args.model, reference)
            except RuntimeError as error:
                print(f"  [{index}] page {index + 1}: FAILED {error}", file=sys.stderr)
                failed += 1
                continue
            images_dir.mkdir(parents=True, exist_ok=True)
            target.write_bytes(fit_picture(raw))
            print(f"  [{index}] page {index + 1}: wrote {target.relative_to(ROOT).as_posix()} ({len(raw)} bytes)")
            written += 1

        if args.dry_run:
            continue
        # Record the pictures in the manifest so media-index can publish them.
        from hashlib import sha1 as sha1_hash

        item["images"] = []
        for index in range(count):
            target = images_dir / f"{index}.jpg"
            if not target.is_file():
                continue
            item["images"].append({
                "file": f"images/{index}.jpg",
                "bytes": target.stat().st_size,
                "sha1": sha1_hash(target.read_bytes()).hexdigest(),
                "page": index,
            })
        write_manifest(manifest_path, item)

    verb = "Would generate" if args.dry_run else "Generated"
    print(f"{verb} {written} picture(s); skipped {skipped}; failed {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
