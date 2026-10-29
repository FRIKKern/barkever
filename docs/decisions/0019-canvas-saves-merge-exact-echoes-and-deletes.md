# 0019 Canvas saves merge; echoes and deletes are exact

Accepted 2026-10-29. Supersedes the "One device" paragraph of 0017.

```
canvas: blocks it showed + after ─► mergeBlocks(shown, after, replica) ─► clash? keep both (local-… copy)
push:   entry.pushed = note ─► event/refetch equal to it ─► base := theirs, no merge
delete: read rows ─► [drafts.n @ my rev, n @ its rev] + force, one batch
refused batch ─► halves ─► one entry ─► backoff 2 s…5 min ─► "N not accepted" + console
```

| Rule | Why |
|---|---|
| A save sends the blocks the canvas showed; the replica merges three-way | A focused canvas holds remote text until blur; ops on stale text overwrote merges |
| Same block in two tabs keeps both | Never an overwrite |
| My own pushed content is an echo, not "theirs" | The event can beat the reply: one conflict per keystroke |
| A new clash drops an unshared copy keyed by the base rev | Catch-up R1, R2 gave `[S1]` and `[S1][S2]` |
| `links` follows the merged body | Derived field; it made fake clashes |
| Deletes name each row, with `force` | Bare id fences on the published rev; `drafts.n` drops only the draft; linked notes need `force` |

**Instead of.** Tracking which blocks the canvas adopted; matching echoes by rev only; retrying whole batches.

**Open.** One Barkpark delete for a draft and its published twin (task-12ec0224cff960fe).
