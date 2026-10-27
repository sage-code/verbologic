"""Generate a story's illustrations with Gemini, in a Grigorescu-like style.

A story is a children's picture book: the reader shows one picture beside the
text, and the picture changes as the reader turns the page. Every reading page
gets exactly one picture, so the picture count is the page count.

A reading page holds the story's `paragraphsPerPage` paragraphs (front matter of
the English document): one at A1, two at A2, three from B1 up. The page split
here is the one the reading view makes, so picture N belongs to page N. A story
must have at least three pages, and therefore at least three pictures.

Every picture is resized to the reader's panel shape (4:5, 896x1120) before it is
saved, so the file on disk is the file the page shows. The reader shows the
whole picture, not a crop, so the composition keeps the subject inside the frame.

The pictures are SHARED by every language the story is translated into — they
live in the item's own `images/` folder, not under a locale — so they are
generated once from the story's own language and reused everywhere.

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

#: The picture's pixel size: 4:5, and 1120 tall keeps a 2x screen sharp at the
#: panel's height (about 510-620 CSS px).
PICTURE_WIDTH = 896
PICTURE_HEIGHT = 1120

#: 4:5, measured against the reader's picture panel (verbologic story page, three
#: equal panels in a row). The panel is nearly square on common desktop screens:
#: 481x510 at 1564x794, 387x436 at 1280x720, 415x482 at 1366x768, 493x616 at
#: 1600x900 — aspect 0.80 to 0.94. A 4:5 picture covers that range with the
#: largest side crop at about 15%, where 3:4 crops about 20% of the height and a
#: square crops about 20% of the width. 896x1120 also keeps a 2x screen sharp.
ASPECT_RATIO = "4:5"


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


def paragraphs_per_page(topic: str, code: str) -> int:
    """How many paragraphs one reading page holds, from the English document.

    The article schema reads the same `paragraphsPerPage` field (1 to 3), so the
    reader and this generator cut the story identically.
    """
    path = CONTENT / "stories" / topic / code / f"{CANONICAL}.md"
    if not path.is_file():
        return DEFAULT_PARAGRAPHS_PER_PAGE
    head = path.read_text(encoding="utf-8")[:800]
    match = re.search(r"^paragraphsPerPage:\s*(\d+)\s*$", head, re.MULTILINE)
    return int(match.group(1)) if match else DEFAULT_PARAGRAPHS_PER_PAGE


def fit_picture(raw: bytes) -> bytes:
    """Centre-crop to the panel's 4:5 shape and resize to PICTURE_WIDTH x PICTURE_HEIGHT.

    Gemini returns a picture close to 4:5 but not exact (928x1152 came back for
    a 4:5 request), so the crop removes the few pixels of excess and the resize
    gives every story the same pixel size. JPEG output, as the manifests expect.
    """
    from io import BytesIO

    from PIL import Image

    image = Image.open(BytesIO(raw)).convert("RGB")
    width, height = image.size
    target = PICTURE_WIDTH / PICTURE_HEIGHT
    if width / height > target:
        new_width = round(height * target)
        left = (width - new_width) // 2
        image = image.crop((left, 0, left + new_width, height))
    else:
        new_height = round(width / target)
        top = (height - new_height) // 2
        image = image.crop((0, top, width, top + new_height))
    image = image.resize((PICTURE_WIDTH, PICTURE_HEIGHT), Image.LANCZOS)
    out = BytesIO()
    image.save(out, format="JPEG", quality=88, optimize=True, progressive=True)
    return out.getvalue()


def story_paragraphs(track: str, topic: str, code: str, locale: str) -> list[str]:
    """The story body as reading pages — one paragraph per page.

    The same rule the reading view paginates by for a document with no
    headings, so picture N can be anchored to the page it first appears on.
    """
    path = CONTENT / track / topic / code / f"{locale}.md"
    if not path.is_file():
        return []
    body = FRONTMATTER_RE.sub("", path.read_text(encoding="utf-8"))
    body = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", body)
    body = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", body)
    paragraphs = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", body)]
    return [p for p in paragraphs if p]


def story_pages(paragraphs: list[str], per_page: int) -> list[list[str]]:
    """Group the story's paragraphs into reading pages, `per_page` to a page.

    The same grouping the reading view makes (`paginate()` in [doc].vue), so
    picture N is drawn for exactly the paragraphs the reader shows on page N.
    Only the last page may be short.
    """
    size = max(1, per_page)
    return [paragraphs[start:start + size] for start in range(0, len(paragraphs), size)]


#: Composition for the reader's panel. The reader shows the WHOLE picture (it is
#: never cropped to fit), so nothing the story needs may sit at the very edge:
#: the subjects stay well inside the frame and the edges carry only background.
COMPOSITION = (
    "Frame: a tall 4:5 portrait picture, filled edge to edge with painting — no "
    "border, no white margin, no vignette, no frame. Place the main characters "
    "large and well inside the frame, with their faces in the upper-middle of the "
    "picture and the key action inside the central three-fifths of the width. "
    "Keep a margin of background (sky, foliage, ground) around the characters, "
    "so no character, hand, or detail the story needs touches an edge."
)


def build_prompt(title: str, page: list[str], index: int, total: int) -> str:
    """One picture's prompt: the style, the frame, and the reading page it illustrates.

    The page may hold several paragraphs; the picture shows the moment they
    share, so the prompt gives all of them and asks for the page's main event.
    """
    position = (
        "This is the opening picture of the story."
        if index == 0
        else f"This is picture {index + 1} of {total}, later in the same story."
    )
    moment = "\n\n".join(page)
    return (
        f"{STYLE}\n\n"
        f"{COMPOSITION}\n\n"
        f"Story: \"{title}\". {position}\n"
        "Illustrate the main moment that this part of the story describes, "
        "showing the characters and setting in it. Keep the characters visually "
        "consistent with a single storybook: same clothing, same age, same colours.\n\n"
        f"Text of this page to illustrate:\n{moment}"
    )


def call_gemini_image(prompt: str, model: str) -> bytes:
    """Ask Gemini for one picture; returns the raw image bytes."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required (set it in .env).")
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            # 4:5 matches the reader's picture panel (see ASPECT_RATIO).
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
    """The story's title in its own language, from the markdown frontmatter."""
    path = CONTENT / "stories" / topic / code / f"{locale}.md"
    if not path.is_file():
        return code
    head = path.read_text(encoding="utf-8")[:600]
    match = re.search(r"^title:\s*(.+)$", head, re.MULTILINE)
    return match.group(1).strip().strip("'\"") if match else code


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


def write_manifest(path: Path, item: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(item, ensure_ascii=False, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Generate a story's illustrations with Gemini in a Grigorescu "
            "impressionist style. Every story gets three pictures, cropped to "
            "4:5, and the pictures are shared by every language the story is "
            "translated into."
        )
    )
    parser.add_argument("--topic", help="only this story topic (e.g. ST01T02)")
    parser.add_argument("--code", help="only this story code (e.g. S001)")
    parser.add_argument("--all", action="store_true", help="every story")
    parser.add_argument("--overwrite", action="store_true", help="regenerate existing pictures")
    parser.add_argument("--dry-run", action="store_true", help="report the plan, write nothing")
    parser.add_argument("--model", default=DEFAULT_IMAGE_MODEL, help="Gemini image model")
    args = parser.parse_args()

    load_env()
    if not (args.topic or args.code or args.all):
        parser.error("pass --topic, --code or --all")

    items = story_items(args.topic, args.code)
    if not items:
        print("no story manifests matched", file=sys.stderr)
        return 1

    written = 0
    skipped = 0
    failed = 0
    for manifest_path, item in items:
        topic = str(item["topic"])
        code = str(item["code"])
        # The story's own language is the one its prose was written in; the
        # pictures are shared, so one language is enough to describe them.
        source = next((loc for loc in LOCALES if (CONTENT / "stories" / topic / code / f"{loc}.md").is_file()), None)
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

        print(f"{code} [{item.get('cefr')}] {title!r}: {count} page(s), {per_page} paragraph(s) per page, one picture each")
        for index, page in enumerate(pages):
            target = images_dir / f"{index}.jpg"
            if target.is_file() and not args.overwrite:
                print(f"  [{index}] page {index + 1}: exists, skipped")
                skipped += 1
                continue
            prompt = build_prompt(title, page, index, count)
            if args.dry_run:
                print(f"  [{index}] page {index + 1}: would generate")
                written += 1
                continue
            try:
                raw = call_gemini_image(prompt, args.model)
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
