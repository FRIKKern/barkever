# Barkpark PRs: fail your own PR before a reviewer does

```
builder ─► hostile self-check ─► open PR ─┬─► CI (≈25 min) ──────────────┐
                                          └─► reviewer starts now ───────┤
                                    fix list ◄── FAIL ◄──┤               │
                                    (reviewer → builder, direct)         ▼
                                                         PASS + green CI ─► lead merges ─► deploy
```

On 2026-10-29, 3 of 3 Barkpark PRs failed their first review (#24743, #24744, #24750), and 4 fixes were half fixes that failed again in the next round. Every row below comes from `pace/misses.jsonl`.

## Hostile self-check (builder, before opening the PR)

Each row is a bug a reviewer found that the builder could have found first.

| Try | Found in |
|---|---|
| **Fix the class, not the instance.** For each finding, list every other place with the same shape (routes, producers, row kinds, stores) and fix or test them all | #24743: F1, F3 and F2 each came back in the next round. #24744: the webhook fix covered the live send only |
| Inputs at and over every limit: long keys and names, empty values, wrong types, bad slugs | #24750: a 201-character key gave a 500 instead of a 422 |
| Another workspace, project, user, bound token or shared token, **and global rows with no workspace** | #24743: a bound token deleted other datasets; global synonyms cascaded away |
| **Rename, delete and recreate everything your change points at** (a linked note, a token, a cache, a file, an embedding dataset), and check every place that shows or stores the reference | #24743: webhooks, bound tokens and a cached config came back after recreate; J05: a renamed or deleted link target still showed its old title |
| Two writers at once, including the first write, a delete racing an update, and **side effects that fire before commit** | #24750: a DELETE during a PATCH gave a bare 404; #24743: revoke broadcasts before commit |
| Every consumer of what you changed: **grep each stored field for its readers** (retry, sweeper, replay, analytics, Studio), not just the live fan-out | #24744: the stored event row fed retries and replays the old label |
| **No fallbacks.** A default that covers a missing value hides the bug; remove it and run a mutant per producer | #24744: `details.id` fell back to the named id twice |
| **One mutant per claimed behavior.** List every behavior your PR claims; break each one in turn and name the test that fails. A survivor blocks review: pin it with a test or cut the code | prefs-ops: 3 mutants run, 4 of the reviewer's 6 survived; j10-copy-rule: 3 survivors sent to review, reviewer had to pin them |
| **Time it at real size**: 150+ documents or rows, with a write to a sibling dataset timed while it runs; nothing holds a workspace lock for the whole walk | #24743: a 60-doc dataset delete hit the 15 s timeout and froze every write in the workspace |
| **Run locally every step of every job your diff touches**, and every gate that passed on the previous head (boundary, census, doc budgets, repo-papers freshness, format, prod compile) | #24743: Boundary gate red after the push; #24761: ran doc budgets but not repo-papers freshness |
| Docs and the PR body claim only what a test or your own probe proves | #24750: "replaying changes nothing"; #24743: cited a probe nobody ran |

Put the table in the PR body, with one line per row: what you tried and what happened.

## Flow

- Barkever branches run this self-check too.
- The reviewer works in its own worktree at the named sha, never the builder's.
- The reviewer starts when the PR opens, not when CI turns green.
- The reviewer sends its fix list straight to the builder by agent name, and copies the lead on the verdict only.
- The reviewer gives each finding a class and the earliest check that should have caught it. The lead logs it in `pace/misses.jsonl`.
- The lead merges on PASS with `node scripts/merge-pr.mjs <n> <reviewed sha>`: it refuses a head the review did not see, waits for every check, and refuses any non-advisory fail. It refuses while a required check is red on main; `--fixes-main` is for the PR that fixes main, `--known-red <name>` for a named non-required check already red there.
