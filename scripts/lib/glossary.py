"""The IPA glossary: the fixed phonetic terms every lecture text may use.

src/data/ipa-glossary.json holds about 60 standard terms. Each has an English
form and definition, and per language a form with a status: `draft` (machine
translated) or `checked` (reviewed). planning/content-in-database.md section 6.

A writing prompt may use ONLY these terms for phonetic ideas; a translation
prompt must use the exact local form. The checks below enforce both, so a model
never invents a local term (how "rotunjita" got into the Romanian pages).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

PATH = Path(__file__).resolve().parents[2] / "src" / "data" / "ipa-glossary.json"

#: Phonetic words a text must NOT use because they are not in the glossary. The
#: glossary is the whole vocabulary, so a term that is missing is added there
#: (and reviewed) first, never used on the quiet.
OUTSIDE_GLOSSARY = re.compile(
    r"\b(?:rounded|unrounded|rounding|sibilant|labial|labialized|palate|palates|retroflex|"
    r"ejective|implosive|nasalized|nasalised|monophthong|fortis|lenis|"
    r"coronal|dorsal|pharyngeal|epiglottal|obstruent|sonorant)\b",
    re.I,
)

#: Wording about the learner's origin: lectures are for every native language.
ABOUT_THE_READER = re.compile(r"English speakers?|\bnationalit\w*", re.I)

_cache: dict[str, Any] | None = None


def load() -> dict[str, Any]:
    global _cache
    if _cache is None:
        _cache = json.loads(PATH.read_text(encoding="utf-8"))
    return _cache


def form(term: dict[str, Any], locale: str) -> str | None:
    """The text of a term in a language, or None when it is not translated yet."""
    if locale == "en":
        return term["en"]
    entry = term.get("locales", {}).get(locale)
    return entry["text"] if entry else None


def status(term: dict[str, Any], locale: str) -> str:
    return "checked" if locale == "en" else term.get("locales", {}).get(locale, {}).get("status", "missing")


def _stem(word: str) -> str:
    """A word without its last vowel: consoana and consoane share the stem consoan."""
    return word[:-1] if len(word) > 4 and word[-1] in "aeiouyăâîéèêíóúáàäöüőű" else word


def _pattern(text: str) -> re.Pattern[str]:
    """Match a term (one word or a phrase) in any inflected form: each word by its stem."""
    words = [re.escape(_stem(w)) + r"\w*" for w in text.split()]
    return re.compile(r"(?<!\w)" + r"[\s-]+".join(words), re.I)


def used(text: str, locale: str) -> list[dict[str, Any]]:
    """Glossary terms that appear in a text written in `locale`."""
    prose = re.sub(r"\([^()]*\)|/[^/\s]+/", " ", text)
    found = []
    for term in load()["terms"]:
        word = form(term, locale)
        if word and _pattern(word).search(prose):
            found.append(term)
    return found


def writing_block() -> str:
    """The English part of a writing prompt: which terms are allowed and how to use them."""
    lines = "\n".join(f"  {t['en']}: {t['define']}" for t in load()["terms"])
    return (
        "PHONETIC TERMS. For phonetic ideas you may use ONLY the terms in this glossary, spelled exactly "
        "like this. When you use a term for the first time in the article, say what it means in one plain "
        "sentence. Do not use any other phonetic term (for example rounded, palate, sibilant, labial): say "
        "what the mouth does instead.\n" + lines
    )


def translation_block(locale: str) -> str:
    """The part of a translation prompt that fixes the local form of every term."""
    rows = []
    for term in load()["terms"]:
        word = form(term, locale)
        if word:
            rows.append(f"  {term['en']} = {word}")
    return (
        "GLOSSARY. Translate each of these terms ONLY with the form given here, every time, and never "
        "with a synonym:\n" + "\n".join(rows)
    )


def pairs(text: str) -> list[tuple[str, str]]:
    """The `(word) /ipa/` pairs of a text, in order."""
    return re.findall(r"\(([^()]*)\)\s*(/[^/]+/)", text)


def check_writing(text: str) -> list[str]:
    """Problems with an English text written under the glossary rule."""
    problems = []
    found = OUTSIDE_GLOSSARY.search(text)
    if found:
        problems.append(f"'{found.group(0)}' is a phonetic term that is not in the glossary")
    found = ABOUT_THE_READER.search(text)
    if found:
        problems.append(f"'{found.group(0)}': do not write for one native language")
    return problems


def check_translation(source: str, translated: str, locale: str, allow_draft: bool = False) -> list[str]:
    """Problems with a translated text, measured against its English source."""
    problems = []
    if pairs(source) != pairs(translated):
        problems.append("the (word) /ipa/ pairs differ from the source")
    if re.search(r"\d", re.sub(r"/[^/]*/", "", translated)) and not re.search(r"\d", source):
        problems.append("a digit appears that the source does not have")
    for term in used(source, "en"):
        if term.get("plain"):
            continue  # an everyday word (open, front, short...): the prompt fixes its form, but it is not checked
        word = form(term, locale)
        if word is None:
            problems.append(f"glossary term '{term['en']}' has no {locale} form yet")
            continue
        if not _pattern(word).search(re.sub(r"\([^()]*\)|/[^/\s]+/", " ", translated)):
            problems.append(f"'{term['en']}' must appear as '{word}'")
        elif not allow_draft and status(term, locale) != "checked":
            problems.append(f"'{term['en']}' = '{word}' is still a draft in {locale}")
    return problems


def translation_prompt(source: dict[str, Any], locale: str, language: str) -> str:
    """The prompt that translates one English article locale into `locale`.

    `source` is {"title", "summary", "paragraphs"} (a story) or {"title",
    "summary", "sections": [{"title", "paragraphs"}]} (a lecture). The answer
    has the same shape, so the caller can check it against the source.
    """
    return f"""You translate a short pronunciation lesson from English into {language}.
The lesson is read by learners and read aloud, so keep it simple: short sentences, everyday words.

RULES.
1. Keep the same number of sections and paragraphs, in the same order. Translate each section title.
2. Every "(word) /ipa/" pair is copied EXACTLY as it is: the word in round brackets and the IPA between
   slashes stay unchanged. Translate only the words around them.
3. Do not add or remove examples, and do not add facts.
4. Do not use bold, backticks, lists, digits for numbers, colons, semicolons or dashes.
5. Write for any learner, whatever their native language.

{translation_block(locale)}

For any phonetic idea that is NOT in the glossary, describe what the mouth does in plain words. Do not invent a technical term.

SOURCE (English):
{json.dumps(source, ensure_ascii=False, indent=2)}

Return one JSON object with the same keys as the source, written in {language}."""
