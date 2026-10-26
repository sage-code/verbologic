# Dictionary completion plan

## What the survey found

The dictionary is not as thin as the sidebar suggests — it is **mis-wired**.

`media/dictionary/CH01/CH01T01/` holds 77 manifests, all with 9 locales and 9
audio files. The sidebar lists 4 of them. The other 73 have been orphaned since
`47292ade` ("Use LT/ST chapter prefixes and globally unique item codes"), which
re-keyed the sidebar and dropped them.

Of those 73:

| Kind | Count | What they are |
|---|---:|---|
| Real vocabulary | 49 | apple, book, city, family, house, ocean, window… |
| Phonics patterns | 24 | `-stle`, `ch`, `-ough`, `kn-`, `th` — `tags: ["alphabet#*"]` |

Of the 49 real words, **25 already exist elsewhere** in the dictionary under a
different code (book→CH01T08/W135, cat→CH02T06/W221, house→CH02T04/W200…).
Only **24 are genuinely new**.

The 24 phonics patterns are not dictionary vocabulary at all — they are the
alphabet material that now lives in `src/data/alphabets/*.json` and renders as
lecture articles. They should not be re-attached.

## Work

### 1. Re-attach the 24 genuinely new words

Distribute by meaning, not by their old CH01T01 home:

| Topic | Words |
|---|---|
| CH02T05 Food & ingredients | apple (măr) |
| CH04T01 Town places & buildings | city (oraș), zoo (grădină zoologică) |
| CH08T01 Landscapes & landforms | ocean (ocean) |
| CH08T02 Wild animals & plants | rose (trandafir) |
| CH09T02 Jobs & applications | job (serviciu) |
| CH10T03 Scientific method | example (exemplu) |
| CH11T07 Abstract ideas & philosophy | myth (mit), vision (viziune), idea-adjacent |
| CH12T05 Nuanced synonyms | luxury (lux) |
| CH01T04 Simple questions | about (despre), around (în jur) |
| CH01T01 Greetings | — (stays 4 + new words below) |

Words that fit no existing topic go to the new chapter.

### 2. Fill the three thin topics to 5+

| Topic | Now | Add |
|---|---:|---|
| CH01T01 Greetings & farewells | 4 | good night, see you, welcome, please-come-in |
| CH01T02 Courtesy formulas | 4 | excuse me, congratulations, good luck, cheers |
| CH01T04 Simple questions | 2 | maybe, of course, true, false, what, where, when, because |

The user named the CH01T04 set explicitly: *maybe, of course, true, false, what,
where, when, because*.

### 3. New chapter: Civilization & History

Placed after CH12 as **CH13**, so no existing code shifts.

| Topic | Sample vocabulary |
|---|---|
| CH13T01 Architecture | castel, biserică, turn, zid, pod, coloană, arhitect |
| CH13T02 Medieval Times | cavaler, rege, regină, război, sabie, scut, cetate |
| CH13T03 Ancient Times | imperiu, împărat, templu, filozof, amfiteatru, papirus |
| CH13T04 Modern History | revoluție, republică, constituție, independență |
| CH13T05 Traditions & Folklore | legendă, obicei, sărbătoare, port popular, colind |

`castel` is the word the user could not find — it goes in CH13T01.

### 4. Translate and voice the new words

Only the genuinely new manifests need work:

- `generate-audio.py --translate` fills the 8 non-target locales
- `generate-audio.py --audio` produces the 9 sound clips
- `media manifest` records bytes/sha1, `media upload --apply` pushes to R2

The 24 re-attached words already have all 9 locales and all 9 recordings — they
need no translation and no audio.

## Order

1. Re-attach the 24 (sidebar edit only — no content work)
2. Scaffold the thin-topic additions and the new chapter
3. Translate → audio → manifest → upload
4. `media-index`, `validate-data`, build, deploy

## Invariants

- **No existing code changes.** New words take codes above the current maximum
  (`W906`), so nothing is re-keyed.
- **No duplicate terms.** Every new word is checked against the Romanian term of
  every existing manifest before it is added.
- **The 24 phonics patterns stay orphaned.** They are alphabet material; the
  lecture track already owns it.
