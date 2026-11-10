# 0041 Proposed: land on staging, a bot moves main

Proposed 2026-11-10. Not switched on: every step below is the owner's. Builds on [0040](0040-github-checks-every-push.md). Task: task-4802d3c237aa7964.

```
agent branch ─► land.mjs: rebase on origin/staging, check + changed tests + scan (under 2 min)
            ─► git push origin <sha>:staging        no force, no land.pid queue
staging push ─► ci.yml, newest waiting sha only ─┬─ green ─► promote.yml moves main to that sha
                                                 └─ red   ─► main stays, an issue names the sha
```

```
scripts/land.mjs    rebase onto origin/staging, not main; compare against it too
                    drop "prepush (queued)" and land.pid; run only the touched package's tests
                    drop the merge in the main checkout; push <sha>:staging, retry 3 times if it moved
scripts/roadmap.mjs --publish pushes its pictures to staging, not main
promote.yml         on workflow_run of ci on staging, success: PATCH refs/heads/main, force=false
                    permissions contents: write, issues: write; checks out no code
ci.yml              add staging to push branches; its runs go one at a time, none cancelled
rules, main         required checks: scan check build test-scripts test-app test-mac
                    no force push, no delete, no bypass, admins included
rules, staging      no force push, no delete, linear history
AGENTS.md, 0036     "landed" means on staging; evidence waits for the main sha
```

**Why.** A land holds the Mac for 12 to 22 minutes, one at a time. GitHub's minutes are free.

**Breaks on switch day.**

- A land started with an old `land.mjs` pushes `main`, is refused after its prepush, and leaves local `main` ahead of origin. Switch only when `.git/land.pid` is gone.
- Worktrees carry their own old `land.mjs`. Run the one in the main checkout until they rebase.
- Agents push as the owner's account, so a bypass for admins lets every agent past the rule.
- A red staging blocks everyone behind it. Revert the commit on staging; never force.
- e2e stays unchecked until the three secrets of 0040 exist, so until then `main` can move on a commit no e2e saw.

**Not verified.** Whether a personal repo's rules can refuse the owner's own push, and whether the workflow token may move a `main` that has required checks.
