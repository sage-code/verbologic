# Phonetic article prompt — v0.1 (draft, not executed)

Status: **draft, not executed.** Input for phase 5 of `planning/content-in-database.md` (IPA glossary and the writing and translation prompts). The glossary replaces its model-chosen terminology; keep its fact-driven approach.

Goal: a short article per sound (letter, digraph, cluster) that explains the pronunciation **with IPA terms and anchor words**, in the pattern you asked for:

> *a **velar nasal**, /ŋ/, as in **sing** /sɪŋ/ — the back of the tongue touches the soft palate and air leaves through the nose.*

(One terminology note, because it shows why this design exists: "glottal nasal" is not a sound — nasals are bilabial /m/, alveolar /n/, palatal /ɲ/, velar /ŋ/; glottal sounds are /h/ and /ʔ/. A model asked to describe sounds from memory will sometimes mix place and manner this way, so **the labels come from a table, not from the model**.)

---

## 1. Design rules

1. **Facts in, prose out.** Place, manner, voicing, vowel height/backness/rounding, length — all supplied from `generation/ipa-reference.yaml`. The model may not add, change or infer them. Missing fact ⇒ it must return an error object, not guess.
2. **Examples only from supplied lists.** Reference words ("anchors": *sing* /sɪŋ/) come from a curated `generation/anchors.yaml`; target-language words come from the dictionary data with their stored IPA. The model never invents a word or a transcription; it copies IPA verbatim.
3. **The reader's language is data, not guesswork.** `generation/inventories/<locale>.yaml` lists the phonemes of each explanation language. The generator computes — deterministically — whether the reader's language has this sound, its closest L1 sounds by feature distance, and any known confusions. The "compared with your language" section is therefore written **natively per explanation locale** from those facts; it is *not* a translation of English.
4. **Terminology is pinned per language** (`generation/phonetics-glossary.yaml`): *velar / velar / velare / vélaire / velar / заднеязычный / veláris / velar*, *voiceless*, *fricative*, … The prompt supplies the exact terms; the validator rejects others.
5. **One section = one page.** The reading view paginates by `##` heading, so each section is a short, self-contained page (≤ 60 words).
6. **Structured output.** Gemini `responseSchema`; the renderer builds Markdown/HTML. Formatting can't drift between locales.
7. **IPA conventions.** Phonemes in slashes `/ʃ/`; phonetic detail in brackets `[ŋ]`; graphemes in angle brackets `⟨ș⟩`; stress `ˈ`; real IPA characters (NFC), never "sh"-style respellings used as a transcription.

## 2. Inputs the generator builds (per sound, per explanation locale)

Illustrative `INPUT` for Romanian ⟨ș⟩ explained in English (all values come from tables/data; none is typed by the model):

```json
{
  "explanationLocale": "en",
  "target": {
    "lang": "ro",
    "grapheme": "ș",
    "graphemeUpper": "Ș",
    "ipa": "/ʃ/",
    "orthographyNotes": ["Written with a comma below (⟨ș⟩), not a cedilla (⟨ş⟩)."],
    "words": [
      { "text": "și",     "ipa": "/ʃi/",       "gloss": "and" },
      { "text": "mașină", "ipa": "/maˈʃi.nə/", "gloss": "car" },
      { "text": "șase",   "ipa": "/ˈʃa.se/",   "gloss": "six" }
    ],
    "contrastWords": [
      { "text": "sare", "ipa": "/ˈsa.re/", "gloss": "salt", "contrastsWith": "șase" }
    ]
  },
  "facts": {
    "symbol": "ʃ", "class": "consonant",
    "place": "postalveolar", "manner": "fricative", "voicing": "voiceless"
  },
  "anchors": [
    { "id": "ʃ-en-1", "lang": "en", "spelling": "sh", "word": "ship",  "ipa": "/ʃɪp/" },
    { "id": "ʃ-fr-1", "lang": "fr", "spelling": "ch", "word": "chat",  "ipa": "/ʃa/" },
    { "id": "ʃ-de-1", "lang": "de", "spelling": "sch", "word": "Schule", "ipa": "/ˈʃuː.lə/" }
  ],
  "l1": {
    "hasPhoneme": true,
    "closest": [],
    "anchorsInL1": ["ʃ-en-1"],
    "knownConfusions": [
      { "with": "s", "reason": "spelling: ⟨ș⟩ vs ⟨s⟩ changes the word", "contrastWords": ["sare", "șase"] }
    ]
  },
  "glossary": {
    "postalveolar": "postalveolar", "fricative": "fricative", "voiceless": "voiceless",
    "tongue_blade": "blade of the tongue", "alveolar_ridge": "alveolar ridge"
  },
  "limits": { "maxWordsPerSection": 60 }
}
```

For a sound the reader's language lacks (e.g. Romanian ⟨â⟩/⟨î⟩ /ɨ/ for an English reader): `l1.hasPhoneme: false`, `l1.closest` = feature-nearest L1 symbols with their anchors, and `knownConfusions` from the table. If neither is available, the compare section must say less, not guess.

## 3. System prompt (literal)

```
You are a phonetics teacher writing very short articles for language learners.
You explain exactly ONE sound, using IPA, in the reader's language.

RULES — follow all of them; a violation makes the output unusable.
1. FACTS are authoritative. Describe the sound only with the labels in FACTS,
   using the exact terms in GLOSSARY. Never add, change or infer place, manner,
   voicing, height, backness or rounding. If you need a fact that is not given,
   return {"error":"missing_fact","field":"<name>"} and nothing else.
2. EXAMPLES come only from TARGET.words, TARGET.contrastWords and ANCHORS.
   Never invent a word, a spelling or a transcription. Copy every IPA string
   exactly as given, including slashes and stress marks.
3. IPA FORMAT: phonemes in slashes /ʃ/, narrow detail in brackets [ʃ],
   graphemes in angle brackets ⟨ș⟩. Real IPA characters only; never use a
   respelling ("sh") as if it were a transcription. A spelling may appear as
   ⟨sh⟩ when naming how an anchor word is written.
4. FIRST MENTION of a technical term gives the term from GLOSSARY and, in a few
   plain words, what it means in the mouth. Do not use any technical term that
   is not in GLOSSARY.
5. THE PATTERN for the opening sentence of "sound":
   "<grapheme> is a <manner/place/voicing terms>, <IPA>, as in <anchor or target
   word> <IPA of that word>."  Adapt grammar to the language; keep the order of
   facts: voicing, place, manner (vowels: height, backness, rounding).
6. "compare" is written ONLY from L1. If L1.hasPhoneme is true, point to the
   L1 anchors and say it is the same sound. If false, name L1.closest, say what
   differs using only L1.knownConfusions, and give one contrast word pair if
   supplied. If L1 gives nothing usable, write one honest sentence and stop.
7. Do not state facts about dialects, frequency, history or other languages
   unless they appear in INPUT. No metaphors that imply a sound the facts
   don't describe.
8. Write in the explanation language, plain and direct, address the reader as
   "you" (use the register in STYLE). ≤ limits.maxWordsPerSection words per
   section. No headings, no lists, no Markdown except inline tokens below.
9. INLINE TOKENS (the renderer expands them): {ipa:ʃ} for a symbol,
   {ex:ship} for an example word whose IPA the renderer looks up by id,
   {g:ș} for a grapheme. Use ids from the input; do not write IPA yourself
   unless you copy an exact string.
10. Output ONLY JSON matching the response schema.
```

User prompt (template):

```
EXPLANATION LOCALE: {{explanationLocale}}
STYLE: {{styleGuide}}            # register, pt-PT vs pt-BR, tu/vous, etc. from locales/<lang>.yaml
GLOSSARY: {{glossary}}
INPUT: {{inputJson}}

Write the four sections: sound, howToSay, spelling, compare.
```

## 4. Response schema (Gemini `responseSchema`)

```json
{
  "type": "object",
  "required": ["sections", "used"],
  "properties": {
    "error": { "type": "string", "enum": ["missing_fact"] },
    "field": { "type": "string" },
    "sections": {
      "type": "object",
      "required": ["sound", "howToSay", "spelling", "compare"],
      "properties": {
        "sound":    { "type": "object", "required": ["title", "text"], "properties": { "title": {"type":"string"}, "text": {"type":"string"} } },
        "howToSay": { "type": "object", "required": ["title", "text"], "properties": { "title": {"type":"string"}, "text": {"type":"string"} } },
        "spelling": { "type": "object", "required": ["title", "text"], "properties": { "title": {"type":"string"}, "text": {"type":"string"} } },
        "compare":  { "type": "object", "required": ["title", "text"], "properties": { "title": {"type":"string"}, "text": {"type":"string"} } }
      }
    },
    "used": {
      "type": "object",
      "required": ["anchors", "words", "labels"],
      "properties": {
        "anchors": { "type": "array", "items": { "type": "string" } },
        "words":   { "type": "array", "items": { "type": "string" } },
        "labels":  { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

`used` is the model's own declaration of which anchors/words/labels it relied on; the validator checks it against the text, so an unreported or invented item is caught.

Page mapping (one `##` per section, one page each): **1 The sound → 2 How to say it → 3 Spelling and words → 4 Compared with your language.** Titles are generated in the explanation language (fixed per-locale defaults exist as a fallback).

## 5. Deterministic validators (run before anything is stored)

| Check | Failure means |
|---|---|
| Schema valid; all four sections present; ≤ word limit | repair call |
| Every `/…/` and `[…]` segment in the text is **a verbatim string from INPUT** (facts symbol, anchors, target/contrast words) | invented or altered transcription |
| Every `{ex:…}`, `{ipa:…}`, `{g:…}` token resolves to an input id | invented example |
| Every label term used ∈ GLOSSARY[locale]; first mention appears with its gloss | unapproved terminology |
| Label ↔ fact consistency: place/manner/voicing words in "sound" equal the facts' (via glossary reverse lookup); impossible combos blocked by the reference table (e.g. nasal + glottal) | wrong description |
| `used.*` equals what the text actually references | silent invention |
| Script/diacritic rules per locale (Romanian ș/ț comma-below U+0219/U+021B, not cedilla; Hungarian ő/ű; NFC) | encoding defect |
| Language check: text is in the explanation language | wrong language |
| Opening sentence follows the §3 rule-5 pattern (grapheme, term set, IPA, anchor + IPA) | template drift |

Failures go to a **per-field repair** call (with the violated rule quoted), at most once; a second failure goes to the human review queue. Provenance stored: `gen: { model, promptVersion, inputHash, at }`, `status: machine`.

## 6. Worked example (target output, English explaining Romanian ⟨ș⟩)

Hand-written to show the intended quality and tone; **not** model output.

**1 · The sound**
⟨ș⟩ is a voiceless postalveolar fricative, {ipa:ʃ}, as in *ship* {ex:ship}. Voiceless means your vocal cords stay still; fricative means air is pushed through a narrow gap, so you hear a hiss.

**2 · How to say it**
Raise the blade of the tongue toward the ridge behind your upper teeth, a little further back than for /s/. Push air through the gap. Put a hand on your throat: you should feel no vibration.

**3 · Spelling and words**
Romanian writes this sound ⟨ș⟩, with a comma below (not a cedilla). Words: *și* {ex:și} “and”, *mașină* {ex:mașină} “car”, *șase* {ex:șase} “six”.

**4 · Compared with your language**
You already have this sound: it is the one in English *ship* {ex:ship}. Take care with the spelling, because ⟨ș⟩ and ⟨s⟩ make different words: *sare* {ex:sare} “salt” but *șase* {ex:șase} “six”.

Rendered form of the opening line: “ș is a voiceless postalveolar fricative, /ʃ/, as in *ship* /ʃɪp/.”

## 7. Translation prompt for sections 1–3 (language-independent facts)

Sections `sound`, `howToSay` and `spelling` state facts that do not depend on the reader, so they can be written once in English and **translated** with the pinned glossary; `compare` is always generated natively (§1.3).

```
Translate the three JSON text fields into <LOCALE> for language learners.
Keep every {token}, /…/, […] and ⟨…⟩ segment byte-identical. Use ONLY the
terms in GLOSSARY for technical words (the English term → the locale term).
Keep the sentence pattern of the first sentence. Do not add or remove facts.
Register: <STYLE>. Return JSON with the same keys.
```

Validators are the §5 list again (token/IPA segments must equal the English source's). Then the native `compare` call runs per locale.

## 8. Data to author before this can run (no generation involved)

| File | Content | Size (est.) | Verification |
|---|---|---|---|
| `generation/ipa-reference.yaml` | One entry per IPA symbol used by the site's languages: class, place/manner/voicing or vowel features | ~120 symbols (union of the 9 languages) | You on ro/en; cross-check against a standard IPA chart; script rejects impossible feature combos |
| `generation/anchors.yaml` | 1–3 reference words per symbol per language that has it, with IPA | ~120 symbols × a few languages | Native-speaker spot check; IPA copied from a dictionary source, not generated |
| `generation/inventories/<locale>.yaml` (×9) | Phoneme inventory of each explanation language | ~25–45 symbols each | Cross-check with an open inventory database (e.g. PHOIBLE — verify licence before use) |
| `generation/phonetics-glossary.yaml` | ~40 technical terms × 9 languages | ~360 strings | You on ro/en; sample for others |
| `generation/locales/<lang>.yaml` | Style guide (register, pt-PT, orthography rules) | 9 small files | Shared with the translation pipeline (§8.2) |

Existing alphabet files (`src/data/alphabets/*.json`) already hold glyph, IPA, letter name and example per letter; many `letterName`/`example` fields are `null` and the current notes are one generic sentence ("The letter Ă is a character in the Romanian alphabet") — this prompt replaces those notes.

## 9. Variants for the rest of lecture L1 (same machinery, different fact sources)

| Topic | Facts supplied | Section set |
|---|---|---|
| Letters / sounds (this prompt) | `ipa-reference` + anchors + L1 inventory | sound · how · spelling · compare |
| Letter groups, digraphs, clusters (`ng`, `ou`, `ch`, `ea`) | the group's rule table: grapheme → sound(s), position/context, example words | sound(s) · when it applies · exceptions · compare |
| Syllables and word stress | syllabification/stress rule table per language, example words with stress marks | the rule · pattern examples · exceptions |
| Sound alternations, elision, fast speech | alternation rule list with before/after IPA pairs | the change · conditions · examples |
| Intonation and rhythm | pattern notation + sample sentences with contours | pattern · when used · examples |

The system-prompt rules 1, 2, 3, 4, 7, 8, 10 carry over unchanged; rules 5 and 6 and the section set are per variant.
