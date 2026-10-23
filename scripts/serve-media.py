#!/usr/bin/env python3
"""Static file server for the media/ folder during local development.

`python -m http.server` sends no CORS headers, so a page served from the Nuxt
dev server (localhost:3000) cannot `fetch()` audio from it — only `<audio>`
playback works. This adds `Access-Control-Allow-Origin: *` so both work, and
sets the correct MIME type for the media formats the site uses.

    python scripts/serve-media.py [--port 4180] [--dir media]

Pair it with NUXT_PUBLIC_MEDIA_ROOT=http://localhost:4180/ (see
src/lib/localMedia.ts) to hear audio without uploading to R2.
"""

from __future__ import annotations

import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

EXTRA_TYPES = {
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".webp": "image/webp",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
}


class MediaHandler(SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler + permissive CORS + media MIME types."""

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        # Local development only — never cache a stale file between rebuilds.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802 (stdlib naming)
        self.send_response(204)
        self.end_headers()

    def guess_type(self, path: str) -> str:
        suffix = Path(path).suffix.lower()
        return EXTRA_TYPES.get(suffix) or super().guess_type(path)

    def log_message(self, fmt: str, *args) -> None:
        # Quieter than the default: one line per request, no client address.
        print(f"  {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4180)
    parser.add_argument("--dir", default="media", help="folder to serve (repo-relative)")
    args = parser.parse_args()

    directory = (ROOT / args.dir).resolve()
    if not directory.is_dir():
        raise SystemExit(f"not a directory: {directory}")

    handler = functools.partial(MediaHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"serving {directory} at http://localhost:{args.port}/  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
