# Barkpark contracts

```
workspace barkever ─ project default ─┬─ production   real notes
                                      ├─ fixtures     50 synthetic notes (npm run seed)
                                      ├─ spike-*      spike evidence, never read by the app
                                      ├─ e2e-<stamp>-<pid>  one per e2e run (app and mac), seeded with the fixtures, dropped after a pass, kept on a failure
                                      ├─ j10-<stamp>-<pid>  one per J10 run (pnpm --filter @barkever/app j10), dropped after a pass, kept on a failure
                                      ├─ probe-history-<stamp>  20,000+ events of history, made once (~100 s) by app/e2e/history.ts, reused by reload-history.spec.ts
                                      ├─ probe-p3g-<stamp>-<pid>  fixtures, one per J04 run (j04-organize.spec.ts), dropped after a pass, kept on a failure
                                      └─ probe-p3g-5k-<date>    fixtures + 4,950 synthetic notes, made once by app/e2e/probe.ts, reused by j03-find.spec.ts
```

| File | Type | Notes |
|---|---|---|
| `note.json` | `note` | Body is `editor: "blocks"` with `wikilink`; `links[]` mirrors body wikilinks (decision 0013) |
| | | `conflicts[]` holds other versions kept after a clash (decision 0017), each naming whose version it is (`by`, decision 0021); `_key` is `<rev>~<sum of the clashing parts>`, so two devices that clash on different parts of one version keep two copies; a copy holds `tags` and `notebook` only when it clashed on them (`notebook: null` means the other side had none); Keep this adopts only the parts a copy holds |
| | | `by` is `<device>.<content sum>`: who wrote this version; a write that changes content without re-signing reads as unsigned |
| `notebook.json` | `notebook` | `parent` makes a stack |

Per-user prefs (`/w/barkever/p/default/v1/prefs/<dataset>/<key>`, value is an object):

| Key | Value |
|---|---|
| `barkever.shortcuts` | `{ "ids": ["<note or notebook id>"] }` |
| `barkever.recents` | `{ "ids": ["<note id>", …] }`, newest first, max 20 |

Writes are `PATCH {op, field: "ids", item, max?}`: `push_front` for recents, `add` / `remove` for shortcuts. Each op is idempotent, so a star queued offline (replica `meta` key `stars`) replays safely. Values written whole before PATCH also carry `"v": 1`; readers ignore it. Barkpark refuses a value over 16 KB with 422: the star is dropped and the sidebar shows what Barkpark holds.

Leftover run datasets older than 2 hours: `node --experimental-strip-types app/e2e/sweep.ts` lists them, `--yes` deletes them. It only matches `e2e-`, `j10-`, `probe-p3g-` and `probe-p3h-` followed by a 14-digit stamp. It deletes one at a time and stops at the first dataset that is not gone. A `202` means Barkpark is still deleting: every 2 s the same `DELETE` goes again with `?dataset_id=<the 202's dataset_id>` until `200` or `404`. A `503` with `dataset_delete_busy` waits its `Retry-After`. Both stay under a 10 min cap. A `409 dataset_recreated`, a `202` without a `dataset_id` and any other answer keep the dataset.

Apply: `bp -w barkever -d <dataset> schema apply --file contracts/barkpark/<file>.json --yes`
