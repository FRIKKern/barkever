# 0015 Local replica: idb + TanStack Query, our own outbox

Accepted 2026-10-29. Browser storage for 0011.

| 5,000 notes | E: TanStack DB | F: idb + Query | Budget |
|---|---|---|---|
| Switch note p95 | 15 ms | 20–21 ms | <100 |
| Search p95 | 86–134 ms | 33–69 ms | <150 |
| Keystroke to input p95 | 7–19 ms | 1 of 180 over 16 | <16 |
| Reload to list | 662 ms | 198–381 ms | — |
| 412 conflict handled | ❌ not built | ✅ both cases | ✅ |
| JS gzipped | 167 KB | 94 KB | — |
| Library | 19 days old, pinned | `idb` 8 | — |

**Decision.** Notes in IndexedDB via `idb`; TanStack Query reads with `networkMode: 'always'`. One outbox entry per note, same transaction as the note.

**Why.** Both pass budgets, keep offline edits. F is lighter, faster, handles conflicts. E's library is weeks old and leaves us the merge anyway.

**Take from E.** Render after local restore (else stale text for 600 ms). One tab syncs, picked with Web Locks.

**Fix in F.** A rows-only list store for cold load. The list row paints a frame after the editor.

Reports [F](../../spikes/replica-idb/REPORT.md) · [E](../../spikes/replica-tanstack-db/REPORT.md)
