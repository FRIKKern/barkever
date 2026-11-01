# 0035 Take upstream's focus-resync fix

Accepted 2026-11-01. Barkpark bumps prosemirror-view 1.42.6 → 1.42.9.

```
focus ──► PM queues a 20 ms resync ──► (fast input starves the timer)
ArrowUp moves the DOM caret ───────────┤ selectionchange not read yet
                                       ▼
1.42.6: DOM ≠ last read ──► old caret written back     ✗ J06 nested only ~16% red
1.42.9: resync only if the caret hasn't moved          ✓ the move is kept
```

| Option | Private PM fields | Other PM editors | Each PM upgrade | nested only, local bundle |
|---|---|---|---|---|
| main 1.42.6 | | broken | | 1 red / 20 |
| A: canvas owns focus | 5 | broken | re-diff the copy | 0 / 35 |
| B1: patch 1.42.6 | 2 | fixed | re-check the patch | not run |
| **B2: 1.42.9** | **0** | **fixed** | **none** | **0 / 30** |

**Why.** All three keep the move. B2 is upstream's own fix, so nothing is copied or patched.

**Costs.** 1.42.7–1.42.9 ride along; review-24788 read the diff and checked our decorations and widgets.

**Limits.** The e2e greens used a spike-only local bundle, unthrottled. Criterion 1 of task-15fb10381c98b141 is rerun on the deployed canvas, 10x under 4x CPU and 10x without. `__focus_resync_queued_mounted` replaces the shared test, whose precondition fails on 1.42.9.

**Instead of.** [A](../../spikes/j06-focus-resync/A.md), [B1](../../spikes/j06-focus-resync/B.md). Verdict: [JUDGE.md](../../spikes/j06-focus-resync/JUDGE.md). Task: task-8ee0303670720913.
