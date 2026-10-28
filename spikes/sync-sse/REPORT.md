# Spike C: catch-up via listen SSE replay — main path, with a client fix

```
device                          Barkpark listen
  │ GET /listen  Last-Event-ID: C ─►│
  │◄──────── welcome ───────────────│  arrives before replay; not an end marker
  │◄─ mutation id>C, oldest first ──│  full document in each frame
  │◄─ live frames (same stream) ────│  no "replay done": wait for 1 s quiet
  │◄─ [overloaded + close] ─────────│  only if the client stops reading
```

| N | Gap | Replica correct | Time | Requests |
|---|---|---|---|---|
| online, 12 mutation kinds | none | ✅ | live | 1 |
| 10 / 100 / 1000 / 5000 | offline | ✅ | 44 ms / 87 ms / 349 ms / 1.4 s | 1 |
| 11,147 | replay from 0 | ✅ | 10 s | 1 |
| 300 + 1 | in-flight commit, resume from highest id | ❌ 30–36 lost, every run | | 2 |
| same | resume from highest − margin, skip seen ids | ✅ | | 2 |
| 3 × 100 parallel | live ids out of order, skip "≤ highest" | ❌ 196 missing | | |

Evidence: `results.jsonl`, `catchup.mjs` (`online`, `offline N`, `limit`, `shed`, `order`, `inflight`).

**The flaw.** Event ids are assigned inside the transaction but sent after commit, so a high-water-mark cursor silently skips writes still committing. The server never reports a gap, a reset or "caught up", and a future or garbage cursor gets only `welcome`.

**Client fix (tested).** Resume from a rewound cursor, keep a set of seen ids, run a periodic manifest check (`perspective=raw&fields=n`: 6,241 docs in 7 requests, 1.6 s).

**Not run.** Time-based retention beyond 6 minutes.
