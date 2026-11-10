# 0042 Staging is live: lands end there and a bot moves main

Accepted 2026-11-10 by the owner. Supersedes [0041](0041-land-on-staging-a-bot-moves-main.md). Task: task-4802d3c237aa7964.

```
land.mjs: rebase on main or staging, check, touched suites, scan ─► push staging
staging push ─► ci.yml, every sha ─┬─ green ─► promote.yml moves main, fast-forward only
                                   └─ red   ─► main stays; issue "staging is red at <sha>"

land on the Mac     docs 15 s    scripts 2 min 24 s    was about 17 min
push to main moved  3 to 5 min

rules, main     required: scan check build test-scripts test-app test-mac
                no force push, no delete; repository admins may bypass
rules, staging  no force push, no delete; no bypass
```

**Proof.** Run 42913368697 on 767036c: first try red, `main` stayed, issue 28 opened. Rerun green, promote run 42914812887 moved `main`. Run 42915326350 on 6c0aba5 changed `promote.yml`; the bot still moved `main`.

**Differs from 0041.**

- Staging has no linear-history rule: a split land pushes a merge.
- `land.pid` stays: one land at a time on this Mac.
- CI checks every staging sha at once, not only the newest.
- e2e is not required: its three secrets are missing, and a skipped job passes.

**Left.**

- Owner: Settings, Rules, Rulesets, `main`, Bypass list: remove "Repository admin". Agents push as the owner, so until then the rule stops only the bot.
- `heavy.mjs` slot tests flake on GitHub's macOS: two of six staging runs went red. Rerun the failed job; the bot moves `main` after.
- A "staging is red" issue stays open after a green rerun. Close it by hand.

**Not verified.** A direct push to `main` by an agent with the bypass removed. e2e on GitHub.
