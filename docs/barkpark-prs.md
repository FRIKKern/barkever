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
| **Every flag, every bad form.** For each CLI flag or argument the change reads, a table: missing value, a flag in the value's place, the `=` spelling, empty, zero, negative, a bare number, huge (past 2^31), a malformed date, the same value written two ways. Each gets a usage error with exit 2 or a pinned behavior | arms-timeout: 2^31 and `--timeout=` slipped past; pace-since: `garbage`, a bare `--since`, `--since 6` read as 2001 |
| **Leaves nothing behind.** After a green, a red, a thrown and a killed run, count what the change or its tests create: temp dirs, worktree state (REBASE_HEAD, staged files), claims, datasets, processes. Before and after must match | land.mjs left a half rebase; arms, check-repo, mutate, pace and land tests left 3816 temp dirs |
| Another workspace, project, user, bound token or shared token, **and global rows with no workspace** | #24743: a bound token deleted other datasets; global synonyms cascaded away |
| **Rename, delete and recreate everything your change points at** (a linked note, a token, a cache, a file, an embedding dataset), and check every place that shows or stores the reference | #24743: webhooks, bound tokens and a cached config came back after recreate; J05: a renamed or deleted link target still showed its old title |
| Two writers at once, including the first write, a delete racing an update, and **side effects that fire before commit** | #24750: a DELETE during a PATCH gave a bare 404; #24743: revoke broadcasts before commit |
| **Writes a note body → two-device probe run, name the spec.** Open the note on A and B, let A read, have B type into a block, then make A's write (canvas, source mode, AI edit, a tick, a kept version): B's words must survive in the note or a version. Call `keepsOtherDevicesWords` from `app/e2e/devices.ts` in the writer's spec, then force the writer's base to the replica's current body and see it go red | J08: accept and undo diffed from the live canvas and dropped another device's words; sync-merge is at 17 misses |
| Every consumer of what you changed: **grep each stored field for its readers** (retry, sweeper, replay, analytics, Studio), not just the live fan-out | #24744: the stored event row fed retries and replays the old label |
| **Every door in.** List each path input takes into your change (paste as HTML, Markdown and plain text; typing; drop; import; API) as a table, one test per door | #24796: the rule covered HTML paste; every Markdown paste skipped it |
| **Read stored data the way its writer does.** For every shape Barkpark's canvas or API stores (all block types, every field a word can live in, unknown types), compare our reader with the canvas's own reader on the same document; a field the canvas reads first wins; an unknown shape is never blank | j05-marks: a heading with `text: ''` and bold `content` read as blank and the note was deleted; blank-structure: an image-only note read as blank |
| **A-B-A and unsigned writes.** In sync code, set a value back to an earlier one, and write through Studio or raw, which keeps the old `by` and signature | basefor-landed: a revert plus an unsigned Studio write faked the landed proof and lost a title |
| **New e2e: 10 in a row.** Run each new or changed e2e 10 times through heavy (`--repeat-each=10`) before sending the sha; one pass can be luck | canvas-retry: the builder's new test failed 4 of 5 in review |
| **No fallbacks.** A default that covers a missing value hides the bug; remove it and run a mutant per producer | #24744: `details.id` fell back to the named id twice |
| **No retry without a cause.** Before a test retries (toPass, poll, repeat), count attempts per step under 4x CPU; a first attempt that fails is a bug to find, not to wait out | J05: a 10 s retry around Mod+Enter hid lost caret input, 11 of 27 first presses at 4x |
| **One mutant per new arm.** Run `node <barkever>/scripts/arms.mjs origin/main --run "<unit test command>"` in your worktree: it lists every new branch, error path and fallback in the diff, runs operator mutants on each TS/JS row (`\|\|`↔`??`, swapped and dropped fallbacks, `===`↔`!==`, `<`↔`<=`, `startsWith`→`includes`, a predicate → `true`), and exits 1 on a survivor. It runs the command once unmutated first and stops if that is red; `--timeout <ms>` bounds a hung mutant; rows no operator covers are listed for a hand mutant. Pin or cut every survivor; put the table in the PR body. Arms it cannot mutate still need a hand mutant | #24791: `true -> :database` turned a hook halt into a retryable 503; tags-clash: `?? undefined` survived; j05-marks S1 `\|\|`→`??` and S2 swapped operands, both listed and unrun |
| **One mutant per claimed behavior.** List every behavior your PR claims; break each one in turn and name the test that fails. A survivor blocks review: pin it with a test or cut the code | prefs-ops: 3 mutants run, 4 of the reviewer's 6 survived; j10-copy-rule: 3 survivors sent to review, reviewer had to pin them |
| **Time it at real size**: 150+ documents or rows, with a write to a sibling dataset timed while it runs; nothing holds a workspace lock for the whole walk | #24743: a 60-doc dataset delete hit the 15 s timeout and froze every write in the workspace |
| **Run locally every step of every job your diff touches**, and every gate that passed on the previous head (boundary, census, doc budgets, repo-papers freshness, format, prod compile) | #24743: Boundary gate red after the push; #24761: ran doc budgets but not repo-papers freshness |
| Docs and the PR body claim only what a test or your own probe proves | #24750: "replaying changes nothing"; #24743: cited a probe nobody ran |

Put the table in the PR body, with one line per row: what you tried and what happened. The body also says "Barkever" and carries a `Task: <id>` line: pace.mjs counts merged PRs by `barkever in:body`, and Barkpark CI refuses a PR with no active task.

## Flow

- Barkever branches run this self-check too.
- The reviewer works in its own worktree at the named sha, never the builder's.
- The reviewer starts when the PR opens, not when CI turns green.
- The reviewer sends its fix list straight to the builder by agent name, and copies the lead on the verdict only.
- Criteria get stamped only after a PASS, with evidence that names the reviewer and the sha; a stamp before review is withdrawn.
- A PASS freezes the branch. The builder pushes nothing more to it; new work goes in a follow-up PR from main. Every ask the lead has goes in the message that hands the branch to review.
- The reviewer gives each finding a class and the earliest check that should have caught it. The lead logs it in `pace/misses.jsonl`.
- The lead merges on PASS with `node scripts/merge-pr.mjs <n> <reviewed sha>`: it refuses a head the review did not see, waits for every check, and refuses any non-advisory fail. It refuses while a required check is red on main; `--fixes-main` is for the PR that fixes main, `--known-red <name>` for a named non-required check already red there.
