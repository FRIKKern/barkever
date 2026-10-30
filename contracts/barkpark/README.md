# Barkpark contracts

```
workspace barkever ─ project default ─┬─ production   real notes
                                      ├─ fixtures     50 synthetic notes (npm run seed)
                                      ├─ spike-*      spike evidence, never read by the app
                                      ├─ e2e-<stamp>  one per e2e run (app and mac), seeded with the fixtures, dropped after a pass once Barkpark can
                                      ├─ j10-<stamp>  one per J10 run (pnpm --filter @barkever/app j10), dropped after a pass once Barkpark can
                                      ├─ probe-history-<stamp>  20,000+ events of history, made once (~100 s) by app/e2e/history.ts, reused by reload-history.spec.ts
                                      ├─ probe-p3g-<stamp>      fixtures, one per J04 run (j04-organize.spec.ts), left for inspection
                                      └─ probe-p3g-5k-<date>    fixtures + 4,950 synthetic notes, made once by app/e2e/probe.ts, reused by j03-find.spec.ts
```

| File | Type | Notes |
|---|---|---|
| `note.json` | `note` | Body is `editor: "blocks"` with `wikilink`; `links[]` mirrors body wikilinks (decision 0013) |
| | | `conflicts[]` holds other versions kept after a clash (decision 0017), each naming whose version it is (`by`, decision 0021); `_key` is `<rev>~<sum of the clashing parts>`, so two devices that clash on different parts of one version keep two copies; a copy holds `tags` and `notebook` only when it clashed on them |
| | | `by` is `<device>.<content sum>`: who wrote this version; a write that changes content without re-signing reads as unsigned |
| `notebook.json` | `notebook` | `parent` makes a stack |

Per-user prefs (`/w/barkever/p/default/v1/prefs/<dataset>/<key>`, value is an object):

| Key | Value |
|---|---|
| `barkever.shortcuts` | `{ "ids": ["<note or notebook id>"] }` |
| `barkever.recents` | `{ "ids": ["<note id>", …] }`, newest first, max 20 |

Writes are `PATCH {op, field: "ids", item, max?}`: `push_front` for recents, `add` / `remove` for shortcuts. Each op is idempotent, so a star queued offline (replica `meta` key `stars`) replays safely. Values written whole before PATCH also carry `"v": 1`; readers ignore it. Barkpark refuses a value over 16 KB with 422: the star is dropped and the sidebar shows what Barkpark holds.

Apply: `bp -w barkever -d <dataset> schema apply --file contracts/barkpark/<file>.json --yes`
