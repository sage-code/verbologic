#!/usr/bin/env python
"""translate.py - translate the English article texts into the other eight languages.

    translate.py plan                        write/refresh the job table
    translate.py run [--max N] [--per-job N] [--topic T] [--lang xx] [--dry-run]
    translate.py status
    translate.py schedule [--remove]         weekly Windows Task Scheduler entry

planning/content-in-database.md section 6. The job table is content/jobs/translations.json:
one job per (topic, language) that still has articles to translate. `run` takes the next
jobs, translates with the glossary prompt, checks every text against its English source
(the `(word) /ipa/` pairs, the glossary terms) and writes the article files. Nothing is
published or committed: review the diff, then `./run.sh seed import`.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
import articles  # noqa: E402
import glossary  # noqa: E402

CONTENT = ROOT / "content"
JOBS = CONTENT / "jobs" / "translations.json"
SOURCE = "en"
TARGETS = {"es": "Spanish", "it": "Italian", "fr": "French", "de": "German", "ru": "Russian",
           "hu": "Hungarian", "pt": "Portuguese", "ro": "Romanian"}
TRACKS = ("lectures", "stories")
MAX_ATTEMPTS = 3
ARTICLE_TRIES = 2
TASK_NAME = "Verbologic weekly translate"


def page_sha(page: dict[str, Any]) -> str:
    """Same hash as scripts/lecture.mjs pageSha: what `sourceSha` is compared with."""
    body = {k: page[k] for k in ("title", "summary", "sections", "paragraphs") if k in page}
    return hashlib.sha1(json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def article_files() -> list[tuple[str, str, Path]]:
    found = []
    for track in TRACKS:
        for path in sorted((CONTENT / track).glob("*/*.json")):
            found.append((track, path.parent.name, path))
    return found


def needs(article: dict[str, Any], lang: str) -> bool:
    """True when the article has an English text and no up-to-date `lang` text."""
    source = article["locales"].get(SOURCE)
    if not source:
        return False
    page = article["locales"].get(lang)
    if not page:
        return True
    return bool(page.get("sourceSha")) and page["sourceSha"] != page_sha(source)


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_jobs() -> dict[str, Any]:
    if JOBS.exists():
        return json.loads(JOBS.read_text(encoding="utf-8"))
    return {"version": 1, "jobs": []}


def save_jobs(table: dict[str, Any]) -> None:
    JOBS.parent.mkdir(parents=True, exist_ok=True)
    with JOBS.open("w", encoding="utf-8", newline="") as handle:
        handle.write(json.dumps(table, indent=2, ensure_ascii=False) + "\n")


def plan() -> dict[str, Any]:
    """Refresh the table: a job per (topic, language) with work left; finished jobs are marked done."""
    work: dict[tuple[str, str], list[str]] = {}
    for _track, topic, path in article_files():
        article = articles.read_article(path)
        for lang in TARGETS:
            if needs(article, lang):
                work.setdefault((topic, lang), []).append(path.stem)
    table = load_jobs()
    old = {job["id"]: job for job in table["jobs"]}
    jobs = []
    for (topic, lang), ids in sorted(work.items()):
        job = old.get(f"{topic}:{lang}", {"id": f"{topic}:{lang}", "topic": topic, "lang": lang,
                                          "status": "pending", "attempts": 0, "last_run": None})
        job["articles"] = ids
        if job["status"] == "done":
            job["status"] = "pending"  # new or changed English text since it finished
        jobs.append(job)
    current = {j["id"] for j in jobs}
    for key, job in old.items():
        if key not in current:
            job.update(status="done", articles=[])
            jobs.append(job)
    table["jobs"] = sorted(jobs, key=lambda j: (j["topic"], j["lang"]))
    save_jobs(table)
    return table


def flat(page: dict[str, Any]) -> str:
    parts = [page.get("title", ""), page.get("summary", "")]
    for section in page.get("sections") or []:
        parts.append(section["title"])
        parts.extend(section["paragraphs"])
    parts.extend(page.get("paragraphs") or [])
    return " ".join(parts)


def shape_problems(source: dict[str, Any], result: dict[str, Any]) -> list[str]:
    """The translation must be the same shape as the English: same sections, same paragraph counts."""
    if not str(result.get("title", "")).strip():
        return ["title is empty"]
    if "sections" in source:
        got = result.get("sections")
        if not isinstance(got, list) or len(got) != len(source["sections"]):
            return ["the number of sections differs"]
        for a, b in zip(source["sections"], got):
            if not isinstance(b, dict) or not str(b.get("title", "")).strip() or \
                    not isinstance(b.get("paragraphs"), list) or len(b["paragraphs"]) != len(a["paragraphs"]):
                return ["a section has a different number of paragraphs"]
            if any(not isinstance(p, str) or not p.strip() for p in b["paragraphs"]):
                return ["a paragraph is empty"]
    else:
        got = result.get("paragraphs")
        if not isinstance(got, list) or len(got) != len(source.get("paragraphs", [])):
            return ["the number of paragraphs differs"]
    return []


def translate_article(gemini, model: str, source: dict[str, Any], lang: str) -> tuple[dict[str, Any] | None, list[str]]:
    keys = ("title", "summary", "sections") if "sections" in source else ("title", "summary", "paragraphs")
    payload = {k: source.get(k, "") for k in keys}
    problems: list[str] = []
    for _ in range(ARTICLE_TRIES):
        prompt = glossary.translation_prompt(payload, lang, TARGETS[lang])
        if problems:
            prompt += "\n\nYOUR PREVIOUS ANSWER BROKE THESE RULES. Fix every one:\n- " + "\n- ".join(problems)
        result = gemini(prompt, 0.2, model)
        problems = shape_problems(source, result)
        if not problems:
            page = {k: result[k] for k in keys if k in result}
            page.setdefault("summary", "")
            problems = glossary.check_translation(flat(source), flat(page), lang, allow_draft=True)
            if any(mark in flat(page) for mark in ("**", "`")):
                problems.append("markdown in the text")
            if not problems:
                return page, []
    return None, problems


def run(args: argparse.Namespace) -> int:
    table = plan()
    spec = importlib.util.spec_from_file_location("create_stories", ROOT / "scripts" / "create-stories.py")
    stories = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(stories)
    stories.load_env()
    model = os.environ.get("GEMINI_MODEL") or stories.DEFAULT_GEMINI_MODEL
    todo = [j for j in table["jobs"]
            if (j["status"] == "pending" or (j["status"] == "failed" and j["attempts"] < MAX_ATTEMPTS))
            and (not args.topic or j["topic"] == args.topic) and (not args.lang or j["lang"] == args.lang)]
    print(f"translate: {len(todo)} job(s) waiting, taking {min(len(todo), args.max)}")
    for job in todo[: args.max]:
        files = {p.stem: p for _t, topic, p in article_files() if topic == job["topic"]}
        pending = [i for i in job["articles"] if i in files][: args.per_job]
        print(f"== {job['id']}: {len(pending)} of {len(job['articles'])} article(s)")
        if args.dry_run:
            continue
        job.update(status="running", attempts=job["attempts"] + 1, last_run=now())
        save_jobs(table)
        failures: list[str] = []
        for item in pending:
            article = articles.read_article(files[item])
            if not needs(article, job["lang"]):
                continue
            source = article["locales"][SOURCE]
            page, problems = translate_article(stories.gemini_json, model, source, job["lang"])
            if page is None:
                failures.append(f"{item}: {problems[0]}")
                print(f"  FAILED {item}: {problems[:2]}")
                continue
            page.update(status="draft", sourceSha=page_sha(source))
            article["locales"][job["lang"]] = page
            articles.write_article(files[item], article)
            print(f"  wrote {item}")
        left = [i for i in job["articles"] if needs(articles.read_article(files[i]), job["lang"])]
        job["articles"] = left
        if failures:
            job.update(status="failed", error="; ".join(failures[:3]))
        else:
            job.pop("error", None)
            job["status"] = "done" if not left else "pending"
        save_jobs(table)
    return 0


def status() -> int:
    table = plan()
    chapters: dict[str, dict[str, int]] = {}
    for job in table["jobs"]:
        row = chapters.setdefault(job["topic"][:4], {})
        row[job["status"]] = row.get(job["status"], 0) + 1
    if not chapters:
        print("translate: nothing to translate - every article has all its languages")
    for chapter, row in sorted(chapters.items()):
        print(f"{chapter}: " + ", ".join(f"{k} {v}" for k, v in sorted(row.items())))
    left = sum(len(j["articles"]) for j in table["jobs"])
    print(f"texts left: {left}")
    return 0


def schedule(remove: bool) -> int:
    if remove:
        return subprocess.call(["schtasks", "/Delete", "/TN", TASK_NAME, "/F"])
    bash = r"C:\Program Files\Git\bin\bash.exe"
    command = f'"{bash}" -lc "cd {ROOT.as_posix()} && ./run.sh translate run"'
    return subprocess.call(["schtasks", "/Create", "/TN", TASK_NAME, "/SC", "WEEKLY", "/D", "MON",
                            "/ST", "03:00", "/TR", command, "/F"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["plan", "run", "status", "schedule"])
    parser.add_argument("--max", type=int, default=4, help="jobs per run (default 4)")
    parser.add_argument("--per-job", type=int, default=40, help="articles per job per run (default 40)")
    parser.add_argument("--topic")
    parser.add_argument("--lang", choices=sorted(TARGETS))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--remove", action="store_true")
    args = parser.parse_args()
    if args.command == "plan":
        table = plan()
        print(f"translate: {len(table['jobs'])} job(s) in {JOBS.relative_to(ROOT)}")
        return 0
    if args.command == "status":
        return status()
    if args.command == "schedule":
        return schedule(args.remove)
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
