# Content and dictionary articles

Dictionary vocabulary and media are maintained in `media/dictionary/`. Each
`item.json` is the source for that example's shared identity, localized names
and descriptions, pronunciation data, and per-language audio. Audio files live
beside the manifest in that item's `sound/` directory.

An article is optional additional teaching material, not a required field for
every dictionary word. Add one when a particular example benefits from notes or
explanations that do not belong in the short dictionary description—for example,
usage, register, grammar, cultural context, or a worked example. Do not create
empty or boilerplate articles just to give every word an article button.

Dictionary and lecture articles are authored as Markdown under:

```text
content/<dictionary|lectures>/<TOPIC>/<ID>/<locale>.md
```

For example, `content/dictionary/C1T01/A031/en.md` is the English explanation
for item `A031` in topic `C1T01`. The `locale` is the language of the article
text; it is separate from the dictionary language being studied. Shared
dictionary and lecture articles can therefore be read from every registered
language dictionary. Add translated Markdown files only when those explanations
are available; otherwise the page falls back to its canonical English article.

Article front matter identifies its track, topic, item code, and locale, and
can provide a title, summary, review status, related items, and target-language
terms. See existing Markdown files in `content/dictionary/` and
`content/lectures/` for working examples and the schema in `content.config.ts`.
Article pages are prerendered during the static build only when a Markdown
document exists.

## Stories

Story records and their per-language audio manifests live under
`media/stories/<chapter>/<topic>/<ID>/item.json`; chapter and topic metadata
use `item.json` at their parent folders. Each story uses one stable topic-scoped
ID, localized title/description fields, and a separate audio slot per language.
Audio slots stay pending until recordings are added.

The story text is shared across learning-language tracks and translated by
display locale:

```text
content/stories/<TOPIC>/<ID>/<locale>.md
```

For example, `content/stories/S1T02/A001/ro.md` is the Romanian text of a
story, and is available from every language's story route. English is the
canonical source; translations should use the same story, not a separate
language-specific identity. New stories should be original retellings of
public-domain tales or newly written material. Keep the translation's title
aligned with the corresponding `names[locale]` in the media manifest.

In short: use `item.json` for the reusable dictionary example and its media;
use an optional Markdown article for substantial, example-specific teaching
notes.
