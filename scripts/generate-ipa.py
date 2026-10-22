"""Fill missing IPA transcriptions in shared media item manifests with Gemini.

The script is report-only unless --apply is passed. Existing IPA is never
overwritten. IPA is generated for the exact text used by TTS when a localized
ttsText override exists; otherwise the localized name is transcribed.

Examples:
  .venv/Scripts/python.exe scripts/generate-ipa.py --chapter C1
  .venv/Scripts/python.exe scripts/generate-ipa.py --track dictionary --chapter C1 --apply
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MEDIA_DIR = ROOT / "media"
TRACKS = ("dictionary", "lectures")
LOCALES = ("en", "ro", "de", "ru", "it", "es", "fr", "hu", "pt")
LANGUAGE_NAMES = {
    "en": "English (US)",
    "ro": "Romanian",
    "de": "German",
    "ru": "Russian",
    "it": "Italian",
    "es": "Spanish (Spain)",
    "fr": "French (France)",
    "hu": "Hungarian",
    "pt": "European Portuguese",
}
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "models/gemini-3.5-flash-lite"
BATCH_SIZE = 4


def load_env() -> None:
    env_file = ROOT / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def normalize_model(model: str) -> str:
    model = model.strip()
    if model.endswith("-light"):
        model = f"{model[:-len('-light')]}-lite"
    return model if model.startswith("models/") else f"models/{model}"


def is_missing_ipa(value: Any) -> bool:
    return not isinstance(value, str) or not value.strip()


def read_items(track_filter: str | None):
    tracks = (track_filter,) if track_filter else TRACKS
    for track in tracks:
        root = MEDIA_DIR / track
        if not root.is_dir():
            raise FileNotFoundError(f"Media track directory not found: {root}")
        for path in sorted(root.rglob("item.json")):
            item = json.loads(path.read_text(encoding="utf-8"))
            if item.get("track") != track:
                raise ValueError(f"Track mismatch in {path}: expected {track!r}")
            if not isinstance(item.get("names"), dict):
                raise ValueError(f"{path} must contain a 'names' object")
            if not isinstance(item.get("pronunciation"), dict):
                raise ValueError(f"{path} must contain a 'pronunciation' object")
            yield path, item


def spoken_text(item: dict[str, Any], locale: str) -> str:
    override = item.get("ttsText")
    value = override.get(locale) if isinstance(override, dict) else None
    if not isinstance(value, str) or not value.strip():
        value = item["names"].get(locale)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            f"{item.get('code')} has no localized spoken text for {locale}"
        )
    return value.strip()


def pending_item(path: Path, item: dict[str, Any]) -> dict[str, Any] | None:
    targets = []
    for locale in LOCALES:
        pronunciation = item["pronunciation"].get(locale)
        ipa = pronunciation.get("ipa") if isinstance(pronunciation, dict) else None
        if is_missing_ipa(ipa):
            targets.append(locale)
    if not targets:
        return None
    return {
        "key": path.relative_to(MEDIA_DIR).as_posix(),
        "code": item.get("code"),
        "kind": item.get("kind", "item"),
        "topic": item.get("topic"),
        "targets": {
            locale: {
                "language": LANGUAGE_NAMES[locale],
                "text": spoken_text(item, locale),
            }
            for locale in targets
        },
    }


def format_http_error(error: urllib.error.HTTPError) -> str:
    detail = error.read().decode("utf-8", errors="replace")[:600]
    return f"HTTP {error.code}: {detail}"


def generate_ipa_batch(batch: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is required. Set it in the project .env file "
            "or the process environment."
        )

    prompt = (
        "You are an expert phonetician. For each supplied localized spoken text, "
        "write a standard, narrow-enough IPA pronunciation that is useful to a "
        "language learner. Use the requested language and locale variety. "
        "Transcribe only the supplied spoken text, not descriptions or meanings. "
        "Use IPA symbols, include lexical stress where appropriate, and wrap "
        "each transcription in slashes, for example /ˈwɜːd/. Never use ordinary "
        "spelling as a substitute for IPA. Return only JSON with the exact shape "
        "{\"items\":[{\"key\":\"...\",\"ipa\":{\"en\":\"/.../\"}}]}. Include "
        "every requested locale exactly once per item and do not add commentary.\n\n"
        f"LOCALE GUIDANCE: {json.dumps(LANGUAGE_NAMES, ensure_ascii=False)}\n"
        f"ITEMS:\n{json.dumps(batch, ensure_ascii=False)}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }
    model = normalize_model(os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL)
    endpoint = (
        f"{GEMINI_API_URL}/{urllib.parse.quote(model, safe='/')}:generateContent?"
        f"{urllib.parse.urlencode({'key': api_key})}"
    )
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                response_data = json.loads(response.read().decode("utf-8"))
            text = response_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"\A```(?:json)?\s*|\s*```\Z", "", text)
            result = json.loads(text)
            if isinstance(result, list):
                response_items = result
            elif isinstance(result, dict) and isinstance(result.get("items"), list):
                response_items = result["items"]
            else:
                raise ValueError("Gemini returned JSON without an items array")
            by_key: dict[str, dict[str, str]] = {}
            for translated in response_items:
                key = translated.get("key")
                values = translated.get("ipa")
                if not isinstance(key, str) or key in by_key:
                    raise ValueError("Gemini returned a missing or duplicate item key")
                if not isinstance(values, dict):
                    raise ValueError(f"Gemini returned invalid IPA for {key}")
                by_key[key] = values
            expected = {entry["key"] for entry in batch}
            if not set(by_key).issubset(expected):
                raise ValueError(
                    "Gemini response contains unexpected item keys "
                    f"({sorted(set(by_key) - expected)})"
                )
            for entry in batch:
                values = by_key.get(entry["key"], {})
                if not set(values).issubset(set(entry["targets"])):
                    raise ValueError(
                        f"Gemini returned unexpected IPA locales for {entry['key']}"
                    )
                for locale, value in values.items():
                    if not isinstance(value, str) or not value.strip():
                        raise ValueError(
                            f"Gemini omitted IPA for {entry['key']} locale {locale}"
                        )
                    if "/" not in value:
                        raise ValueError(
                            f"Gemini response is not slash-delimited IPA for "
                            f"{entry['key']} locale {locale}: {value!r}"
                        )
            return by_key
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code < 600
            message = format_http_error(error)
            if not retryable or attempt == 2:
                raise RuntimeError(f"Gemini IPA generation failed: {message}") from error
        except urllib.error.URLError as error:
            if attempt == 2:
                raise RuntimeError(
                    f"Gemini IPA connection failed: {error.reason}"
                ) from error
        except (KeyError, IndexError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Invalid Gemini IPA response: {error}") from error
        time.sleep(2**attempt)
    raise RuntimeError("Gemini IPA generation failed after retries")


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--track", choices=TRACKS, help="only this media track")
    parser.add_argument("--chapter", help="only this chapter code, for example C1")
    parser.add_argument("--topic", help="only this topic code")
    parser.add_argument("--apply", action="store_true", help="write generated IPA")
    args = parser.parse_args()

    load_env()
    items = list(read_items(args.track))
    if args.chapter:
        items = [(path, item) for path, item in items if item.get("chapter") == args.chapter]
    if args.topic:
        items = [(path, item) for path, item in items if item.get("topic") == args.topic]

    pending = []
    for path, item in items:
        request = pending_item(path, item)
        if request:
            pending.append((path, item, request))

    missing_slots = sum(len(request["targets"]) for _, _, request in pending)
    print(
        f"IPA plan: {len(pending)} item(s), {missing_slots} missing localized "
        f"transcription(s); existing IPA will be preserved."
    )
    if not args.apply:
        print("Run with --apply to call Gemini and fill missing IPA.")
        for _, _, request in pending:
            print(f"would transcribe: {request['key']} ({len(request['targets'])} locales)")
        return
    if not pending:
        return

    changed = 0
    for offset in range(0, len(pending), BATCH_SIZE):
        batch = pending[offset : offset + BATCH_SIZE]
        generated = generate_ipa_batch([request for _, _, request in batch])
        for attempt in range(3):
            missing_requests = []
            for _, _, request in batch:
                missing_locales = set(request["targets"]) - set(
                    generated.get(request["key"], {})
                )
                if missing_locales:
                    retry = dict(request)
                    retry["targets"] = {
                        locale: request["targets"][locale]
                        for locale in sorted(missing_locales)
                    }
                    missing_requests.append(retry)
            if not missing_requests:
                break
            print(
                f"Retrying {sum(len(request['targets']) for request in missing_requests)} "
                f"omitted IPA field(s) (attempt {attempt + 1}/3).",
                file=sys.stderr,
            )
            retry_result = generate_ipa_batch(missing_requests)
            for key, values in retry_result.items():
                generated.setdefault(key, {}).update(values)
        missing_outputs = [
            f"{request['key']}:{locale}"
            for _, _, request in batch
            for locale in set(request["targets"]) - set(generated.get(request["key"], {}))
        ]
        if missing_outputs:
            raise RuntimeError(
                "Gemini repeatedly omitted IPA fields: "
                + ", ".join(sorted(missing_outputs))
            )
        for path, item, request in batch:
            pronunciation = item["pronunciation"]
            for locale, ipa in generated[request["key"]].items():
                current = pronunciation.get(locale)
                if not isinstance(current, dict):
                    current = {}
                    pronunciation[locale] = current
                if is_missing_ipa(current.get("ipa")):
                    current["ipa"] = ipa.strip()
                    changed += 1
            write_json_atomic(path, item)
        print(
            f"transcribed batch {offset // BATCH_SIZE + 1} "
            f"({len(batch)} item(s)); filled {changed} locale(s) so far"
        )
        time.sleep(1)
    print(f"Filled {changed} missing IPA transcription(s).")


if __name__ == "__main__":
    main()
