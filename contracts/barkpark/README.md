# Barkpark contracts

```
workspace barkever ─ project default ─┬─ production   real notes
                                      ├─ fixtures     50 synthetic notes (npm run seed)
                                      └─ spike-*      spike evidence, never read by the app
```

| File | Type | Notes |
|---|---|---|
| `note.json` | `note` | Body is `editor: "blocks"` with `wikilink`; `links[]` mirrors body wikilinks (decision 0013) |
| `notebook.json` | `notebook` | `parent` makes a stack |

Per-user prefs (`/w/barkever/p/default/v1/prefs/<dataset>/<key>`, value is an object):

| Key | Value |
|---|---|
| `barkever.shortcuts` | `{ "v": 1, "ids": ["<note or notebook id>"] }` |
| `barkever.recents` | `{ "v": 1, "ids": ["<note id>", …] }`, newest first, max 20 |

Apply: `bp -w barkever -d <dataset> schema apply --file contracts/barkpark/<file>.json --yes`
