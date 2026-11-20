# 0048 Promote reads staging's head when woken for a run it does not act on

Recorded 2026-11-20. Extends [0046](0046-promote-reads-ci-itself.md) to the workflow_run path.

```
promote queue        one run waits; a newer one replaces it
ci on head H         red ──► promote for H   (replaced, never runs)
ci on old commit     any ──► promote for old ──► not staging's head
                                              └─► reads H's newest finished run ──► red: one issue, main stays
                                                                                  green: main moves once
                                                                                  none yet: nothing
```

**Decision.** This narrows the case where a red staging head leaves no "staging is red" issue. When a ci run wakes promote and that run is not one promote acts on (an older commit, a pull request, a fork, another branch, a cancelled run, no commit), promote reads staging's head the way a dispatch does and acts on the newest finished push or dispatch ci run there. A red head whose own promote run was replaced in the queue then still gets its one issue, and main stays. A head whose run is still going moves nothing; its own run wakes promote later. A failed read of staging's head, or of how main compares with the run's commit before main moves, turns the job red with one sentence on every path; it is never a quiet skip.

**Not covered.** When no later ci run finishes after the replaced one, nothing wakes promote, and the red issue waits for the next ci run or a dispatch. A cancelled run on staging's head is still a quiet skip, so a pending e2e that its concurrency group cancels leaves no issue.
