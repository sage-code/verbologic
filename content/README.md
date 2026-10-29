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

Lecture and story articles are one JSON file per item, every language inside:

```text
content/<lectures|stories>/<TOPIC>/<ID>.json
```

For example, `content/lectures/LT01T03/L627.json` holds the article for item
`L627` in topic `LT01T03`, in every language written so far (`locales.en`,
`locales.ro`, ...). Write these files only through `scripts/lib/articles.mjs` or
`articles.py` (2-space indent, LF, fixed key order); `./run.sh articles check`
verifies them and `./run.sh seed import` publishes them to the `article_docs`
table, which the site reads at `/learn/read?id=<TOPIC>:<ID>`. A missing
language falls back to English. See `planning/content-in-database.md`.
