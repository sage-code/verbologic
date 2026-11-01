# LT01 for English (target `en`), helped by the other 8 languages

Date: 2026-11-01 (revised after review). Goal: every LT01 topic complete for English as the target, each page written natively in all 9 languages (en es it fr de ru hu pt ro), never translated. One task at a time; build + deploy + review between tasks.

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

**Task 0. Generator for T03 to T06 in 9 locales.** Add `--locales a,b|all`, strict `(word) /ipa/` closed list, rejection loop, check script. Preview three locales only. *Review: preview.*

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

- Accent: General American (as T02). Hungarian/Russian audio may need `ttsText` retries. The generator rejects about 20% of first drafts.
- Dev server on :3123 locks `content/`: ask before I restart anything. Your uncommitted `generate-audio.py`, L012 and W1096 edits are left alone.
- Order: Task 1 and 2 first because later topics reference the final T02 groups; 3 is the big batch and can run in parallel with writing seeds for 4 to 7.
