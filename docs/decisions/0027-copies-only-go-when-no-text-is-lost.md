# 0027 A copy goes only when no text is lost

Accepted 2026-10-29. Supersedes 0021 and 0022.

```
clash ─► add copy  _key = <rev>~<sum of clash parts>
                        │
copy goes only if ──────┼─ exact duplicate of an earlier copy
                        ├─ the main holds its text
                        ├─ the person picks Keep this (a main moved since shown stays as a copy) or Dismiss
                        └─ this device typed from every clashing text in it   (_typed: local, until the next clean sync)
lost reply? baseFor(base, sent[≤8 distinct since last ack], theirs): per part, theirs if some sent version equals it
view: one quiet line ─► lanes per writer and part, latest shown, "N earlier" folded
```

| Option | Lost / 10k seeds | Echo / 10k | Copies per note | Storm, 10 min |
|---|---|---|---|---|
| main 7b150a5 | 262 | 7 | 2.72 | 5 · 17 KB |
| A ancestry | 464 | 7 | 1.82 | 53 after 1 min |
| B never drop | 1 + 1 flaky | 7 | 3.39 | 1,138 · 1.85 MB |
| **B + 3 fixes** | **0** (0 in 100k) | **0** | 3.35 | 490 · 819 KB |

**Why.** Losses were real on main and A. Every dropped copy now has a writer who edited from its text. Review 3b keeps all six raw titles and shows the latest.

**Limits.** 490 copies in the storm (`storm.ts --forget`) sits near the floor for verbatim versions. Barkpark's size limit at 819 KB is unchecked. Chaos can't see what `baseFor` guards (a deleted block or dismissed copy coming back after a lost reply); unit tests pin it.

**Open for the owner.** Copies don't name the writer. Whole blocks light up, not words. Lane 2 wraps under lane 1. Keep this has no undo.

**Instead of.** [A ancestry](../../spikes/copy-rule-ancestry/REPORT.md), [B alone](../../spikes/copy-rule-never-drop/REPORT.md). Verdict: [JUDGE.md](../../spikes/copy-rule-judge/JUDGE.md).
