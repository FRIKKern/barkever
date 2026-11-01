# J06 focus resync judge: B2 wins (task-8ee0303670720913)

Judge: review-24788. A dropped by the lead (upstream already fixes it). Field: B2 (bump prosemirror-view 1.42.6 → 1.42.9) vs B1 (postinstall patch on 1.42.6).
Report: barkever-wt/j06-focus-b/spikes/j06-focus-resync/B.md at cd168e2. PR head judged: barkpark `j06/prosemirror-view-1.42.9` a54be1e9be on origin/main 03b57020ec.

| | B2: 1.42.9 bump | B1: patch 1.42.6 |
|---|---|---|
| Fix | upstream `handlers.focus`: resync only if the DOM caret is where it was at focus | one extra condition on `lastSelectionTime` |
| Private PM fields | none | `view.input.lastFocus`, `lastSelectionTime` |
| Upkeep | none, later bumps carry it | pinned to 1.42.6, every bump re-checks the patch |
| Extra change carried | 1.42.7–1.42.9 (see below) | none |
| Red → green (my run) | yes | not rerun by me (B.md: 4/4) |

**Winner: B2.** Same behavior, no private fields, no patch to babysit. The cost is three upstream releases of change; I read every line of it and it is covered.

## What I ran myself

| Check | Result |
|---|---|
| npm tarballs 1.42.6–1.42.9, sha512 vs registry `dist.integrity` | all 4 match; 1.42.9 matches the PR lock |
| `diff` 1.42.6 → 1.42.9 dist/index.js, read in full | 1.42.7: 114 lines, 1.42.8: 4, 1.42.9: 44 |
| dependency ranges 1.42.6 vs 1.42.9 | unchanged; lock model 1.25.12 satisfies `^1.25.12` |
| PR diff 03b57020ec..a54be1e9be | 3 commits: lock (3 lines), notices, test + posttest entry, bundle. No package.json dependency change |
| `__focus_resync_queued_mounted` on 1.42.9 (own worktree barkpark-wt/review-j06-b2 at a54be1e9be) | 4/4 PASS, exit 0 |
| same test, `node_modules/prosemirror-view` swapped to verified 1.42.6, 2 runs | both: 2 FAIL (move lost, DOM and canvas), 2 PASS, exit 1 |
| shared `__focus_resync_keeps_caret_mounted` (21091298af) on 1.42.9 | FAIL only "focus queued ProseMirror's resync"; 3 behavior checks PASS. B.md's reading holds |
| widgets in src (remote-selections:214, resting-scaffolds:30, wikilink-titles:82) | all return elements; 1.42.6's widget regression never hit us |
| 1.42.9 `dispatchKey` composing guard | desktop keydown already returns in `inOrNearComposition`; only Android/iOS Enter/Backspace fallbacks change |

Not rerun by me: the PR `npm test` (B.md: exit 0, 597 s), the 287/289 spike suite, the V8 coverage of the four node-decoration lines, the 31 e2e runs (logs read: x10 "12 passed", x20 "22 passed", 2 of each are setup).

## Findings

| sev | class | file:line | repro | expected | actual | earliest check |
|---|---|---|---|---|---|---|
| LOW | evidence gap | scratchpad/j06-b/b2-e2e.sh, b2-runs.sh | read the run commands; `git grep -i throttl e2e` in barkever-wt/j06-focus-b | criterion 1 of task-15fb10381c98b141 asks 10x under 4x CPU **and** 10x without | the 31 green runs carry no CPU throttle, so they cover "without" only | the land-time runs for criterion 1 |
| LOW | evidence scope | spike-only e2e/local-canvas.ts | the e2e served a local bundle through a spike harness that never lands | J06 green against the bundle that ships | the bundle served is byte-identical to a54be1e9be's (B.md), so this holds until deploy; the live check comes after Barkpark deploys | after the Barkpark PR deploys to guerrilla |

Neither one changes the pick.

## Next

canvas-retry-2: hostile self-check, open the Barkpark PR from a54be1e9be. review-24788 reviews it (worktree barkpark-wt/review-j06-b2 is ready).
