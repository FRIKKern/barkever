# 0023 The cursor settles by time; pushes start at welcome

Accepted 2026-10-29. Supersedes 0014's id margin and push-after-catch-up.

```
frame X applied, stream open 60 s more ─► cursor := X, seen −= ids ≤ X
reload ─► listen since cursor ─► welcome ─► push now ─► replay skips seen ─► quiet ─► manifest check
push ─► 404 / 409 / 412 ─► refetch, merge, push again
```

| First save after reload | Before | After |
|---|---|---|
| 9k events: load, save, reload | 3.8 s | 0.15 s |
| 9k events, replica older than all | 4.0 s | 0.15 s |
| 20k events: load, save, reload | 7.0 s | 0.18 s |
| 20k events, replica older than all | 6.9 s | 0.12 s |

**Why.** Spike C's loss is time-shaped: ids are assigned in a transaction, sent after commit. Ids are one sequence for every tenant, so an id margin is only as safe as other tenants are slow; 100,000 replayed all history. Lower ids than X were assigned before X arrived; one committing within 60 s (twice Barkpark's statement timeout) reaches the open stream live. Pushes are fenced by `ifRevisionID`; an early patch on a note deleted elsewhere gets 404, now healed like 412.

**Limits.** A longer transaction or a dropped broadcast is repaired by the manifest check, as before. A session under 60 s keeps the older cursor, or none.

**Upstream.** A commit-ordered feed with a replay-complete marker (task-4902df19e0fd7f65) drops the window, seen-set and quiet wait.

Evidence: `cursor.test.ts`, `reload-history.spec.ts` (`probe-history-20261029`, `probe-history-9000`), `sync-safety.spec.ts`.
