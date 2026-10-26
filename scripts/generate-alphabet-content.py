"""Author comprehensive alphabet articles for every language with Gemini.

The alphabet data files (src/data/alphabets/<lang>.json) are the authoring
surface for the phonetic topics: the manifests and the article pages are both
DERIVED from them (see src/types/phonetic.ts). This script fills the fields the
articles need but that were never authored:

  exampleIpa          IPA of the example word
  exampleTranslation  the example word's meaning, per UI locale
  variations[]        the letter's pronunciation variants, each with its own
                      IPA, the context it occurs in, and example words
  sections{}          the four article pages per UI locale
                      (sound · howToSay · spelling · compare)

Two stages, so every locale is written from the same words: stage 1 fixes the
facts (example, translations, variations); stage 2 writes the pages per locale
from those facts only. A page is also read aloud, so stage 2 output is checked
against the spoken-form rules (SPOKEN_FORM_RULES) and rejected if it breaks
them. Foreign words are written `(word) /ipa/`: shown, but skipped by the voice,
which speaks only the respelled IPA (scripts/lib/ipa-translit.mjs).

The article is a reference card, not an essay. Each page has ONE job and the
letter's own sounds only: a letter group (ch, qu, ou, ai, gn, ill, -tion) is a
different sound with its own article, so it is never a variant of its first
letter and never explained here.

Pipeline after authoring (the pages are read aloud page by page, so the audio
must be rebuilt whenever the prose changes):

  node scripts/alphabet-to-markdown.mjs
  node scripts/sync-alphabet-manifests.mjs
  .venv/Scripts/python.exe scripts/generate-audio.py --read --apply --overwrite-audio

Existing values are never overwritten unless --overwrite is passed, so the
script is safe to re-run as content grows. --overwrite re-authors the PAGES and
keeps the facts; add --facts to re-author the facts too (which makes every
other locale's pages stale, because they quote those words).

Examples:
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --lang fr --code L460 --locales ro --overwrite --preview
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --lang fr --locales ro --overwrite --apply
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --lang fr --locales ro --overwrite --facts --apply
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --lang ro
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --all --apply
  .venv/Scripts/python.exe scripts/generate-alphabet-content.py --lang de --apply --overwrite
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
ALPHABETS = ROOT / "src" / "data" / "alphabets"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.locales import LOCALES  # noqa: E402  (single locale registry)

LANGUAGE_NAMES = {
    "en": "English",
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
DEFAULT_GEMINI_MODEL = "models/gemini-3.8-flash"
#: Parallel Gemini calls. Each call is one entry x one locale group; the API
#: tolerates this comfortably and it turns a ~9h sequential run into ~1h.
CONCURRENCY = 8
SECTION_KEYS = ("sound", "howToSay", "spelling", "compare")
# Four sections x nine locales of real prose is ~14k characters, which sits
# right at the model's output ceiling and truncates intermittently. Sections
# are therefore requested in locale groups; the metadata half (example IPA,
# translations, variations) is small enough to ask for in one go.
LOCALE_GROUPS = (("en", "ro", "de"), ("ru", "it", "es"), ("fr", "hu", "pt"))


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


def is_missing(value: Any) -> bool:
    return not isinstance(value, str) or not value.strip()


def alphabet_path(lang: str) -> Path:
    return ALPHABETS / f"{lang}.json"


def load_alphabet(lang: str) -> dict[str, Any]:
    return json.loads(alphabet_path(lang).read_text(encoding="utf-8"))


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    temporary = path.with_suffix(".json.tmp")
    # newline="\n" keeps the file LF on Windows too: the repository stores LF,
    # and a CRLF rewrite would turn every line of the file into a diff.
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def entries_of(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [*(data.get("letters") or []), *(data.get("groups") or [])]


def needs_meta(entry: dict[str, Any]) -> bool:
    """True while the factual half (example, translations, variants) is missing."""
    return (
        is_missing(entry.get("example"))
        or is_missing(entry.get("exampleIpa"))
        or not entry.get("exampleTranslation")
        or not entry.get("variations")
    )


def locale_groups(locales: tuple[str, ...] | None) -> tuple[tuple[str, ...], ...]:
    """The locale groups to author: the default three, or a --locales subset."""
    if not locales:
        return LOCALE_GROUPS
    return tuple(locales[i : i + 3] for i in range(0, len(locales), 3))


def incomplete_locales(
    entry: dict[str, Any], groups: tuple[tuple[str, ...], ...] = LOCALE_GROUPS
) -> tuple[tuple[str, ...], ...]:
    """The locale groups an entry is still missing sections for."""
    have = set((entry.get("sections") or {}).keys())
    return tuple(group for group in groups if not set(group).issubset(have))


def pending_entries(
    data: dict[str, Any],
    overwrite: bool,
    codes: set[str] | None,
    groups: tuple[tuple[str, ...], ...],
    facts: bool = False,
) -> list[dict[str, Any]]:
    """Entries that still need authored content (including partial ones)."""
    out = []
    for entry in entries_of(data):
        if codes and entry.get("code") not in codes:
            continue
        # A run that lost a call leaves some locale groups empty; those entries
        # are still pending even though `sections` exists.
        if overwrite or facts or needs_meta(entry) or incomplete_locales(entry, groups):
            out.append(entry)
    return out


def build_request(entry: dict[str, Any], with_facts: bool = False) -> dict[str, Any]:
    """The per-entry payload sent to Gemini (kept small and factual).

    `ipa` is the transcription of the letter's NAME as recited in the alphabet
    (fr "cé" is /se/); how the letter sounds inside words is `variations`.
    """
    request = {
        "code": entry.get("code"),
        "glyph": entry.get("glyph"),
        "letterName": entry.get("letterName"),
        "nameIpa": entry.get("ipa"),
    }
    if with_facts:
        request["example"] = entry.get("example")
        request["exampleIpa"] = entry.get("exampleIpa")
        request["exampleTranslation"] = entry.get("exampleTranslation")
        request["variations"] = entry.get("variations")
    return request


#: IPA as the site writes it. Slashes are what the TTS pre-processor recognises
#: (scripts/lib/ipa-translit.mjs), so this is a contract, not a style choice.
IPA_FORMAT = (
    "broad phonemic IPA between slashes, real IPA characters, syllables "
    "separated by a dot, no stress marks, no square brackets (e.g. /ka.fe/); "
    "a letter that makes no sound is written /∅/"
)

#: Pages are also read aloud. A voice of the reader's language cannot say a
#: foreign word, so the pairing `(word) /ipa/` is the whole trick: the word in
#: round brackets is shown but SKIPPED by the voice, and the IPA after it is
#: respelled in the voice's own alphabet and spoken. These rules make the same
#: text correct for the eye and for the ear.
SPOKEN_FORM_RULES = (
    "WRITING RULES. Every page is shown on screen AND read aloud by a "
    "text-to-speech voice of the page's language, which cannot pronounce "
    "words of the target language. Follow all of them exactly:\n"
    "R1. Every target-language word is written as `(word) /ipa/`: the word in "
    "round brackets exactly as spelled, one space, then its IPA between "
    "slashes. The voice skips the bracketed word and speaks only the IPA. "
    "Never put the IPA inside the brackets, never put anything but the word "
    "inside them, and never wrap the pair in bold, italics, quotes or backticks.\n"
    "R2. Round brackets are used ONLY for rule R1. No asides, no abbreviations "
    "or explanations in brackets.\n"
    "R3. A slash is used ONLY around IPA. Write lists in words (\"a, o or u\", "
    "never \"a/o/u\"), never \"and/or\".\n"
    "R4. Words of the page's own language (for comparison, e.g. a Romanian word "
    "that has the same sound) are written normally, with no brackets and no IPA.\n"
    "R5. Never write the bare glyph of the letter being taught in the prose: "
    "the article title already shows it. Name the letter by its NAME, in the "
    "`(word) /ipa/` form of R1. The only markup allowed is **bold** for "
    "emphasis in the page's own language; never bold a target-language word "
    "or its IPA. No lists, tables, headings, emoji, backticks, italics, "
    "square brackets or line breaks. One paragraph per page.\n"
    "R6. Sentences are short (20 words at most) and make sense when only "
    "heard. Do not use symbols such as -> = + & ~ or abbreviations "
    "(e.g., etc., cf.). Never leave an IPA symbol standing alone: say what it "
    "is (\"sunetul /k/\", \"the sound /k/\").\n"
    "R7. Write in the page's language with its full correct orthography and "
    "diacritics (Romanian: comma-below ș and ț, never cedilla). Address the "
    "learner directly.\n"
    "R8. Each page is played on its own, so it must be understood without the "
    "others: never open with a reference to another page (\"as we saw\", "
    "\"the second sound\"). Naming the letter by its name is allowed on every "
    "page; no other fact is repeated.\n"
    "R9. Never put a `(word) /ipa/` pair next to a word of the page's language "
    "that sounds like the respelled IPA: the voice would say it twice "
    "(Romanian \"litera (cé) /se/ se pronunță\" is heard as \"se se\"). "
    "Rephrase the sentence instead.\n"
    "R10. Never write /∅/ in the prose: the voice reads it as a word "
    "(\"nimic\", \"nothing\"). Say in words that the letter is not pronounced, "
    "then give the example.\n"
    "R11. The voice reads IPA through a respelling in the page's language, so "
    "two different symbols can come out identical (Romanian reads both /o/ and "
    "/ɔ/ as \"o\", and both /æ/ and /ɑː/ as \"a\"). When two variants of this "
    "letter would be heard the same, add a short qualifier in the page's "
    "language right after the symbol (\"sunetul /ɔ/, adică un o deschis\"; "
    "\"sunetul /æ/, adică un a deschis, între a și e\"). Never leave the "
    "learner unable to tell the variants apart by ear.\n"
    "R12. A GROUP article (\"-tion\", \"kn-\", \"-gh(t)\", \"th\") is about a "
    "SPELLING, not a letter and not a word. Write the group's own spelling "
    "bare, with no brackets and no IPA — it is the subject of the page. So "
    "write \"grupul th se rotește ca sunetul /θ/\" and NEVER \"(th) /θ/\": the "
    "brackets are reserved for real words, and a group is not a word. Only "
    "real words take the `(word) /ipa/` form.\n"
    "R13. Write no digits at all: every number is a word of the page's "
    "language (\"two\", \"doi\", \"zwei\"), because a voice reads digits, "
    "ordinals and dates by its own rules, often wrongly. Never write a word in "
    "capitals or an acronym: the voice spells it out or shouts it.\n"
    "R14. Punctuation is the voice's only guide to rhythm. Use only full "
    "stops, commas, question marks and exclamation marks. Never a colon, "
    "semicolon, dash, ellipsis, quotation mark or guillemet: a voice turns "
    "them into odd pauses or skips them, and a sentence that needs one is two "
    "sentences. Put a comma where a speaker would breathe. Every page ends "
    "with a full stop, and every sentence ends with a full stop, a question "
    "mark or an exclamation mark.\n"
    "R15. Choose words a voice says correctly. Prefer plain everyday words to "
    "rare or technical ones, and avoid words whose pronunciation or stress "
    "depends on context (English \"read\", \"lead\", \"wind\"; Russian "
    "\"замок\", \"мука\"). When a technical term is needed, use the ordinary "
    "word of the page's language (\"vocal cords\", never a Latin or Greek "
    "term). Never use a word of a third language.\n"
    "R16. Each page is one steady spoken paragraph: one idea per sentence, "
    "the subject first, one tense throughout, no sentence opening repeated "
    "more than twice. Open with the point, never with a greeting or a "
    "preamble.\n"
    "R17. The pages of one article are shown together on one screen, each "
    "under its own small subheading, and the voice reads them one after "
    "another WITHOUT the subheadings. So a page must make sense when heard "
    "straight after another: never lean on the subheading to say what the page "
    "is about, and never repeat the subheading as the first words of the text.\n"
)

#: Words per page. The four pages of an article are shown together, so
#: together they should fill the reading area: about 280 words, which the
#: reading view packs onto one page.
PAGE_LIMITS = {"sound": 55, "howToSay": 70, "spelling": 85, "compare": 70}


#: "that is", per page language: what rule R11's qualifier opens with. The
#: validator (validate_sections) accepts exactly these words after a symbol.
QUALIFIER_CONNECTIVES = {
    "en": "that is",
    "ro": "adică",
    "es": "es decir",
    "fr": "c'est-à-dire",
    "de": "das heißt",
    "ru": "то есть",
    "hu": "azaz",
    "pt": "ou seja",
    "it": "cioè",
}


def prompt_meta(batch: list[dict[str, Any]], lang: str) -> str:
    """Stage 1 — the facts every locale's pages are built from."""
    language = LANGUAGE_NAMES[lang]
    return (
        f"You are an expert {language} phonetician preparing the facts for the "
        f"alphabet articles of a language-learning site. The target language is "
        f"{language}. For EACH entry (one letter) produce:\n\n"
        "1. `example`: one common, concrete word in which THIS LETTER, on its "
        "own, makes its MAIN sound. The letter must be the only source of that "
        "sound in the word: never a word where the sound comes from a letter "
        "group (ch, qu, ou, ai, gn, ill, -tion, ...). Prefer a word that starts "
        "with the letter. `exampleIpa`: its IPA — " + IPA_FORMAT + ".\n"
        "2. `exampleTranslation`: the example's meaning in EVERY one of these "
        f"languages: {', '.join(LOCALES)}. 1-3 words each, not a sentence.\n"
        f"3. `variations`: how this letter, ON ITS OWN, is pronounced in "
        f"{language}, most common first. One object per variant: `ipa` (slashes, "
        "one sound), `when` (a short English phrase naming the position, "
        "neighbouring letters or diacritic that triggers it), `examples` (1-2 "
        "objects of `word` + `ipa`, real words of the target language where the "
        "letter really makes that sound). 1-4 variants; exactly one if the "
        "letter has a single sound. INCLUDE the letter's accented and special "
        "forms (ç, é è ê ë, ...) and position effects such as a silent final "
        "letter.\n"
        "   EXCLUDE LETTER GROUPS. A digraph, trigraph, diphthong spelling, "
        "nasal-vowel spelling or fixed ending (ch, qu, ou, ai, gn, ill, -tion, "
        "-er, ...) is a DIFFERENT sound with its own article. It is never a "
        "variant of its first letter, and its words are never examples here. "
        "So French c has /k/ and /s/ (and the cedilla), never /ʃ/ from ch; "
        "French o has /ɔ/ and /o/, never /w/ from oi; French q has /k/, never "
        "/kw/ from qu. If a sound only exists inside a group, leave it out.\n"
        "   The `example` word must illustrate one of the variants you return: "
        "its IPA must be the IPA of that variant (or, for a silent letter, a "
        "word where the letter is not pronounced). For a silent-letter variant "
        "prefer a word with no letter group at all, so the learner is not "
        "distracted by a group sound (French `salut` for a silent final t, not "
        "`chat`, whose `ch` is a group).\n"
        "   Every word must be a real, current dictionary word of "
        f"{language}, spelled exactly as a dictionary spells it — with its "
        "accents, its hyphens and its apostrophes (French `week-end`, not "
        "`weekend`; `aujourd'hui`, not `aujourdhui`). Never invent, "
        "anglicise or regularise a spelling, and never use a word you are not "
        "certain exists. If you cannot recall a real word for a variant, "
        "return that variant with one example you are sure of rather than two.\n"
        f"   Variant IPA is {IPA_FORMAT}.\n\n"
        "Return ONLY JSON of the shape "
        '{"items":[{"code":"L001","example":"...","exampleIpa":"/.../",'
        '"exampleTranslation":{"en":"..."},"variations":[{"ipa":"/.../",'
        '"when":"...","examples":[{"word":"...","ipa":"/.../"}]}]}]}. '
        "Include every entry exactly once, in the order given, and no commentary.\n\n"
        f"ENTRIES:\n{json.dumps(batch, ensure_ascii=False)}"
    )


def prompt_sections(
    batch: list[dict[str, Any]], lang: str, locales: tuple[str, ...], feedback: str = ""
) -> str:
    """Stage 2 — the four reading pages per locale, written from the facts."""
    language = LANGUAGE_NAMES[lang]
    names = ", ".join(f"{code} = {LANGUAGE_NAMES[code]}" for code in locales)
    fix = (
        "\n\nYOUR PREVIOUS ANSWER BROKE THESE RULES — fix every one and "
        f"change nothing else:\n{feedback}\n"
        if feedback
        else ""
    )
    # Tell the model which variant pairs its reader's voice cannot distinguish,
    # so it qualifies them in words instead of leaving two identical sounds.
    collisions: list[str] = []
    for entry in batch:
        for locale in locales:
            for ipa_a, ipa_b, spoken in colliding_variants(entry, locale):
                collisions.append(
                    f"  {entry.get('code')} [{locale}]: {ipa_a} and {ipa_b} both "
                    f"sound like \"{spoken}\" — qualify each in words"
                )
    # The validator looks for the connective right after the symbol, so the
    # model is shown the exact form, in each page language, not just the rule.
    qualifier_forms = "; ".join(
        f"{locale}: \"/symbol/, {QUALIFIER_CONNECTIVES[locale]} a short description\""
        for locale in locales
    )
    collision_note = (
        "\n\nSOUND COLLISIONS. In these languages the voice pronounces the two "
        "symbols identically, so the page MUST add a short qualifier in words "
        "after each symbol (rule R11), written exactly as the symbol, a comma, "
        f"the connective and a plain description ({qualifier_forms}). Every "
        "symbol listed below gets its own qualifier, even when the two sound "
        "alike to the learner:\n" + "\n".join(collisions) + "\n"
        if collisions
        else ""
    )
    return (
        f"You are an expert {language} phonetician and teacher writing the "
        f"alphabet reference articles of a language-learning site. The target "
        f"language is {language}. Each article explains ONE letter to learners "
        f"whose own language is one of: {names}. Write the article in each "
        "learner language separately, natively — not as a translation of "
        "another locale.\n\n"
        "FACTS are authoritative. Use only the `example`, the variants and "
        "their example words, the `letterName`, and the IPA strings exactly as "
        "given. Invent no word, no variant and no transcription of the target "
        "language. Words of the learner's own language may be used freely for "
        "comparison.\n\n"
        "SCOPE. The article covers the letter ON ITS OWN. Letter groups (ch, "
        "qu, ou, ai, gn, ill, -tion, ...) have their own articles: do not "
        "mention them, do not explain their sounds, do not use their words. "
        "Say each fact once: every page has a different job, nothing is "
        "repeated on another page, and no example word appears on more than "
        "one page. This is a reference card, not an essay: no encouragement, "
        "no generalities, no history, no dialect survey.\n\n"
        "PAGES, each an object {title, text}. The title is 2-4 words in the "
        "page's language, shown as a small subheading above the text, and is "
        "NOT read aloud, so it names the letter by its NAME plainly, with no "
        "brackets and no IPA (Romanian: \"Sunetul literei cé\"). The text is "
        "read aloud and follows the writing rules below.\n"
        f"- `sound` (up to {PAGE_LIMITS['sound']} words): the letter's name "
        "as spoken, then its main sound with the `example` word and what that "
        "word means (`exampleTranslation` for the page's language), then how "
        "many sounds the letter has, without listing them. This page is the "
        "summary, not the list of variants.\n"
        f"- `howToSay` (up to {PAGE_LIMITS['howToSay']} words): only the "
        "movements — tongue, lips, jaw, air, voice — for each sound this letter "
        "makes, in the order of the variants, one or two sentences per sound, "
        "and one thing the learner can feel or check (a hand on the throat, a "
        "finger before the lips). No spelling rules, no example words.\n"
        f"- `spelling` (up to {PAGE_LIMITS['spelling']} words): when each "
        "variant applies — the position, neighbouring letters or diacritic, "
        "then its sound with ONE example word per variant. One or two short "
        "sentences per variant. Do not describe the mouth again.\n"
        f"- `compare` (up to {PAGE_LIMITS['compare']} words): the mistakes "
        "a learner of the page's language really makes with this letter, naming "
        "the nearest sound of THEIR language with an ordinary word of theirs, "
        "and how to correct each in one short instruction. Each mistake once, "
        "using words of the learner's language only. If there is no real "
        "pitfall, say so in one sentence.\n"
        "Use the room each page allows, but only for true, useful facts: never "
        "pad, never repeat, never add encouragement.\n\n"
        f"{SPOKEN_FORM_RULES}{collision_note}\n"
        "Return ONLY JSON of the shape "
        '{"items":[{"code":"L001","sections":{"<locale>":{"sound":{"title":"...",'
        '"text":"..."},"howToSay":{...},"spelling":{...},"compare":{...}}}}]}, '
        f"with a key for each of: {', '.join(locales)}. Include every entry "
        f"exactly once and no commentary.{fix}\n\n"
        f"ENTRIES:\n{json.dumps(batch, ensure_ascii=False)}"
    )


IPA_SPAN = re.compile(r"/[^/\n]+/")
BRACKETED = re.compile(r"\(([^()]*)\)")
BRACKETED_WITH_IPA = re.compile(r"\(([^()/]+)\) (/[^/\n]+/)")
IPA_ONLY_CHARS = re.compile("[ɐ-˿̀-ͯᴀ-ᶿⱠ-Ɀ꜀-ꜟ]")


def entry_words(entry: dict[str, Any]) -> dict[str, set[str]]:
    """Every target-language word the pages may use, with its allowed IPA.

    A word can legitimately carry more than one transcription: French `cinq`
    is /sɛ̃k/ on its own and /sɛ̃/ before a consonant. Both are correct, so the
    check accepts any of them rather than the last one written.
    """
    words: dict[str, set[str]] = {}

    def add(word: Any, ipa: Any) -> None:
        if word and ipa:
            words.setdefault(str(word).lower(), set()).add(str(ipa).strip())

    add(entry.get("example"), entry.get("exampleIpa"))
    add(entry.get("letterName"), entry.get("ipa"))
    for variant in entry.get("variations") or []:
        for example in variant.get("examples") or []:
            add(example.get("word"), example.get("ipa"))
    return words


def respell(ipas: list[str], locale: str) -> list[str]:
    """What each IPA span will SOUND like in `locale`, via the real transliterator.

    The validator has to judge the recording, not the page: two different
    symbols can respell to the same string in the reader's language (Romanian
    reads both /æ/ and /ɑː/ as "a"), and a page that lists them without a
    qualifier leaves the learner unable to tell the variants apart by ear.
    Delegating to scripts/lib/ipa-translit.mjs keeps this check honest — a
    Python copy of the map would drift from the one the audio is built with.
    """
    if not ipas:
        return []
    payload = json.dumps([{"ipa": ipa, "lang": locale} for ipa in ipas]).encode("utf-8")
    try:
        done = subprocess.run(
            ["node", str(ROOT / "scripts" / "lib" / "respell-cli.mjs")],
            input=payload,
            capture_output=True,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if done.returncode != 0:
        return []
    try:
        return [str(x) for x in json.loads(done.stdout.decode("utf-8"))]
    except (ValueError, TypeError):
        return []


def colliding_variants(entry: dict[str, Any], locale: str) -> list[tuple[str, str, str]]:
    """Variant pairs that the voice would pronounce identically.

    Returns `(ipa_a, ipa_b, respelling)` for each pair of the letter's own
    variants whose respelling in `locale` is the same. The page must then
    qualify them in words ("un a deschis", "un a lung"), because the symbols
    alone are indistinguishable once spoken.
    """
    ipas = [str(v.get("ipa") or "").strip() for v in entry.get("variations") or []]
    ipas = [ipa for ipa in ipas if ipa and ipa != "/∅/"]
    if len(ipas) < 2:
        return []
    spoken = respell(ipas, locale)
    if len(spoken) != len(ipas):
        return []
    out: list[tuple[str, str, str]] = []
    for i in range(len(ipas)):
        for j in range(i + 1, len(ipas)):
            if spoken[i] and spoken[i] == spoken[j]:
                out.append((ipas[i], ipas[j], spoken[i]))
    return out


def bare_foreign_words(text: str, facts: dict[str, set[str]]) -> list[str]:
    """Target-language words written outside the `(word) /ipa/` pair.

    A voice of the explanation language reads such a word with its own rules,
    which is the mispronunciation the pairing exists to prevent. Only words of
    six letters or more are checked: shorter ones are usually also ordinary
    words of the explanation language ("sac", "port", "table"), and rejecting a
    page for those would cost a repair round for nothing.
    """
    outside = IPA_SPAN.sub(" ", BRACKETED_WITH_IPA.sub(" ", text))
    return [
        word
        for word in facts
        if len(word) >= 6
        and re.search(rf"(?<![\w-]){re.escape(word)}(?![\w-])", outside, re.IGNORECASE)
    ]


def bare_group_glyph(text: str, glyph: str | None) -> str | None:
    """A group's own spelling written bare in the prose — or None.

    A group article ("-gh(t)", "kn-", "-tion") is ABOUT that spelling, so the
    prose has to be able to name it; the `(word) /ipa/` rule is for words, and
    a group is not a word. What must not happen is the group's spelling being
    read as a target-language word, so it is allowed bare but never inside the
    brackets of a pair.
    """
    if not glyph or len(glyph) < 2:
        return None
    for word, _ipa in BRACKETED_WITH_IPA.findall(text):
        if word.strip().lower() == glyph.strip().lower():
            return word
    return None


#: Single letters that are also ordinary words of the explanation languages
#: ("a", "e", "o", "i" in Romanian; "a" in every Romance language, "A" at the
#: start of an English sentence). Written as a bare glyph they are far more
#: likely to be prose than a reference to the letter being taught, and for a
#: vowel the explanation language's letter name is usually the same sound
#: anyway, so flagging them would cost a repair round for nothing.
WORD_LIKE_GLYPHS = set("aeiouyàáâãäåèéêëìíîïòóôõöùúûüăĕəɛɪɔʊșțşţ")


def bare_glyph(text: str, glyph: str | None) -> str | None:
    """The letter being taught, written bare in the prose — or None.

    The article title already shows the glyph, and a voice of the explanation
    language reads a bare glyph as ITS OWN letter name: a Romanian voice says
    "ce" for a French **c**, which is the wrong sound. The prose therefore
    names the letter by its name, in the `(name) /ipa/` form.

    Only SINGLE characters are checked. A group's glyph ("oi", "th", "-tion")
    is a spelling pattern, not a letter name, and it is also the group's own
    name — so the prose has to be able to write it, and a voice reading "oi"
    produces roughly the intended diphthong rather than a wrong letter name.
    """
    if not glyph or len(glyph) > 1 or glyph.lower() in WORD_LIKE_GLYPHS:
        return None
    outside = IPA_SPAN.sub(" ", BRACKETED_WITH_IPA.sub(" ", text))
    outside = re.sub(r"\*\*([^*]+)\*\*", r"\1", outside)
    match = re.search(rf"(?<![\w(]){re.escape(glyph)}(?![\w)])", outside)
    return match.group(0) if match else None


def is_group(entry: dict[str, Any]) -> bool:
    """True for a letter-GROUP entry ("-tion", "kn-", "ea"), false for a letter.

    A group is about a spelling, so the rules that protect a letter's name do
    not apply: its glyph may contain brackets or a hyphen, and the prose has to
    be able to write it bare.
    """
    return str(entry.get("kind") or "").lower() == "group" or len(str(entry.get("glyph") or "")) > 1


#: Punctuation a voice turns into an odd pause or skips (rule R14).
VOICE_PUNCTUATION = re.compile(r"[:;—–…\"“”„«»]|\.{2,}|\s-\s")
#: Rule R6 says 20 words; the margin keeps repair rounds for real offenders.
MAX_SENTENCE_WORDS = 24


def spoken_form_problems(tag: str, text: str, outside_ipa: str) -> list[str]:
    """What a voice reads badly: digits, capitals, odd punctuation, long sentences.

    `outside_ipa` is the page text with its IPA spans blanked, because IPA has
    its own symbols and is respelled before it reaches the voice.
    """
    problems: list[str] = []
    if re.search(r"\d", outside_ipa):
        problems.append(f"{tag} contains a digit; write every number as a word (rule R13)")
    # Bracketed target words are skipped by the voice, so only the prose is checked.
    prose = re.sub(r"\([^()]*\)", " ", outside_ipa)
    shouted = [word for word in re.findall(r"[^\W\d_]{2,}", prose) if word.isupper()]
    if shouted:
        problems.append(
            f"{tag} writes '{shouted[0]}' in capitals; the voice spells it out or shouts it (rule R13)"
        )
    if VOICE_PUNCTUATION.search(outside_ipa):
        problems.append(
            f"{tag} uses a colon, semicolon, dash, ellipsis or quotation mark; "
            "only . , ? ! are allowed (rule R14)"
        )
    if not re.search(r"[.!?]\**$", text.strip()):
        problems.append(f"{tag} must end with a full stop, question mark or exclamation mark (rule R14)")
    for sentence in re.split(r"[.!?]+", outside_ipa):
        count = len(sentence.split())
        if count > MAX_SENTENCE_WORDS:
            problems.append(f"{tag} has a sentence of {count} words; the limit is 20 (rule R6)")
            break
    return problems


def validate_sections(
    entry: dict[str, Any], sections: Any, locales: tuple[str, ...]
) -> list[str]:
    """Deterministic checks of the writing rules; empty list means clean."""
    problems: list[str] = []
    if not isinstance(sections, dict):
        return [f"`sections` must be an object keyed by {', '.join(locales)}"]
    facts = entry_words(entry)
    for locale in locales:
        page_set = sections.get(locale)
        if not isinstance(page_set, dict):
            problems.append(f"[{locale}] missing")
            continue
        seen: dict[str, str] = {}
        for key in SECTION_KEYS:
            page = page_set.get(key)
            tag = f"[{locale}.{key}]"
            if not isinstance(page, dict) or not str(page.get("text") or "").strip():
                problems.append(f"{tag} page is missing")
                continue
            if not str(page.get("title") or "").strip():
                problems.append(f"{tag} title is missing")
            title = str(page.get("title") or "")
            # A group's own spelling may legitimately contain brackets
            # ("-gh(t)"), so only the IPA check applies to it.
            if "/" in title or ("(" in title and not is_group(entry)):
                problems.append(
                    f"{tag} title must name the letter plainly — no brackets and no IPA "
                    "(the title is not read aloud)"
                )
            text = str(page["text"]).strip()
            # A group's own spelling may contain brackets or a hyphen
            # ("-gh(t)", "-tion"), so a STANDALONE occurrence of it is removed
            # before the markup and bracket checks. Only standalone: a plain
            # substring replace would mangle every word that contains the
            # group ("th" inside "think").
            checked = text
            glyph_text = str(entry.get("glyph") or "")
            if is_group(entry) and glyph_text:
                checked = re.sub(
                    rf"(?<![\w]){re.escape(glyph_text)}(?![\w])", " ", checked
                )
            if re.search(r"[`\[\]|#<>\n]", checked):
                problems.append(f"{tag} uses forbidden markup (backtick, [ ], |, #, < >, line break)")
            if re.sub(r"\*\*[^*]+\*\*", "", checked).count("*"):
                problems.append(f"{tag} uses markup other than **bold**")
            outside_ipa = IPA_SPAN.sub(" ", checked)
            if "/" in outside_ipa:
                problems.append(f"{tag} has a slash that is not around IPA")
            if IPA_ONLY_CHARS.search(re.sub(r"\([^()]*\)", " ", outside_ipa)):
                problems.append(f"{tag} has IPA characters outside slashes")
            if checked.count("(") != checked.count(")"):
                problems.append(f"{tag} has unbalanced round brackets")
            brackets = BRACKETED.findall(checked)
            paired = BRACKETED_WITH_IPA.findall(checked)
            if len(brackets) != len(paired):
                problems.append(
                    f"{tag} every round bracket must hold ONE target word followed by a space and its /ipa/ "
                    "outside the brackets: (word) /ipa/"
                )
            for word, ipa in paired:
                key_word = word.strip().lower()
                known = facts.get(key_word)
                if known is None:
                    if is_group(entry) and key_word == str(entry.get("glyph") or "").strip().lower():
                        problems.append(
                            f"{tag} writes the group's own spelling '({word})' as if it were a word; "
                            "a group is written bare, with no brackets and no IPA (rule R12)"
                        )
                    else:
                        problems.append(f"{tag} ({word}) is not a word from FACTS")
                elif ipa not in known:
                    problems.append(
                        f"{tag} ({word}) must be followed by exactly "
                        f"{' or '.join(sorted(known))}, not {ipa}"
                    )
                # R8 lets every page name the letter, so the name is exempt
                # from the one-page-per-word rule.
                if key_word != str(entry.get("letterName") or "").strip().lower():
                    previous = seen.get(key_word)
                    if previous and previous != key:
                        problems.append(f"{tag} ({word}) is already used on page {previous}")
                    seen.setdefault(key_word, key)
            for word in bare_foreign_words(checked, facts):
                problems.append(
                    f"{tag} writes the target-language word '{word}' outside the (word) /ipa/ pair; "
                    "the voice would read it with the wrong rules"
                )
            group = bare_group_glyph(checked, entry.get("glyph"))
            if group:
                problems.append(
                    f"{tag} puts the group's own spelling '{group}' inside the (word) /ipa/ brackets; "
                    "a group is not a word — write it bare and give a real word as the example"
                )
            if "/∅/" in text:
                problems.append(
                    f"{tag} writes /∅/ in the prose; the voice reads it as a word — say in words that "
                    "the letter is not pronounced"
                )
            glyph = bare_glyph(checked, entry.get("glyph"))
            if glyph:
                problems.append(
                    f"{tag} writes the bare glyph '{glyph}'; the voice reads it as the letter name of "
                    "the page's language — name the letter in the (word) /ipa/ form instead"
                )
            problems.extend(spoken_form_problems(tag, text, outside_ipa))
            words = len(outside_ipa.split())
            if words > round(PAGE_LIMITS[key] * 1.15):
                problems.append(f"{tag} has {words} words, the limit is {PAGE_LIMITS[key]}")
        # Two variants the voice pronounces identically must be told apart in
        # words, or the learner hears the same sound twice with no way to know
        # which is which. Checked once per locale, on the page that lists them.
        for ipa_a, ipa_b, spoken in colliding_variants(entry, locale):
            if not any(
                ipa_a in str((page_set.get(key) or {}).get("text") or "")
                and ipa_b in str((page_set.get(key) or {}).get("text") or "")
                for key in SECTION_KEYS
            ):
                continue
            qualified = any(
                re.search(rf"{re.escape(ipa_a)}[^./]{{0,40}}(adică|that is|es decir|c'est-à-dire|das heißt|то есть|azaz|ou seja|cioè)", str((page_set.get(key) or {}).get("text") or ""), re.IGNORECASE)
                or re.search(rf"{re.escape(ipa_b)}[^./]{{0,40}}(adică|that is|es decir|c'est-à-dire|das heißt|то есть|azaz|ou seja|cioè)", str((page_set.get(key) or {}).get("text") or ""), re.IGNORECASE)
                for key in SECTION_KEYS
            )
            if not qualified:
                problems.append(
                    f"[{locale}] variants {ipa_a} and {ipa_b} both sound like '{spoken}' in this "
                    "language; qualify them in words so the learner can tell them apart by ear"
                )
    return problems


def spoken_preview(texts: list[str], locale: str) -> list[str]:
    """What the TTS stage will actually say — the same node transliterator."""
    script = (
        "import {transliterate} from './scripts/lib/ipa-translit.mjs';"
        "let s='';process.stdin.on('data',d=>s+=d);"
        "process.stdin.on('end',()=>{const p=JSON.parse(s);"
        "process.stdout.write(JSON.stringify(p.map(t=>transliterate(t,process.argv[1]))));});"
    )
    # Same Markdown stripping the read pass applies before transliterating.
    cleaned = [re.sub(r"[*_`>]+", "", text) for text in texts]
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script, locale],
        input=json.dumps(cleaned),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=ROOT,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip()[:200] or "node exited non-zero")
    return json.loads(result.stdout)


def parse_model_json(text: str) -> Any:
    """json.loads, plus one repair for a failure the model repeats.

    Gemini sometimes drops a closing brace just before the final `]}`, which
    leaves the whole answer unparseable and, for some entries, fails every
    retry. Adding the brace back is safe: a misplaced one yields a structure the
    section validator rejects, so it can never store a malformed page.
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        if not text.endswith("]}"):
            raise
        for missing in (1, 2):
            try:
                return json.loads(text[:-2] + "}" * missing + "]}")
            except json.JSONDecodeError:
                continue
        raise


def call_gemini(prompt: str, expected: set[str]) -> dict[str, dict[str, Any]]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required (set it in .env).")

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
            # These responses are large (4 pages x 3 locales per entry), so
            # the default cap truncates the JSON mid-string.
            "maxOutputTokens": 16384,
            # Gemini 3.x spends output tokens on internal reasoning by default,
            # which eats the budget before the JSON is complete.
            "thinkingConfig": {"thinkingBudget": 0},
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

    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                body = json.loads(response.read().decode("utf-8"))
            text = body["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"\A```(?:json)?\s*|\s*```\Z", "", text)
            result = parse_model_json(text)
            items = result if isinstance(result, list) else result.get("items")
            if not isinstance(items, list):
                raise ValueError("Gemini returned JSON without an items array")
            by_code: dict[str, dict[str, Any]] = {}
            for item in items:
                code = item.get("code")
                if not isinstance(code, str) or code in by_code:
                    raise ValueError("Gemini returned a missing or duplicate code")
                by_code[code] = item
            if not set(by_code).issubset(expected):
                raise ValueError(f"unexpected codes: {sorted(set(by_code) - expected)}")
            return by_code
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code < 600
            detail = error.read().decode("utf-8", errors="replace")[:400]
            if not retryable or attempt == 3:
                raise RuntimeError(f"Gemini HTTP {error.code}: {detail}") from error
        except urllib.error.URLError as error:
            if attempt == 3:
                raise RuntimeError(f"Gemini connection failed: {error.reason}") from error
        except TimeoutError as error:
            if attempt == 3:
                raise RuntimeError("Gemini request timed out") from error
        except (KeyError, IndexError, json.JSONDecodeError, ValueError) as error:
            if attempt == 3:
                raise RuntimeError(f"Invalid Gemini response: {error}") from error
        time.sleep(2**attempt)
    raise RuntimeError("Gemini generation failed after retries")


def author_meta(entry: dict[str, Any], lang: str) -> dict[str, Any]:
    """Stage 1 for one entry: example, translations and variants."""
    code = entry["code"]
    return call_gemini(prompt_meta([build_request(entry)], lang), {code}).get(code) or {}


def author_sections(
    entry: dict[str, Any], lang: str, locales: tuple[str, ...]
) -> tuple[dict[str, Any], list[str]]:
    """Stage 2 for one entry and locale group, with one repair round.

    The validator is the contract with the TTS stage; a page that breaks it is
    never stored, because it would be spoken wrongly on every playback.
    """
    code = entry["code"]
    request = [build_request(entry, with_facts=True)]
    feedback = ""
    result: dict[str, Any] = {}
    problems: list[str] = []
    for _ in range(2):
        result = call_gemini(prompt_sections(request, lang, locales, feedback), {code}).get(code) or {}
        problems = validate_sections(entry, result.get("sections"), locales)
        if not problems:
            return result, []
        feedback = "\n".join(f"- {problem}" for problem in problems[:12])
    return result, problems


def apply_result(
    entry: dict[str, Any], result: dict[str, Any], overwrite: bool, locales: tuple[str, ...]
) -> int:
    """Merge one Gemini result into an entry. Returns the number of fields set."""
    changed = 0

    example_ipa = result.get("exampleIpa")
    if isinstance(example_ipa, str) and example_ipa.strip() and (overwrite or is_missing(entry.get("exampleIpa"))):
        entry["exampleIpa"] = example_ipa.strip()
        changed += 1

    example = result.get("example")
    if isinstance(example, str) and example.strip() and (overwrite or is_missing(entry.get("example"))):
        entry["example"] = example.strip()
        changed += 1

    translations = result.get("exampleTranslation")
    if isinstance(translations, dict):
        current = entry.get("exampleTranslation") or {}
        merged = dict(current)
        for locale in locales:
            value = translations.get(locale)
            if isinstance(value, str) and value.strip() and (overwrite or is_missing(merged.get(locale))):
                merged[locale] = value.strip()
                changed += 1
        if merged:
            entry["exampleTranslation"] = merged

    variations = result.get("variations")
    if isinstance(variations, list) and variations and (overwrite or not entry.get("variations")):
        cleaned = []
        for variant in variations:
            if not isinstance(variant, dict):
                continue
            ipa = variant.get("ipa")
            when = variant.get("when")
            if not isinstance(ipa, str) or not ipa.strip():
                continue
            examples = []
            for example in variant.get("examples") or []:
                if not isinstance(example, dict):
                    continue
                word = example.get("word")
                word_ipa = example.get("ipa")
                if isinstance(word, str) and word.strip():
                    examples.append(
                        {"word": word.strip(), "ipa": (word_ipa or "").strip()}
                    )
            cleaned.append(
                {
                    "ipa": ipa.strip(),
                    "when": (when or "").strip(),
                    "examples": examples,
                }
            )
        if cleaned:
            entry["variations"] = cleaned
            changed += 1

    sections = result.get("sections")
    if isinstance(sections, dict):
        current = entry.get("sections") or {}
        merged = dict(current)
        for locale in locales:
            value = sections.get(locale)
            if not isinstance(value, dict):
                continue
            row = {}
            for key in SECTION_KEYS:
                section = value.get(key)
                if not isinstance(section, dict):
                    continue
                text = section.get("text")
                if not isinstance(text, str) or not text.strip():
                    continue
                row[key] = {
                    "title": (section.get("title") or "").strip(),
                    "text": text.strip(),
                }
            if row and (overwrite or not merged.get(locale)):
                merged[locale] = row
                changed += 1
        if merged:
            entry["sections"] = merged

    return changed



def preview(
    entries: list[dict[str, Any]],
    lang: str,
    groups: tuple[tuple[str, ...], ...],
    overwrite: bool,
    facts: bool = False,
) -> None:
    """Author in memory and print — for tuning the prompts without writing."""
    for entry in entries:
        draft = json.loads(json.dumps(entry))
        if facts or needs_meta(draft):
            draft.pop("variations", None)
            apply_result(draft, author_meta(draft, lang), True, tuple(LOCALES))
        print(f"\n===== {lang} {draft['code']} {draft.get('glyph')!r} =====")
        print(f"example: {draft.get('example')} {draft.get('exampleIpa')}")
        for variant in draft.get("variations") or []:
            words = ", ".join(f"{e['word']} {e['ipa']}" for e in variant.get("examples", []))
            print(f"  variant {variant['ipa']}  {variant['when']}  [{words}]")
        for locales in groups:
            result, problems = author_sections(draft, lang, locales)
            for locale in locales:
                pages = (result.get("sections") or {}).get(locale) or {}
                keys = [key for key in SECTION_KEYS if isinstance(pages.get(key), dict)]
                spoken = spoken_preview([pages[key].get("text", "") for key in keys], locale)
                for key, said in zip(keys, spoken):
                    page = pages[key]
                    count = len(IPA_SPAN.sub(" ", page.get("text", "")).split())
                    print(f"\n--- [{locale}] {key}: {page.get('title')}  ({count}/{PAGE_LIMITS[key]} words)")
                    print(page.get("text", ""))
                    print(f"  SPOKEN: {said}")
            print("\nPROBLEMS:" if problems else "\nrules: all pass")
            for problem in problems:
                print(f"  - {problem}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lang", choices=LOCALES, help="only this target language")
    parser.add_argument("--all", action="store_true", help="every language with an alphabet file")
    parser.add_argument("--code", help="only these item codes, comma-separated (e.g. L460)")
    parser.add_argument("--locales", help="only these explanation locales, comma-separated (e.g. ro)")
    parser.add_argument("--apply", action="store_true", help="write the generated content")
    parser.add_argument("--preview", action="store_true", help="author in memory and print the pages, the spoken text and rule violations; writes nothing")
    parser.add_argument("--overwrite", action="store_true", help="re-author the pages (keeps the facts)")
    parser.add_argument("--facts", action="store_true", help="re-author the facts too (example, translations, variants); every locale's pages then quote stale words, so re-author them as well")
    args = parser.parse_args()

    load_env()
    langs = [args.lang] if args.lang else sorted(p.stem for p in ALPHABETS.glob("*.json"))
    if not args.lang and not args.all:
        parser.error("choose --lang <code> or --all")
    codes = {c.strip() for c in args.code.split(",") if c.strip()} if args.code else None
    wanted = tuple(c.strip() for c in args.locales.split(",") if c.strip()) if args.locales else None
    if wanted and not set(wanted).issubset(LOCALES):
        parser.error(f"--locales must be among {', '.join(LOCALES)}")
    groups = locale_groups(wanted)

    grand_total = 0
    for lang in langs:
        data = load_alphabet(lang)
        pending = pending_entries(data, args.overwrite, codes, groups, args.facts)
        print(f"{lang}: {len(entries_of(data))} entries, {len(pending)} need content")
        if not pending:
            continue
        if args.preview:
            preview(pending, lang, groups, args.overwrite, args.facts)
            continue
        if not args.apply:
            for entry in pending:
                print(f"  would author: {entry.get('code')} {entry.get('glyph')!r}")
            continue

        changed = 0
        # Stage 1 — the facts (example, translations, variants), once per entry,
        # so every locale's pages are written from the same words and variants.
        meta_todo = [e for e in pending if args.facts or needs_meta(e)]
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            futures = {pool.submit(author_meta, entry, lang): entry for entry in meta_todo}
            for future in as_completed(futures):
                entry = futures[future]
                try:
                    changed += apply_result(entry, future.result(), args.facts, tuple(LOCALES))
                except RuntimeError as error:
                    print(f"  skipping facts for {entry.get('code')}: {error}", file=sys.stderr)
        write_json_atomic(alphabet_path(lang), data)

        # Stage 2 — each (entry, locale-group) pair is an independent call, so
        # they run concurrently: 363 entries x 3 groups is ~1100 calls, which is
        # hours of wall time sequentially.
        #
        # Re-authoring the facts invalidates every locale's pages (they quote
        # those words), so --facts implies --overwrite for the pages.
        rewrite_pages = args.overwrite or args.facts
        jobs = [
            (entry, group)
            for entry in pending
            if entry.get("variations") and entry.get("example")
            for group in (groups if rewrite_pages else incomplete_locales(entry, groups))
        ]
        for entry in pending:
            if not (entry.get("variations") and entry.get("example")):
                print(f"  {entry.get('code')}: no facts yet, pages not written", file=sys.stderr)
        total_jobs = len(jobs)
        completed = 0
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            futures = {
                pool.submit(author_sections, entry, lang, group): (entry, group)
                for entry, group in jobs
            }
            for future in as_completed(futures):
                entry, group = futures[future]
                completed += 1
                try:
                    result, problems = future.result()
                except RuntimeError as error:
                    print(f"  skipping {entry.get('code')} [{group[0]}/{group[-1]}]: {error}", file=sys.stderr)
                    continue
                if problems:
                    print(
                        f"  rejected {entry.get('code')} [{group[0]}/{group[-1]}]: "
                        + "; ".join(problems[:4]),
                        file=sys.stderr,
                    )
                else:
                    changed += apply_result(entry, {"sections": result["sections"]}, rewrite_pages, group)
                if completed % 10 == 0 or completed == total_jobs:
                    write_json_atomic(alphabet_path(lang), data)
                    print(f"  {completed}/{total_jobs} call(s) done, {changed} field(s) written", flush=True)
        write_json_atomic(alphabet_path(lang), data)
        grand_total += changed
        print(f"{lang}: wrote {changed} field(s)")

    if args.apply:
        print(f"Done — {grand_total} field(s) written.")
    elif not args.preview:
        print("Run with --apply to call Gemini and write the content, or --preview to read the pages first.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
