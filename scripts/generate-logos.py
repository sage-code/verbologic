"""Generate the header logo PNGs and favicon set from src/assets/img/earth-logo.jpg.

Chroma-key background removal: the source JPG has a near-solid navy background
(~rgb(0, 24, 62)); per-pixel color distance to that reference is mapped onto a
smooth alpha ramp (navy -> fully transparent, foreground -> fully opaque, with
anti-aliased edges in between).

The mark is a globe drawn with meridian/parallel line work. For visibility the
lines are thickened and their alpha boosted. The header logos are line work
only — white meridians for the dark theme, black for the light theme. For the
favicons, the ocean enclosed by the line work is additionally flood-filled so
the mark reads as a filled disc in a browser tab. The area outside the globe
stays fully transparent in every output:

  * src/assets/img/earth-logo-white.png — white meridians only (dark theme)
  * src/assets/img/earth-logo-black.png — black meridians only (light theme)
  * public/favicon.svg — adaptive: flips between the light-chrome palette
    (dark-blue ocean, white meridians) and the dark-chrome palette (light-blue
    ocean, dark-navy meridians) via an embedded prefers-color-scheme media
    query (Chromium + Firefox; Safari renders the light default)
  * public/favicon.png (32px) + public/favicon.ico (16/32/48) — fallback
    rasters using the light-chrome palette

Run from the repo root:  .venv/Scripts/python.exe scripts/generate-logos.py
"""
import base64
import io
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "assets" / "img" / "earth-logo.jpg"
OUT_DIR = ROOT / "src" / "assets" / "img"

BG = (0, 24, 62)  # background navy sampled from the source JPG corners
LO, HI = 40, 110  # alpha ramp bounds: < LO fully transparent, > HI fully opaque
SIZE = 64  # header logo canvas in px (displayed at 32px => 2x retina)
PAD_RATIO = 0.04  # breathing room around the mark, as a fraction of its side

VARIANTS = {
    "earth-logo-white.png": (255, 255, 255),  # dark theme — white meridians
    "earth-logo-black.png": (0, 0, 0),  # light theme — black meridians
}

# Adaptive favicon palettes — tuned for contrast against the browser chrome
# each scheme implies, keeping the ocean fill and a transparent outside:
#   light chrome -> dark-blue disc, white meridians
#   dark chrome  -> light-blue disc, dark-navy meridians
FAVICON_SCHEMES = {
    "light": {"ocean": (59, 110, 224), "lines": (255, 255, 255)},  # brand-500 / white
    "dark": {"ocean": (138, 176, 255), "lines": (11, 17, 32)},  # brand-700 / body navy
}
FAVICON_FALLBACK_SCHEME = "light"  # Safari & legacy render the light palette
FAVICON_DIR = ROOT / "public"
FAVICON_SVG_SIZE = 64  # px canvas embedded in the adaptive SVG

LINE_THICKEN = 5  # MaxFilter size (source px) — thickens lines, closes AA gaps
LINE_BOOST = 1.5  # alpha multiplier — keeps the line work bright after downscale



def build_alpha_mask(im: Image.Image) -> Image.Image:
    """Smooth 8-bit alpha mask from color distance to the background reference."""
    reference = Image.new("RGB", im.size, BG)
    diff = ImageChops.difference(im, reference).convert("L")
    ramp = [round(max(0.0, min(1.0, (v - LO) / (HI - LO))) * 255) for v in range(256)]
    return diff.point(ramp)


def brighten_lines(mask: Image.Image) -> Image.Image:
    """Thicken the meridian/parallel line work and boost its alpha."""
    thickened = mask.filter(ImageFilter.MaxFilter(LINE_THICKEN))
    return thickened.point(lambda v: min(255, round(v * LINE_BOOST)))


def ocean_region(line_alpha: Image.Image) -> Image.Image:
    """Alpha mask of the ocean enclosed by the globe's line work.

    The binary line work is dilated to close anti-aliasing gaps, then every
    region reachable from the image corners is flood-filled; whatever remains
    unreached lies inside the globe.
    """
    closed = line_alpha.point(lambda v: 255 if v > 12 else 0)
    closed = closed.filter(ImageFilter.MaxFilter(LINE_THICKEN))
    w, h = closed.size
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if closed.getpixel(seed) == 0:
            ImageDraw.floodfill(closed, seed, 128)
    return closed.point(lambda v: 255 if v == 0 else 0)


def square(mask: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    """Crop to bbox, then pad symmetrically to a square with a small margin."""
    cropped = mask.crop(bbox)
    w, h = cropped.size
    side = max(w, h)
    pad = round(side * PAD_RATIO)
    side += pad * 2
    padded = Image.new("L", (side, side), 0)
    padded.paste(cropped, ((side - w) // 2, (side - h) // 2))
    return padded


def compose(
    ocean_alpha: Image.Image,
    ocean_color: tuple[int, int, int],
    line_alpha: Image.Image,
    line_color: tuple[int, int, int],
) -> Image.Image:
    """Ocean fill underneath, line work on top, transparent outside."""
    ocean = Image.new("RGBA", ocean_alpha.size, ocean_color + (0,))
    ocean.putalpha(ocean_alpha)
    lines = Image.new("RGBA", line_alpha.size, line_color + (0,))
    lines.putalpha(line_alpha)
    return Image.alpha_composite(ocean, lines)


def to_data_uri(im: Image.Image) -> str:
    """Encode a raster as a base64 PNG data URI for embedding in the SVG."""
    buffer = io.BytesIO()
    im.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def build_adaptive_svg(schemes: dict[str, Image.Image]) -> str:
    """Single-file adaptive favicon: both scheme palettes embedded as rasters,
    flipped by a prefers-color-scheme media query inside the SVG (supported by
    Chromium and Firefox; Safari renders the default light palette)."""
    images = "".join(
        f'<image class="{scheme}" width="{FAVICON_SVG_SIZE}" '
        f'height="{FAVICON_SVG_SIZE}" href="{to_data_uri(raster)}"/>'
        for scheme, raster in schemes.items()
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {FAVICON_SVG_SIZE} {FAVICON_SVG_SIZE}">'
        "<style>"
        ".dark{display:none}"
        "@media (prefers-color-scheme: dark)"
        "{.light{display:none}.dark{display:block}}"
        "</style>"
        f"{images}</svg>"
    )


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    line_alpha = brighten_lines(build_alpha_mask(im))
    ocean_alpha = ocean_region(line_alpha)

    total = line_alpha.width * line_alpha.height
    print(f"source: {SRC.name} {im.size}, line work opaque: {line_alpha.histogram()[255] / total:.1%}")

    ocean_coverage = ocean_alpha.histogram()[255] / total
    if ocean_coverage < 0.01:
        raise SystemExit("ocean fill failed — globe rim not closed; check thresholds")
    print(f"ocean fill covers {ocean_coverage:.1%} of the frame")

    # Crop to the globe (the line work defines the extent) and pad to a
    # square with a margin.
    bbox = line_alpha.getbbox()
    line_alpha = square(line_alpha, bbox)
    ocean_alpha = square(ocean_alpha, bbox)

    # Header logos — bright line work only, no ocean fill: white meridians on
    # the dark theme, black meridians on the light theme.
    for name, color in VARIANTS.items():
        out = Image.new("RGBA", line_alpha.size, color + (0,))
        out.putalpha(line_alpha)
        out = out.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        path = OUT_DIR / name
        out.save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")

    # Favicon set. The adaptive .svg carries both scheme palettes and flips
    # between them with an embedded prefers-color-scheme media query
    # (Chromium + Firefox). Safari/legacy consumers fall back to the .ico and
    # .png rasters, which use the light palette — a dark-blue disc that reads
    # on light chrome.
    schemes = {
        scheme: compose(ocean_alpha, palette["ocean"], line_alpha, palette["lines"]).resize(
            (FAVICON_SVG_SIZE, FAVICON_SVG_SIZE), Image.Resampling.LANCZOS
        )
        for scheme, palette in FAVICON_SCHEMES.items()
    }

    svg_path = FAVICON_DIR / "favicon.svg"
    svg_path.write_text(build_adaptive_svg(schemes), encoding="utf-8")
    print(f"wrote {svg_path.relative_to(ROOT)} ({svg_path.stat().st_size} bytes)")

    fallback = schemes[FAVICON_FALLBACK_SCHEME]

    png = fallback.resize((32, 32), Image.Resampling.LANCZOS)
    png_path = FAVICON_DIR / "favicon.png"
    png.save(png_path, optimize=True)
    print(f"wrote {png_path.relative_to(ROOT)} ({png_path.stat().st_size} bytes)")

    # Multi-resolution .ico (16/32/48) for legacy tab/bookmark consumers.
    ico = fallback.resize((48, 48), Image.Resampling.LANCZOS)
    ico_path = FAVICON_DIR / "favicon.ico"
    ico.save(ico_path, sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {ico_path.relative_to(ROOT)} ({ico_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
