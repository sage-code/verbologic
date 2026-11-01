# LT01 for English (target `en`), helped by the other 8 languages

Date: 2026-11-01 (revised after review). Goal: every LT01 topic complete for English as the target, each page written natively in all 9 languages (en es it fr de ru hu pt ro), never translated. One task at a time; build + deploy + review between tasks.

## Status (2026-11-01)

- Task 0 done. Task 1 done (T01 = the 26 letters). Task 3 done (26 letters x 8 helper languages, audio rebuilt).
- Task 2 done: English T02 has 53 entries in teaching order (`scripts/add-lt01-english-groups.mjs`): 5 duplicates merged, 21 groups added (`wh qu ck tch dge ew ay igh ci -ture pl pr tr fr gl sl sp sn sm sw str`), all in 9 languages. `ti` was dropped (every example is a cognate in most helper languages).
- Lessons: the generator's `exampleTranslation` for hand-seeded groups was wrong for 15 of 22 (it translated other words), so seed `exampleTranslation` by hand and always run `verify-alphabet-glosses.py`. Cognate examples (nature, train, social) make the "bare foreign word" check reject pages: pick non-cognates. `scripts/converge-alphabet-pages.py` retries only failing (language, entry) pairs, one language per call. Never trim `check-alphabet-pages.py` output with sed.
- Task 4 done (2026-11-01): LT01T03 has 12 English lessons (L723 to L734) in 9 languages with read audio. English now uses the native path too (`load_native`), the prompt forbids facts beyond the teaching point and "always/never" claims, and `--check` is clean.
- Task 5 done (2026-11-01): LT01T04 has 14 English lessons (L735 to L748) in 9 languages with read audio. The 12 old silent-letter pages were replaced by 6 merged lessons; the old `alphabets/en.json` entries were removed. English pages were read and 3 factual errors fixed (double consonants are not held longer; gh and daughter; -s depends on the last sound).
- Task 6 done (2026-11-01): LT01T05 has 12 English lessons (L749 to L760) in 9 languages with read audio. English glosses now come straight from the seed (a model paraphrase turned "I have" into "I possess"); the gloss step translates contractions literally.
- Task 7 done (2026-11-01): LT01T06 has 12 English lessons (L761 to L772) in 9 languages with read audio; examples are whole phrases so the native voice shows the intonation. 84 stale read descriptors of the Romanian T05 lessons were dropped (their translated pages were retired).
- Task 8 done (2026-11-01): final checks clean, handoff in `planning/status-2026-11-01.md`. Nothing is uploaded or synced.

## Principle: one concept, one topic, one page

- **T01 Alphabet** holds only the 26 letters (L553 to L578). Each letter page already teaches all of that letter's sounds (A has four, S four ...).
- **T02 Letter groups & sounds**: sounds made by letter combinations (vowel pairs, r-vowels, blends, digraphs, `-tion`, `-ough`).
- **T03 to T06**: stress, sound/spelling rules (silent letters live in T04), fast speech, intonation.

## Audit of the 74 + 24 existing English pages (measured)

| Items | What they are | Decision |
| --- | --- | --- |
| L553 to L578 (26) | Letters A to Z | **Keep** T01. Fix the stale summary line ("Letter name: A. Example: apple.") |
| L579 to L595, L597 to L602 (23) | Second/third "sound variants" of A, C, G, S, T, X, Y | **Discard.** The letter page already teaches those sounds; 17 of 23 even use an example word that appears on it. The prose is the same generator voice. Nothing to recover but the example words, which I check against the letter page and add there if missing (name, about, ocean, go, gym, station, nature, luxury, myth) |
| L614 to L621 (9: th x2, sh, ch x3, ph, ng) | Digraphs | **Move to T02, merge**: one page per digraph (th = two sounds, ch = three), as T02 already does for `ea` (three sounds). 9 pages become 5; the text is reused as the base and regenerated in 9 locales |
| L622 to L626 (5: -tion, -eigh, -ough x3) | Letter groups | **Move to T02**: `-tion`, `eigh`, and one `ough` page (existing L626/624 text already lists four sounds). 5 become 3 |
| L596, L603 to L613 (12: silent t, kn, kn, wr, gn, mb, lk, lf, stle, gh(t), bt, sland) | Silent letters | **Move to T04** (spelling patterns), merge into about 5 pages: silent initial (kn, wr, gn), silent final (mb, bt), silent medial (t in *listen/castle*, l in *walk/half*, s in *island*), gh |
| L317 to L340 (24, T02) | Vowel pairs, r-vowels, blends | **Keep.** Their `summary` is a placeholder ("This is the letter L317 from the vowel-consonant groups") in all 24: replace with a real sentence (this is the page subtitle). Body text is sound |

Net for English: T01 74 → 26; T02 24 → about 24 + 8 moved + about 8 new; T04 gets 5 recovered; discard 23.

## Gaps to fill so the chapter is a better lecture (replace, not just move)

- **T02 additions** (digraphs the learner meets from day one): `wh`, `qu`, `ck`, `tch/dge`, `ew/ue`, `igh`, `kn` stays in T04. Consonant blends beyond bl..st (`sp, sn, sl, tr, pl, pr`, `-nd -st` endings).
- **T03 to T06** seeds (12 to 15 rows each), listed below.

## Blocker: the lecture generator writes English only

`create-lecture-articles.py` sets `locales["en"]` only (line 287). For T03 to T06 it must author all 9 locales natively from one fixed seed row (title, focus, example, ipa, gloss), as `generate-alphabet-content.py` does (facts first, pages per locale, `SPOKEN_FORM_RULES` checks). That is Task 0.

## Tasks (one per trigger)

**Task 0. Generator and audio for T03 to T06 in 9 locales. DONE 2026-11-01 (code only, no content written).**
- Generator: `--locales a,b|all`, glosses per locale (stage 1), native page per locale (stage 2), strict `(word) /ipa/` closed list, rejection loop, `--check`. Preview three locales only.
- **Audio rule, same language = one voice.** When the reader's locale equals the item's `target` (en reader of an English item, ro reader of a Romanian item), the page is read start to finish in that one voice: no switch to a "native" voice for the `(word)` examples. The brackets and the IPA are dropped from the spoken text (IPA is still shown on screen and never read) and the page goes through the plain single-voice path of `generate-audio.py` (`mixed_target` returns None when `locale == target`). Voice switching stays only for a reader of another language. Applies to the English-target pages in `en` and, retroactively, to the ro pages in `ro` and the alphabet pages (re-read audio of those items is rebuilt once).
- *Review: preview text in three locales, and one same-language MP3 against one cross-language MP3.*

**Task 1. T01 cleanup.** Delete L579 to L595, L597 to L602 (articles, `media/lectures` manifests, sidebar items); add the missing example words to the letter pages if the sound is not covered; replace the 26 letter summaries with real ones. Move the T02/T04 candidates untouched into a staging list (`planning/`), nothing deleted that is still needed. `media index`, `validate`, `articles check`, build. *Review: T01 shows exactly 26 English letters.*

**Task 2. T02 for English: move, merge, add.** Move the 14 digraph/group items, merge to about 8 pages, add the new groups, fix the 24 summaries, regenerate in 9 locales (this folds in the old "T01 in 8 languages" job for the group pages), audio, meaning check. *Review: T02 list and a digraph page in 3 locales.*

**Task 3. T01 letters in the 8 helper languages.** 26 letters x 8 locales = 208 pages (was 592 before the cleanup). `generate-alphabet-content.py --lang en --locales es,it,fr,de,ru,hu,pt,ro`, `check-alphabet-pages.py` retry loop, `alphabet-to-articles.mjs --target en --locales all`, `verify-alphabet-glosses.py --lang en`, audio. *Review: letter A in each locale.*

**Task 4. T03 Syllables & stress.** Syllable and vowel, open/closed, noun vs verb stress (*record*), stress shifts (*photograph/photography*), compounds, schwa, weak function words, syllabic consonants (*bottle*). 9 locales.

**Task 5. T04 Sound changes & spelling.** Recovered silent-letter pages (about 5) plus magic *e*, doubled consonants, *-ed* (three sounds), *-s/-es* (three sounds), soft/hard *c g*, flapping *t*, homophones. 9 locales.

**Task 6. T05 Contractions & fast speech.** *I'm, don't, won't*, *'s/'d*, *gonna, wanna, gotta*, weak forms (*to, and, of, can*), linking, *h*-dropping, *would you → wouldja*. 9 locales.

**Task 7. T06 Intonation, rhythm & punctuation.** Stress-timed rhythm, falling statements, rising yes/no, wh-questions, lists, tag questions, focus stress, quotes and commas, dialogue punctuation. 9 locales.

**Task 8. Final pass.** `./run.sh missing`, `validate`, `articles check`, stale-audio list, handoff note, update `lecture-articles-review.md` section 5. `seed import`, `sync` and `media upload --apply` only on your word.

## Routine at the end of each task

Preview sample → `--apply` → checks → audio for changed items only → `media manifest`, `media index`, `validate` → `./run.sh build` → you review and deploy.

## Notes

- Audio: same-language pages are read in one voice (Task 0); only a reader of another language hears the voice switch for the examples.
- Accent: General American (as T02). Hungarian/Russian audio may need `ttsText` retries. The generator rejects about 20% of first drafts.
- Dev server on :3123 locks `content/`: ask before I restart anything. Your uncommitted `generate-audio.py`, L012 and W1096 edits are left alone.
- Order: Task 1 and 2 first because later topics reference the final T02 groups; 3 is the big batch and can run in parallel with writing seeds for 4 to 7.
