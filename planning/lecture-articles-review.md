# Lecture articles: review, criteria and full list

Date: 2026-10-30. Scope: `content/lectures/`, the lectures sidebar, `scripts/seeds/lectures-LT01-ro.json`.

## 1. Criteria

A lecture article exists only when the thing needs **explaining**. The Dictionary already holds words; a lecture never repeats one.

| Needs an article | Does not (Dictionary or a plain table row) |
| --- | --- |
| Sounds, letters, spelling-to-sound rules, stress, intonation | A noun, adjective, colour, day, number word, food, object |
| Grammar: verbs (conjugation, tense, mood, aspect), pronouns, articles, gender, plural, cases, prepositions, numerals, time, adverbs, negation, word order, clauses | A single verb with no conjugation point to make |
| Expressions and phrases whose meaning, register or use is not obvious: formulas of courtesy, idioms, proverbs, fillers, false friends | A greeting that is just a translation (`hello`, `goodbye`) |
| Cultural usage a learner would get wrong (T/V choice, name days, tipping, address formats) | A list of sentences with no point to make |

Tests for one article:

1. Its title names a **rule, concept, pattern or fixed expression**, not one ordinary word.
2. A learner could not get the answer from the Dictionary entry.
3. It is not a near-copy of another article (two articles on one rule are merged).
4. Everything it states is true for its `target` language (and the quoted word, IPA and gloss agree).

### Common title, different content

Lectures are `directional` (see `manual/curriculum.md`): one topic and one title for every language, each article carries `targets: [xx]`. Each plan line below has a scope:

- **[all]**: every language gets its own article under the same title (the content differs, e.g. "Past tense: forming it").
- **[xx yy]**: only those languages, because the feature exists only there (e.g. vowel harmony `[hu]`, noun cases `[ro de ru hu]`).
- Languages: `en es it fr de ru hu pt ro`. Romance = `es it fr pt ro`.

Verbs deserve explanation: each high-frequency verb gets one conjugation article per language (LT04, LT06).

## 2. Audit of what exists (before this change)

| Topic | Items | Verdict |
| --- | --- | --- |
| LT01T01 Alphabet & letters | 316 articles, 9 languages | **Keep** (a letter is a sound-symbol concept). Defects below. |
| LT01T02 Letter groups & sounds | 47 (ro 23, en 24) | **Keep.** Extend to the other seven languages. |
| LT01T03 Syllables & word stress | 20 (ro) | **Keep.** |
| LT01T04 Sound changes & spelling | 18 (ro) | **Keep 15, remove 3.** |
| LT01T05 Elision, hyphenation & fast speech | 18 (ro) | **Keep 12, remove 6, merge 7 later.** |
| LT01T06 Intonation, rhythm & punctuation | 18 (ro) | **Keep.** Move L697 to LT03T03 when it exists. |
| LT02T01 to T06 | 30 + 63 + 36 + 36 + 35 + 40 table rows | **Keep as practice tables.** They are sentences, not articles; attach the concept articles in section 4. |
| LT02T07 "School and Office" | 75 rows | **Removed.** All 75 are the same imperatives that LT02T05 and T06 already hold (checked by Romanian text: 75 of 75 match). |
| LT03T01 Greetings | 20 rows + 3 articles | **Remove the 3 articles** (`hello`, `good evening`, `goodbye`: one word each, text is a template `Using {{term}}`). Rows stay. |
| LT03T02 to LT12T06 | 0 items | Empty; planned in section 4. |

### Removed in this change (12 article files, 9 sidebar items, 9 seed rows)

| Item | Why |
| --- | --- |
| LT01T04 **L662** Voiceless consonants at word ends | **False.** Romanian does not devoice final consonants (`pod` is `/pod/`, not `/pot/`; `brad`, `bob` likewise). That is German and Russian. The article taught an error. |
| LT01T04 L655 How T becomes Ț in plurals | Duplicate of L654 (same rule, same example `băieți`). |
| LT01T04 L663 Pronouncing *ce* | One question word; its tone is covered by LT01T06 L685. |
| LT01T05 L668 Saying *n-am* | Duplicate of L667 (*n-a*): same rule. |
| LT01T05 L676 *mulțumesc*, L677 *bună dimineața*, L678 *hai / să*, L680 *mă duc*, L681 *nu mai* | A single word or phrase each. The rule they illustrate is covered by L679 (unstressed words) and L682 (weak forms). |
| LT03T01 L294 / L295 / L296 | One-word greetings; template text only. |

Not done on purpose: nothing under `media/` was touched (it has uncommitted work), no database rows were pruned, no static data regenerated. Follow-ups are in section 5.

### Defects found that this change does not fix

1. **Romanian letter articles state wrong glosses.** In `src/data/alphabets/ro.json` the `example`, `exampleIpa` and `exampleTranslation` of nearly every letter come from different words, and the articles inherit them: *înger* "means to understand", *joc* "down or below", *luna* "wolf", *mare* "mother", *nor* "night", *școală* "six", *tren* "father", *urs* "one", *zi* "zebra", *quasar* "quickstep", *xilofon* "exam", *băiat* "good", *inimă* "ring", *ăsta* "apple", *pâine*/`pəˈmɨnt`. Affected: L001 to L030 (about 24 of 30) and L341. Also LT01T02: L032 (*oameni* = night), L050 (*ceai* = request), L052 (*chelner* = key). Fix the JSON rows by hand, then regenerate with `./run.sh create lecture LT01T01 --target ro --overwrite`.
2. **English L579 to L626 have duplicate titles** (four articles called "A", three "C", three "G", four "S", three "T", four "X", three "Y", three "ch", three "-ough") and a one-line summary ("Letter name: A. Example: cat."). They are sound variants, so keep them, but retitle ("A as in *cat*", "C as in *city*"). The digraph and silent-letter ones (L596, L603 to L626) belong in LT01T02, not LT01T01.
3. **LT01T05 clitic articles L669 to L675** (*mi-e*, *ți-e*, *i-a*, *ce-ai*, *nu-l*, *dintr-o*, *într-o*) are seven articles for two rules. Replace with "Clitic + verb contractions" and "Preposition + *o*" (see 4.1).
4. **LT01T06 L697** (*vă rog*) is a courtesy expression, not intonation. Move to LT03T03.
5. `./run.sh validate` already failed with 155 errors before this change (LT01T05 manifests without `target`, manifest names differing from content `terms`); it now reports 97, none new. These come from the uncommitted manifest work.

## 3. Structure changes proposed (not applied)

The topics below need a renumber plus nine-language names, manifests and title audio, so they wait for a decision.

| Change | Why |
| --- | --- |
| LT06: rename T01 to T03 to concept names: "Present tense: stems & endings", "Conjugation classes", "Stem changes & irregular stems" | "first / second & third / fourth group" is Romanian-specific (Spanish has 3 classes, German weak/strong, Hungarian definite/indefinite, English one). |
| LT06: add **Modal verbs & auxiliaries** (A2) after T04 | *can, must, want, may* are core grammar and are in no topic. |
| LT07: split T05 into **Numbers & counting** and **Time, dates & telling time** (A2) | The user's list names Time explicitly; one topic cannot hold both. |
| LT12: add **Word formation: prefixes, suffixes & compounds** (B2) | No topic covers derivation or compounds. |
| LT04 to LT08, LT10, LT12 topics: set `layout: article`, `mode: directional` | They are explained per language; this is what validate requires for articles. |
| LT09 and LT11: keep `table`; articles attach only to the rows that need one | Phrases are reversible content. |

## 4. The lecture list

Counts are targets per language, not per topic. `*` = exists today.

### LT01 Sounds & Pronunciation (A1 to A2)

**T01 Alphabet & letters** [all]: one article per letter or letter-sound. Targets: ro 31*, en 26* + 48 sound variants and digraphs*, de 30*, ru 33*, it 26*, es 27*, fr 26*, hu 43*, pt 26*. Fix section 2 defects first.

**T02 Letter groups & sounds** [all]
- ro* 23: diphthongs and triphthongs (*ea, oa, ia, ie, io, iu, ua, ue, ai, ei, oi, ui, au, eu, eai, iai, eau, iau, ioa*), *ch, g, gh, k* values.
- en* 24: vowel pairs, r-controlled vowels, consonant blends.
- es: diphthongs and hiatus, *ll, ch, qu, gu/güe*, *rr*. it: *gn, gl, sc, ch/gh*, double consonants. fr: nasal vowels, *ou, oi, eau, gn, ill*, silent endings. de: *ch, sch, ei/ie/eu/äu*, umlauts, *sp/st*. ru: hard and soft consonant pairs, *ь ъ*, *ё*. hu: digraphs *cs dz dzs gy ly ny sz ty zs*, long and short vowels. pt: nasal vowels, *lh nh*, *ão õe*.

**T03 Syllables & word stress** [all]: what a syllable is (open/closed), where stress falls, stress that moves with endings, short unstressed words.
- ro* 20; es: written accent (*tilde*) rules; it, pt: stress and accent marks; fr: fixed final stress, no word stress; de: stressed prefixes; ru: free, moving stress and vowel reduction (*akanye*); hu: fixed first-syllable stress; en: stress and weak vowels (schwa).

**T04 Sound changes & spelling patterns** [all]
- ro* 15 (soft/hard *c g*, *che chi ghe ghi*, *ș ț*, *t→ț*, *c→ci*, *o→oa*, *î/â*, *h*, *x*, *s*).
- [hu] vowel harmony; [ru] final devoicing and assimilation of voicing; [de] final devoicing (*Auslautverhärtung*); [fr] liaison and enchaînement; [es it pt] the spelling changes *c/qu, g/gu, z/c*; [en] silent letters and irregular spellings*.

**T05 Elision, hyphenation & fast speech** [all]
- ro* 12 (hyphenation, *n-a*, *mi-e*, unstressed words, weak forms). Add: "Clitic + verb contractions" (*mi-e, ți-e, i-a, ce-ai, nu-l*) replacing L669 to L673; "Preposition + *o*" (*dintr-o, într-o*) replacing L674/L675.
- [fr] the mute *e* and elision (*l', j', qu'*); [it] elision and truncation (*un po'*, *l'amico*); [es pt] contractions *del/al, no/na/pelo*; [en] contractions and weak forms (*gonna, I'm*); [de] contractions *zum, im, ans*; [ru hu] fast speech reductions.

**T06 Intonation, rhythm & punctuation** [all]
- ro* 18. Move L697 out. Add per language: question intonation vs inversion, list intonation, quotation and dialogue punctuation (*« »*, *„ "*, dashes, the Spanish inverted *¿ ¡*).

### LT02 First Sentences & Questions (A1 to A2): tables plus concept articles

**T01 Everyday statements** [all]: "The basic sentence: subject, verb, complement"; "Dropping the subject pronoun" [ro es it pt hu ru]; "Describing with *to be* and adjectives".

**T02 to T04 Questions & answers** [all]: "Yes/no questions: tone, inversion, *do*-support, particle (*est-ce que*, *ли*, *-e*, *oare*)"; "Question words (who, what, where, when, why, how)"; "Short answers and *yes/no* particles" (*da/nu, sí, si, doch*); "Negative questions and how to answer them"; "Asking politely".

**T05 and T06 Everyday commands** [all]: "The imperative: *you* singular and plural"; "Polite imperative"; "Negative imperative (prohibitions)" [es: subjunctive, ro: *nu* + infinitive, it: *non* + infinitive]; "Softening an order (*please*, *let's*)".

### LT03 Greetings, Courtesy & Social Expressions (A1 to A2): table plus nuance articles

**T01 Greetings & farewells** [all]: "Greetings by time of day and when each starts"; "*How are you?*: a ritual or a question"; "From casual to formal farewells"; "Names, handshakes and kisses".
**T02 Introductions & identity** [all]: "Saying your name (reflexive *mă numesc*, *me llamo*, *je m'appelle*)"; "Origin and nationality: noun vs adjective, capital letters"; "Titles and forms of address (*domnul, Herr, señor, господин*)".
**T03 Requests, thanks & apologies** [all]: "Thank you and the reply"; "*Excuse me* vs *sorry*"; "Polite requests: *could you / would you*"; "Refusing politely"; L697 (*vă rog*) [ro].
**T04 Family, friends & social visits** [all]: "Kinship words and how you address relatives"; "Visiting a home: hosts, gifts, shoes"; "Toasts and table courtesy".
**T05 Wishes, congratulations & holidays** [all]: "Wishes by occasion"; "Name days vs birthdays" [ro hu ru es it]; "Holiday formulas of the country".
**T06 Small talk, invitations & etiquette** [all]: "Small talk: safe and unsafe topics"; "Inviting, accepting and declining"; "Directness and formality".

### LT04 Pronouns & Core Verbs (A1 to A2)

**T01 Subject pronouns & *to be*** [all]
- Subject pronouns (and their omission); *to be*: present conjugation.
- [es pt] *ser* vs *estar*; [it] *essere* vs *stare*; [ru hu] no *to be* in the present; [ro] *a fi*.

**T02 Having & needing** [all]: *to have*: conjugation; "Needing and having to: *must*, *need to*"; [ru hu] possession without *have* (*у меня есть*, *van + -nak*).

**T03 Existence & possession** [all]: "There is / there are" (*hay, c'è, il y a, es gibt, есть, van, há, există*); "Showing possession: *'s, de, genitive, dative*".

**T04 Reflexive pronouns & routine verbs** [ro es it fr pt de ru; en hu short note]: "How reflexive verbs work"; "Reciprocal: *each other*"; "Reflexive vs non-reflexive meaning".

**T05 Object pronouns** [all]: "Direct object pronouns"; "Indirect object pronouns"; "Placement and combinations" [ro es it fr pt]; "Stressed (disjunctive) pronouns" [ro es it fr pt]; "Pronoun cases" [en de ru hu].

**T06 Polite pronouns & register** [all]: "*You* in the language: formal vs informal" (en: no distinction and how politeness is built; es *usted*; it *Lei*; fr *vous*; de *Sie*; ru *вы*; hu *ön / maga*; pt *você / o senhor*; ro *dumneavoastră*); "When to switch from formal to informal".

### LT05 Nouns, Articles & Modifiers (A1 to A2)

**T01 Noun gender** [ro es it fr pt de ru]: "Masculine, feminine and (de ru ro) neuter"; "Gender from the ending"; "Animate vs inanimate" [ru]; [en hu] short article "No grammatical gender".
**T02 Singular & plural** [all]: "Regular plurals"; "Irregular plurals"; "Plural after numbers" [ru hu ro]; "Uncountable nouns".
**T03 Articles** [en es it fr pt de ro hu]: "Indefinite and definite article"; [ro] enclitic definite article; [fr it] partitive article; [ru] "A language without articles".
**T04 Adjectives & agreement** [all]: "Position of the adjective"; "Agreement in gender, number and case"; "Adjectives that do not change" [en hu].
**T05 Demonstratives, possessives & quantifiers** [all]: "*This* and *that* (two or three degrees)"; "Possessive adjectives"; "*Much, many, some, any*".
**T06 Comparison** [all]: "Comparative and superlative"; "Irregular comparatives"; "*As ... as*"; "Comparing adverbs".

### LT06 Present Tense & Everyday Actions (A1 to A2)

**T01 to T03 Regular verbs** [all]: "Stem and endings in the present"; one article per conjugation class of the language (ro: 4 groups; es it pt: *-ar -er -ir*; fr: *-er -ir -re*; de: weak and strong; ru: first and second conjugation; hu: definite and indefinite; en: *-s* and spelling); "Stem changes" [es it fr de ru hu ro].
**T04 Irregular & high-frequency verbs** [all], one conjugation article each: *to go, to do/make, to say, to come, to take, to give, to see, to know, to want, to be able to* (present tense).
**New: Modal verbs & auxiliaries** [all]: "*Can, must, want, may*"; "Auxiliary verbs"; [de] modal verbs and verb position.
**T05 Adverbs** [all]: "Forming adverbs (*-ly, -mente, -ment, -weise*)"; "Where the adverb goes"; "Frequency adverbs".
**T06 Negation, intensifiers & word order** [all]: "Negation and double negation"; "Word order" (SVO; [de] verb second; [ru] free order; [hu] topic and focus); "*Very, so, too*"; [ro] *mai, și, tot*.

### LT07 Cases, Prepositions & Numbers (A1 to B1)

**T01 Prepositions of place & direction** [all]: "Where vs where to (*in/into*)"; "*In, on, at*"; [de ru] case after the preposition; [hu] suffixes that replace prepositions.
**T02 Prepositions of time, cause & instrument** [all]: "*At, on, in* for time"; "Because of / thanks to"; "*With* and *by*".
**T03 Direct objects & the accusative** [ro es] the marked object (*pe*, personal *a*); [de ru hu] the accusative case; [en it fr pt] "Direct object: no marking".
**T04 Genitive & dative** [ro de ru hu] the cases; [en es it fr pt] possession and recipient with prepositions.
**T05 Numbers & counting** [all]: "Cardinals"; "Ordinals"; "Numbers with nouns"; "Fractions, percentages, decimals".
**New: Time, dates & telling time** [all]: "Telling the time (12h/24h, *half past*)"; "Days, months and dates"; "Parts of the day and duration".
**T06 Vocative & direct address** [ro ru hu es]: "The vocative"; [all] "Calling people: names, titles".

### LT08 Past, Future & Moods (A2 to B1)

**T01 Past: completed actions** [all]: "Auxiliary + participle" [en es it fr pt de ro]; "Choosing *have* or *be*" [it fr de]; "Participle agreement" [fr it]; "The past tense by gender and aspect" [ru]; "Past suffixes" [hu].
**T02 Imperfect** [ro es it fr pt]: "Imperfect vs perfect"; [ru] "Aspect: imperfective vs perfective"; [en] "*Used to* and past continuous"; [de] "The Präteritum".
**T03 Subjunctive** [ro es it fr pt de]: "Forming it"; "When it is required"; [en ru hu] "How the language does this".
**T04 Future** [all]: "Simple future"; "Going-to future"; "Future of probability" [ro es it fr pt]; [ru hu] "Future with aspect / with *fog*".
**T05 Conditional & polite wishes** [all]: "Forming it"; "*Would like*".
**T06 Non-finite forms** [all]: "Infinitive"; "Gerund"; "Participle"; [ro] *supin*.

### LT09 Everyday Life & Practical Conversations (A2 to B1): phrase tables, articles for patterns only

T01 Home: "Address formats and floor numbering". T02 Shopping: "Asking prices and quantities"; "Bargaining"; "Weights, measures and currency". T03 Food: "Ordering: *I would like*"; "Tipping and paying"; "Meals and menu structure". T04 Travel: "Giving directions"; "Tickets and timetables". T05 Health: "Describing symptoms (*me duele, mă doare, es tut weh*)"; "Emergency numbers and pharmacy". T06 Work: "Making appointments"; "Phone and email etiquette"; "Formal letter openings and closings". All [all], content per country.

### LT10 Complex Sentences & Connectors (B1 to B2)

T01 "*And, but, or, so*" and word order after them. T02 Relative clauses: "Relative pronouns and their cases". T03 Time clauses: "*When, while, after* and tense". T04 "Cause, purpose, result". T05 Conditionals: "Real (type 1)"; "Unreal (types 2 and 3)". T06 "Concession and contrast"; "Reported speech: tense shifts"; "Indirect questions". All [all].

### LT11 Idioms, Nuance & Culture (B1 to B2): one article per expression that needs it

T01 Idioms with basic verbs: each idiom one article, literal and real meaning [per language] (ro *a face, a da, a lua, a sta, a pune*; es *dar, tener, hacer*; it *fare, prendere*; fr *faire, avoir*; de *machen, haben*; ru *делать*; hu *tesz, vesz*; pt *dar, ficar*; en *take, get, put*).
T02 Fillers & discourse markers: "Hesitation", "Agreeing and backchannel" [per language].
T03 Feelings, opinions, certainty, doubt: "Giving an opinion"; "Certainty scale"; "Hedging"; [Romance] "Indicative or subjunctive after *I think*".
T04 Proverbs: one article per proverb, with cross-language equivalents.
T05 Diminutives: "Diminutive suffixes"; "Augmentatives"; "Affection and irony" [ro es it pt ru hu de; en fr short].
T06 Traditions & landmarks: one culture note per country.

### LT12 Advanced Expression, Style & Mastery (B2 to C2)

T01 "Passive voice"; "Impersonal constructions" (*se spune, on, man, es gibt*). T02 "Presumptive mood" [ro]; "Evidential forms"; "Pluperfect, future perfect, conditional perfect"; "Aspect". T03 "Agreeing and disagreeing"; "Structuring an argument". T04 "Formal letters and emails"; "Academic writing"; "Nominal style". T05 "False friends" (pairs per language); "Collocations (*make/do/take*)". T06 "Figures of speech"; "Rhetoric". **New T07** "Prefixes"; "Suffixes"; "Compounds". All [all].

## 5. Next steps (not done)

1. Fix `src/data/alphabets/ro.json` examples, then `./run.sh create lecture LT01T01 --target ro --overwrite` and `LT01T02`.
2. Retitle the English sound-variant articles (L579 to L626) and move the digraph ones to LT01T02.
3. `./run.sh media index` and `./run.sh media verify` to drop the removed items from `public/data/` and list their orphan manifests and audio; then `./run.sh media prune --apply` for R2. The manifests under `media/lectures/` are not mine to remove while they hold uncommitted edits.
4. `./run.sh seed import` publishes the removals (it prunes `article_docs` rows no longer in the seed).
5. Decide on the section 3 renumbering, then add topics and write articles by `./run.sh create lecture <topic>` with a seed per language.
6. Add a language-fit check to `validate-data.mjs`: an article's quoted word, IPA and gloss must come from one seed row (this would have caught defect 1).
