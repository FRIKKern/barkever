# Barkpark PRs: fail your own PR before a reviewer does

```
builder ─► hostile self-check ─► open PR ─┬─► CI (≈25 min) ──────────────┐
                                          └─► reviewer starts now ───────┤
                                    fix list ◄── FAIL ◄──┤               │
                                    (reviewer → builder, direct)         ▼
                                                         PASS + green CI ─► lead merges ─► deploy
```

On 2026-10-29, 3 of 3 Barkpark PRs failed their first review (#24743, #24744, #24750). Each failure cost a full round: about 25 minutes of CI plus a re-review.

## Hostile self-check (builder, before opening the PR)

Each row is a bug a reviewer found that the builder could have found first.

| Try | Found in |
|---|---|
| Inputs at and over every limit: long keys and names, empty values, wrong types, bad slugs | #24750: a 201-character key gave a 500 instead of a 422 |
| Another workspace, project, user, bound token or shared token | #24743: a bound token could delete other datasets |
| Everything stored under the same name, after a delete and a recreate | #24743: webhooks came back alive |
| Two writers at once, including the first write and a delete racing an update | #24750: a DELETE during a PATCH gave a bare 404 |
| Every consumer of an event or payload you changed: webhooks, listen/SSE, Studio | #24744: `create` webhook subscribers broke |
| A mutant: remove your fix and confirm a test fails | all three reviews ran this check |
| Docs claim only what a test proves | #24750: "replaying changes nothing" was too broad |

Put the table in the PR body, with one line per row: what you tried and what happened.

## Flow

- The reviewer starts when the PR opens, not when CI turns green.
- The reviewer sends its fix list straight to the builder by agent name, and copies the lead on the verdict only.
- The lead merges on PASS plus green required CI: `gh pr merge <n> -R FRIKKern/barkpark --squash` as FRIKKern.
