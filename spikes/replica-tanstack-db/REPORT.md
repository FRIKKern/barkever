# Spike E: replica on TanStack DB + IndexedDB

```
 keystroke ─► tx.mutate(() => notes.update(id, …))                     sync, ~3 ms to frame
 ┌──────────────────────────── Chrome tab ───────────────────────────────────┐
 │ React ◄─ useLiveQuery ◄─ notes collection (every row in memory)           │
 │   list   like(text) · orderBy(title) · limit 100        ▲ preload  ▲ accept + new _rev
 │   note   eq(_id).findOne()                              │          │
 │ IndexedDB barkever-replica-e-N   notes ─────────────────┘          │
 │                                  revs {rev, mine[]} ◄──────────────┤
 │ IndexedDB offline-transactions   outbox ◄─ commit per keystroke    │
 │   reload: restore optimistic rows, keep last entry per note        │
 │           (beforeRetry), render after waitForInit()                │
 │   leader tab (Web Locks) · FIFO · backoff ──► saveNote ────────────┘
 └──────────────────────────────────────────────│────────────────────────────┘
                     POST /api/mutate  patch {title, body} ifRevisionID
                                                ▼
            server.mjs (token stays in Node) ─► Barkpark barkever/spike-replica-e
            412 ─► read theirs ─► resend on their rev (ours wins: merge3 not wired)
```

Config measured: commit every keystroke to the outbox, compact on load, wait for the outbox before the first render (`results/*-key.json`). Runs from 2026-10-29, headless Chrome on a machine shared with other agents (load average 28–38), so the numbers run high. Where three runs differed, the spread is in brackets.

| Metric | 50 notes | 5,000 notes | Budget | Pass? |
|---|---|---|---|---|
| Cold load to first list, new browser process (p50 / p95) | 630 / 814 ms (138–630) | 662 / 1,079 ms (506–780 p50) | none (Cmd-N < 1 s) | ◐ p95 > 1 s at 5k |
| First run: pull + import into empty replica | 2.4 s | 6.3 s (fetch 1.5 s, importData 3.4–4.6 s) | none | — |
| Switch note (p50 / p95, 50 switches) | 9.3 / 21.6 ms | 12.6 / 15.1 ms | < 100 ms | ✅ |
| Search first results (p50 / p95, 20 queries) | 9.5 / 31.7 ms | 62.6 / 102.9 ms (p95 86–134) | < 150 ms | ✅ (close at 5k) |
| Search while typing, per key (p95) | 8.4 ms | 104.9 ms | < 150 ms | ✅ |
| Keystroke → replica → frame (p50 / p95, 130 keys) | 2.9 / 12.0 ms | 3.7 / 19.1 ms (p95 7.4–19.1) | < 16 ms | ◐ 5k p95 over in 1 of 3 runs |
| Reload offline: edits + outbox survive | 5/5 shown at first paint, outbox 105 → 5 | 5/5, 105 → 5 | lose nothing (J10) | ✅ |
| SIGKILL right after typing | 10/10 chars kept | 10/10 kept | lose nothing | ✅ |
| Outbox replay to Barkpark | 7 entries, 392 ms, 7 calls, revs match | 7 entries, 793 ms, 7 calls, revs match | < 10 s | ✅ |
| Stale `ifRevisionID` | 412 caught, resent | 412 caught, resent | three-way merge | ❌ merge not built |
| JS heap after load / IndexedDB used | 4.8 MB / 0.1 MB | 42.6 MB / 6 MB | none | — |
| JS bundle, gzipped | 167 KB by Vite (161 by zlib): React alone 69, TanStack DB +88, offline-transactions + app +10 | same | none | — |
| Multi-tab, Electron, SSE into the collection, 10k notes | not run | not run | | |

**The other commit mode** (one offline transaction per note, committed after 400 ms idle, `results/*-idle.json`): keystroke p95 is 5.3–8.4 ms and the outbox gets one entry per burst, but a SIGKILL inside the burst kept only 4 of 10 chars in 2 of 4 runs.

## What surprised me

- **Unsynced edits live only in the outbox.** The notes store holds Barkpark's version until `acceptMutations` (`inNotesStore: 0` in every run). The outbox is a second database, and writes across the two are not atomic.
- **Reload showed stale text.** With 105 entries, the edits appeared 355–600 ms after the first list (`results/no-waitforinit/`). Fixed by `await executor.waitForInit()`, at no measurable cost.
- **Committing every key costs Barkpark writes.** Online, each key is its own mutate. Offline without compaction, 130 entries took 130 calls and 7.9 s to replay. `beforeRetry` (keep the last entry per note) runs only on load, so a live session doesn't compact.
- **Preload is the slow part.** A raw IndexedDB `getAll` of 5k rows takes about 70 ms; `preload()` takes 300–1,000 ms. `importData` of 5k rows takes 3–5 s.
- **Controlled inputs bound straight to `useLiveQuery` kept the caret.** I expected them to jump. Typing in mid-text, fast or slow, stayed intact.
- **We still write the sync logic.** Rev chaining (`revs.mine`), coalescing, 412 handling and the merge are all ours.

## For and against

**For.** About 250 lines give a live list, search, note view, durable outbox, optimistic restore after reload, leader election and idempotency keys. Every budget is met at 5k notes.

**Against.** It is young. `@tanstack/db` is 0.15.2 after 149 releases, with 9 minor lines in six months, and the IndexedDB collection first shipped in 0.13.0 on 2026-10-10, 19 days ago. `@tanstack/offline-transactions` 1.1.4 pins `@tanstack/db` to exactly 0.15.2, so the two upgrade together. The whole store sits in memory, and TanStack adds 0.3–0.9 s to cold load at 5k. The engine pieces Barkever needs (merge, SSE ingest, batching) are still ours to write.

**Maturity risk: high.** Pin exact versions, and expect breaking API changes on every minor version.

## Files

| File | Does |
|---|---|
| `gen.mjs` | `data/notes-50.ndjson` (fixtures) + `data/notes-5000.ndjson` (seeded PRNG); ignored by git |
| `seed.mjs`, `bp.mjs` | schemas + 5,050 notes → `spike-replica-e`; the token is read in Node only |
| `server.mjs` | serves `dist/`, proxies `/api/pull`, `/api/mutate`, `/api/doc`; `/api/net?up=0` takes Barkpark down |
| `src/db.js`, `src/outbox.js`, `src/text.js` | collections, executor, `saveNote`, edit sessions |
| `src/App.jsx`, `List.jsx`, `Note.jsx`, `timing.js` | list, search, note view, in-page timing (event `timeStamp` → frame after) |
| `measure.mjs`, `lib.mjs`, `speed.mjs`, `offline.mjs` | playwright-core harness |
| `results/{50,5000}-{key,idle}.json`, `results/no-waitforinit/` | raw numbers |

Run: `npm i && node gen.mjs && node seed.mjs && npx vite build && node server.mjs & node measure.mjs 5000 key`.
