# Spike D: catch-up via pull queries — safety check

```
device (offline since ts0)                 Barkpark
 │ query order=_updatedAt:asc,_id:asc, _updatedAt >= ts0-lag ─►│
 │◄── creates + edits (deleted rows are gone) ─────────────────│
 │ groq count(*[_type==T]) ───────────────────────────────────►│
 │ count differs ─► id+rev manifest ─► drop ghosts, refetch stale
 ▼ replica == server
```

| N (12k rows) | Kinds | Pull only | Pull + count + diff | Time | Requests |
|---|---|---|---|---|---|
| 0 | none | ✅ | ✅ | 86 ms | 2 |
| 10 | 5 kinds | ❌ 5 ghosts | ✅ | 724 ms | 5 |
| 100 | 8 kinds | ❌ 39 ghosts | ✅ | 728 ms | 5 |
| 1000 | 8 kinds | ❌ 360 ghosts | ✅ | 744 ms | 5 |

Evidence: `results/*.json`, `run.mjs`, `edge.mjs`, `diffcost.mjs`, `probe.mjs`.

**Edge cases.** Same-millisecond writes are distinct at µs, so the cursor stays a µs string. A client-clock cursor fails; use the server's `_updatedAt`. Keyset paging lost 0 rows under concurrent writes; offset paging lost 43. A long 300-create transaction lost 272–294 rows with no lag window; a 10 s re-read window or the diff recovers them.

**Deletes** never appear in a changes query (`query.ex` returns live rows only); the count + manifest diff catches them. Cost at 12k docs: 3 requests, 848 KB, about 750 ms.

**Barkpark fix (source first).** A document event feed, `GET /v1/data/events/:dataset?since=`, on `EventLog.replay_since/4` (which keeps delete records), with a commit-visibility cutoff. Without the cutoff it inherits spike C's loss.
