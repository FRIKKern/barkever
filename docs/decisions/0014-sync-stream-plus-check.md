# 0014 Sync: stream plus a manifest check

Accepted 2026-10-29. Supersedes the open question in 0011.

```
reconnect ─► listen SSE, Last-Event-ID = highest seen − margin ─► skip seen ids
          ─► 1 s quiet = caught up
every reconnect + every 10 min ─► count, then id+rev manifest ─► drop ghosts, refetch stale
writes ─► outbox ─► mutate with ifRevisionID ─► 412 ─► three-way merge
```

**Decision.** Catch up through the listen stream with a rewound cursor and a set of seen event ids. Back it with a count check and, when counts differ, an id+rev manifest diff. Both run against the server's clock only.

**Why.** Spike C: one request, full documents, 5,000 changes in 1.4 s, but a plain high-water-mark cursor lost 30–36 of 300 in-flight writes every run. Spike D: pull queries miss every delete and lose long transactions, but the count + diff repairs everything at 12k docs in about 750 ms. Together they cover each other's holes. The combination is not yet tested end to end; J10 tests it in P3.

**Instead of.** Stream only, or pull only.

**Upstream.** Barkpark needs a commit-ordered document event feed with delete records and a "replay complete" marker. Then the margin, seen-set and manifest check become a rare safety net.
