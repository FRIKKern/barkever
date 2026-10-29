# 0026 Milestones are project trails; journey branches are their changes

Accepted 2026-10-29. Supersedes the "one Trail per journey branch" part of 0024.

```
bp milestone P3 ──► trail #2 "P3 Web core"  ◄── node scripts/milestones.mjs (hourly, idempotent)
  criteria J01…J10    ├ barkever/n  journey branch   (entire trail link 2 --branch …)
  child tasks         ├ findings, approve            (reviewer)
                      └ comments                     (evidence per journey)
```

**Decision.** Each child of the goal task is one project trail, created intent-only. A published journey branch is linked to its milestone as a change. The script writes the body: progress bars, then a journey table (state, change, review verdict, tasks, commits on main), then every task. Done milestones close.

**Why.** One trail per branch gave a flat list with no progress. The milestone view answers "how far is P3" in one page, like GitHub milestones, and costs no extra writes per journey.

**Limits.** Barkpark repo branches cannot join until it is mirrored. A change stays open after we fast-forward main, so the table reads git. Approvals all come from the owner's login.

**Instead of.** A trail per journey (0024), or progress only in Barkpark.
