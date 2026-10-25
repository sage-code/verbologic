# Plan: IPA transliteration for TTS, and page-aware read playback

Two independent changes. Both are in the read-audio path.

---

## Part 1 — IPA transliteration before synthesis

### The problem

Article prose carries IPA inline, in two forms:

```markdown
transcribed as `/a/` … never reduces to `/ə/` … the schwa in `masă`
```

Measured across the 3,294 lecture docs: **126 distinct non-ASCII characters
inside IPA spans**, dominated by `ː` (2,907), `ˈ` (2,544), `ʃ` (2,197),
`ɪ` (1,875), `ʒ` (1,722), `ɡ` (1,619), `ə` (1,431).

Edge TTS does not fail on these — it silently mispronounces or skips them, so
the recording says something the article does not. The fix is to replace each
IPA span with a **transliteration the voice can actually read in that
language**, before the text reaches the API.

### Design

A per-language map, because the same IPA symbol needs a different respelling
per voice: `/ə/` is "uh" to an English voice, "э" to a Russian one, "ă" to a
Romanian one.

```
scripts/lib/ipa-translit.mjs
  TRANSLIT = {
    en: { 'ə': 'uh', 'ʃ': 'sh', 'ɪ': 'ih', 'ː': '', … },
    ro: { 'ə': 'ă',  'ʃ': 'ș',  'ɨ': 'î',  … },
    ru: { 'ə': 'э',  'ʃ': 'ш',  'ɨ': 'ы',  … },
    …
  }
```

Rules, applied in order:

1. **Strip the delimiters.** `/a/` → `a`, `` `masă` `` → `masă`. A backtick span
   that is a real word (no IPA-only characters) is left as the word.
2. **Map each IPA character** through the language's table. Unknown characters
   are dropped rather than passed through — a stray `ʝ` read aloud is worse
   than silence.
3. **Drop diacritics that carry no sound for TTS**: `ˈ` `ˌ` (stress), `ː`
   (length), `̯` `̃` `̩` `ʰ` `ʲ` (modifiers). Length is conveyed by the
   respelling where it matters (`iː` → "ee").
4. **Collapse** the result and trim.

The map is data, not code, so a wrong respelling is a one-line fix.

### Where it applies

`article_text()` in `scripts/generate-audio.py` — the single place prose becomes
TTS input. Both the read pass and any future pass inherit it.

The **displayed** article is untouched: the Markdown keeps its IPA, because that
is what the reader needs to see.

### Verification

- Unit-check the transliterator against a fixture of real spans from the corpus.
- Assert no IPA-only character survives into the TTS string (a regex over the
  Unicode IPA block plus the modifier letters).
- Spot-listen one English and one Russian recording.

---

## Part 2 — Play starts at the current page

### The problem

The Read button plays `read/<locale>.mp3` from `currentTime = 0`. The article is
paginated — one `##` section per page — so pressing Play on page 3 replays
pages 1 and 2 first.

### Design

Synthesize **per section**, then concatenate, recording where each section
starts.

Verified in this session:

- Edge TTS emits `SentenceBoundary` events with `offset` and `duration` in
  100-nanosecond units, so each section's exact duration is known without
  decoding the MP3.
- Raw MP3 segments concatenate into a valid stream — a two-segment test joined
  to 41,328 bytes with 611 frame syncs, and the browser reported 6.888 s
  against 3.50 + 3.36 s expected. No ffmpeg, no re-encode.

So the generator:

1. Splits the article body on `##` headings — the same rule `paginate()` uses,
   so page N is section N by construction.
2. Synthesizes each section separately, summing `SentenceBoundary` durations.
3. Writes the concatenation to `read/<locale>.mp3` (unchanged path, unchanged
   URL).
4. Records the cumulative start of each section in the manifest:

```json
"readSections": { "en": [0, 12.4, 27.9, 41.2] }
```

The player then seeks:

```ts
audio.currentTime = sections[page] ?? 0
```

### Why offsets and not one file per section

One file per section would multiply the R2 object count by four and change
every URL. Offsets keep the existing path, the existing `reads` map, and the
existing cache headers — the only new fact is a small array of numbers.

### Fallback

A recording generated before this change has no `readSections`. The player then
starts at 0, exactly as today. No migration is required; the next regeneration
adds the offsets.

### Verification

- Assert `readSections[locale].length === sectionCount` for every doc.
- Assert the offsets are strictly increasing and the last is < total duration.
- In the browser: open page 3, press Play, confirm `currentTime` jumps to the
  page-3 offset and the audio is audible from there.

---

## Order of work

1. Transliterator + its fixture test (no audio generated yet).
2. Wire it into `article_text()`.
3. Per-section synthesis + `readSections` in the manifest.
4. Player seek.
5. Regenerate the alphabet read audio (3,267 files) with both changes.
6. Upload, rebuild index, build, deploy.

Steps 1–4 are code and can be verified without generating audio. Step 5 is the
long one and runs in the background.
