# Spike F: replica as idb + TanStack Query + outbox — passes every budget

```
 keystroke
    │ sync, same task
    ▼
 Editor useState ──► input repaints (p95 ≤ 3 ms to commit)
    │
    ▼ edit()
 Query cache ['note',id] ──setTimeout 0──► list row ['rows'] (p95 ≤ 17 ms to commit)
 search entry (one lowercased string per note)
    │ async, per-doc serial chain
    ▼
 IndexedDB (idb) ── one tx: notes.put + outbox.get/put (coalesced, one entry per doc, v++)
    notes · notebooks · outbox · meta
    │ Sync (manual)
    ▼
 outbox by `first` ─► 25 per mutate ─► /bp/mutate (Node proxy, token stays in Node)
    200 ─► ackEdit: store rev, delete entry unless v moved
    412 ─► resend one by one ─► 412 ─► read theirs ─► field they left alone: ours, new rev, resend
                                                      field they changed: kept aside, shown, not sent
```

Chrome 156 headless (`playwright-core` 1.64.1), production build, three speed runs per size. Cells give the range over the three runs. The machine had a load average of 20–38 on 10 cores the whole time (rival spike E and other agents), so tails are noisy.

| Metric | 50 notes | 5,000 notes | Budget | Pass? |
|---|---|---|---|---|
| Cold load to first list, first visit (seed + read) | 336–487 ms | 1.97–3.94 s | none | — |
| Cold load to first list, reload | 87–172 ms | 198–381 ms | none | — |
| Cold load to first list, browser restart | 142–429 ms | 471–689 ms | none | — |
| Switch note, first open (IndexedDB read) to paint, p50 / p95 | 7–13 / 19–25 ms | 10–14 / 20–21 ms | < 100 ms | ✅ |
| Switch note, already opened, p50 / p95 | 3–5 / 13–17 ms | 2–3 / 16–19 ms | < 100 ms | ✅ |
| Search first results to paint, p50 / p95 (20 queries) | 4–7 / 14–18 ms | 9–13 / 33–69 ms | < 150 ms | ✅ |
| Keystroke → input state committed, p95 | 0.7–0.8 ms | 1.5–3.1 ms | < 16 ms | ✅ |
| Keystroke → next paint (Event Timing, keydown), over 16 ms | 0 of 180 | 1 of 180 (24 ms) | < 16 ms | ✅ |
| Keystroke → list row (Query cache) painted, p95 | 27–33 ms | 29–32 ms | < 16 ms | ◐ one frame late |
| Keystroke → on disk (IndexedDB tx done), p50 / p95 | 9–15 / 21–39 ms | 9–16 / 26–47 ms | none | — |
| First keystroke on a fresh page (title or search box) | 48–72 ms | not run | < 16 ms | ✗ browser, see below |
| Offline edits survive reload (Barkpark unreachable) | ✅ 3/3 + outbox 3 | ✅ 3/3 + outbox 3 | | ✅ |
| Offline edits survive browser restart | ✅ 3/3 + outbox 3 | ✅ 3/3 + outbox 3 | | ✅ |
| Replay 3 offline edits → on server, outbox 0 | 91 ms, 1 request | 239 ms, 1 request | < 10 s | ✅ |
| Replay a big outbox | 50 edits 0.56 s, 2 requests | 500 edits 5.8 s, 20 requests | < 10 s | ✅ |
| 412, they changed another field | rebased, both kept | not run | | ✅ |
| 412, both changed the title | kept aside, shown, not sent | not run | | ✅ |
| First upload of the seeded replica | 57 docs 0.54 s | 5,007 docs 32.9 s, 51 requests | none | — |
| JS bundle gzipped (React, Query, Virtual, idb, inlined fixtures) | 94.2 KB | 94.2 KB | none | — |
| JS heap after load / IndexedDB usage | 3.7 MB / 0.1 MB | 9 MB / 6 MB | none | — |

Evidence: `results/speed-<n>-{a,b,c}.json`, `results/durability-<n>.json`, `results/first-key.json`.

## Surprises

- **Query's notify is `setTimeout(0)`.** An input bound straight to query data would reset its caret on every key. The editor keeps its own state and feeds the cache. Any other view of the note (the list row) paints one frame after the input.
- **Query pauses queries offline by default** (`networkMode: 'online'`), local IndexedDB reads included. Set to `'always'` from the docs before testing. The default was not tried.
- **The first keystroke after launch takes 48–72 ms to paint in either box**, even the search box, which touches no store. Handlers run in 0–2 ms. The cost is in the browser; it is gone from the second key on.
- **Cold load is all `getAll('notes')`**: every body is structured-cloned to build the list and the search strings (108–490 ms at 5,000 under load, 56–80 ms in an earlier run at load 20). A rows-only store would cut it. Not built.
- **A batch is atomic.** One stale rev refuses all 25 patches, so the replay resends them one by one.
- **Barkpark sets the pace for writes**: about 600 ms per 100-document create and 290 ms per 25-patch request. The same 3-patch replay took 91 ms against a dataset of 57 docs and 239 ms against one of 5,064.
- At 5,000 notes every query except `xyzzy` hits the 50-result cap: the filler text reuses fixture words. Timing is still a full scan. Ranking was not judged.

## Search choice

A substring scan over one lowercased `title + body` string per note. There is no index to build at boot (filling the strings takes 11–18 ms at 5,000), an edit updates it in O(1), and it matches inside words (`wire` finds `wireframes`). The cost is linear: about 5 ms p50 at 5,000. It has no fuzzy matching and no stemming. MiniSearch or FlexSearch would add both, at the price of building an index at boot.

## For and against

**For.** Every speed budget passes at 5,000 with room to spare. The storage shape and the write path are ours: one coalesced outbox entry per doc, revs on disk, a field-level rebase on 412 (not yet a text merge; Studio's merge3 would slot in). These are Studio's patterns, and the dependency weighs about 1 KB (`idb`).

**Against.** Everything is by hand. Per-doc write ordering, the ack-versus-new-edit race, batch fallback on 412, the rebase, and updating each derived view (list rows, search, outbox) inside `edit()` were all written here. Every future view (backlinks, tags, notebook tree) is one more hand-kept index. Nothing coordinates two tabs: both would replay the same outbox. The page shell is not cached for offline: "reload offline" was tested with Barkpark blocked, not with the page server down.

## Code

| Part | Files | Lines |
|---|---|---|
| Replica (store, cache, outbox, replay, search) | `src/db.ts` `src/replica.ts` `src/sync.ts` `src/search.ts` | 251 |
| UI | `src/App.tsx` `src/List.tsx` `src/NoteView.tsx` `src/main.tsx` | 137 |
| Fixtures + generator, timing hooks | `src/data.ts` `src/generate.ts` `src/metrics.ts` | 86 |
| Node proxy + schema setup | `bp.mjs` `server.mjs` `setup.mjs` | 69 |
| Measurement | `harness.mjs` `speed.mjs` `durability.mjs` `first-key.mjs` | 255 |

Run: `pnpm install && node setup.mjs && npx vite build && node speed.mjs && node durability.mjs && node first-key.mjs`.
