# Dictionary expansion plan

Follows `plan/dictionary-completion.md`, which is already done (CH13 exists,
the orphaned CH01T01 words are re-attached).

## Baseline (measured on `media/dictionary`)

- 13 chapters (CH01–CH13), 86 topics.
- 859 real `word` items, plus 73 `phonics-example`, 83 `topic-title` and 12
  `chapter-title` items (not vocabulary; left alone).
- Highest code: `W958`.
- **37 Romanian terms are held by two or more word codes** (e.g. *soare* ×2,
  *prieten* ×2, *coleg* ×3). This breaks the no-duplicates rule, so it is part
  of this work.
- Thinnest topics: CH13T01 (4 words), CH13T03 (6), CH05T05 (6), CH05T07 (6),
  CH04T05 (7), CH13T05 (7).
- CH12T01 "Idioms & fixed expressions" and CH12T02 "Proverbs & sayings" hold
  expressions, which the house rule excludes. They are **not** changed here (see
  open items).

## Target

- **15 chapters**: add CH14 and CH15 (the user's full ask).
- Each new topic holds about 12 words; every topic under 10 real words is
  filled to 10 or more.

## New chapters

| Code | English name | Topics |
|---|---|---|
| CH14 | Arts & Literature | Painting & sculpture · Literature & writing · Theatre & cinema · Photography & design · Crafts & handmade art · Hobbies & leisure |
| CH15 | Transport & Vehicles | Cars & driving · Roads & traffic · Trains & railways · Ships & sea travel · Aviation & flight · Vehicle parts & maintenance |

No topic overlaps an existing one (checked against the 86 topic titles).
CH06T06 "Arts & music" covers music, so CH14 leaves music out.

## Steps

1. **Remove duplicates.** For each duplicated Romanian term, keep the copy
   with the lowest code and delete the others: the item folder, and its code
   in the sidebar topic's `items`. Logged to the scratchpad.
2. **Create the two chapters and their topics** from
   `seed/dictionary-expansion.json`, with `ro` and `en` names only.
3. **Add words**: 72 new words in CH14 and CH15, plus fills for the thin
   topics. Each word gets `ro` and `en` names and a hand-transcribed Romanian
   `ipa`. Duplicates are rejected against every Romanian term already present.
4. **Translate** with the translator tool, which fills the blank names and
   descriptions for every locale:
   `.venv/Scripts/python.exe scripts/generate-audio.py --translate --track dictionary --chapter CH14 --apply`
   (and CH15, and the filled topics).
5. **IPA** for the non-Romanian locales with
   `scripts/generate-ipa.py --track dictionary --chapter <code> --apply`.
   Romanian IPA is already hand-written in step 3.
6. **Check**: `./run.sh validate`, then `./run.sh media index`. No `sound`
   files are created, so the manifests are left as "audio coming soon".

## Not in this pass (by request)

- Audio: `generate-audio.py --audio`, `media manifest`, `media upload`.
- Commit or push.

## Open items

- The expression topics in CH12T01 and CH12T02 conflict with the no-expressions
  rule. They need a decision: remove them, or convert them into word topics.
- Any word removed in step 1 may already be on R2 under its `sound/*.mp3`.
  `./run.sh media prune` clears those objects once the user approves.

## Invariants

- Codes only grow: new words take codes above `W958`, so none shift.
- No duplicate Romanian term, checked before each insert and once more after
  step 1.
- Existing non-empty translations are never overwritten (the translator's own
  rule).
