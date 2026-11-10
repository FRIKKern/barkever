# AGENTS.md

Barkever is for visual thinkers. Everything you write follows that: lead with a picture, then the fewest words that carry the point.

## Where things live

```
work + status ─► Barkpark tasks (bp)      goal: task-42e5633d742184c5
plan          ─► Paper /papers/barkever-plan
roadmap       ─► docs/ROADMAP.md: pictures and GitHub milestones drawn from bp, never by hand
why           ─► docs/decisions/NNNN-*.md (supersede, never edit)
what "works"  ─► JOURNEYS.md (J01–J10)
how good      ─► QUALITY.md
code history  ─► git log and blame: the commit message says why
heavy runs    ─► node scripts/heavy.mjs <e2e or suite>  (shared 3-slot queue)
Barkpark PRs  ─► docs/barkpark-prs.md (hostile self-check first)
```

## Loop

1. `bp task next <worker>` or claim the task you were given.
2. Worktree for anything but `main`: `node scripts/worktree.mjs <name>` (installs, links the env). The main checkout never switches branches.
3. One journey per branch. Name it in the commit: `J03: …`.
4. `npm run check` before every commit.
5. `node scripts/land.mjs <name> --reviewed <sha>`: only the reviewed head; rebase, check, touched tests, scan, push `staging`; a bot moves `main` when CI is green ([0041](docs/decisions/0041-land-on-staging-a-bot-moves-main.md)). No squash. Evidence on the task.
6. Close with evidence: what ran, where to see it, screenshots for any UI change. The lead redraws after a stamp: `npm run roadmap:publish`.

## Long unattended runs

```
bp task get task-42e5633d742184c5 ─► next ready child ─► claim ─► unsure? rival spikes ─► judge
   ▲                                                                              │
   └── close with evidence ◄── bot moves main ◄── ci green ◄── land on staging ◄──┘
```

Owner-only choices get a provisional pick from an independent judge, flagged for the owner. Pulse claims you hold (`bp task pulse`); leases last 45 minutes.

## Rules

- **Picture first.** Docs, Papers and task closes open with a diagram, a table or a screenshot.
- **Unrun means unrun.** Never report a check you didn't run.
- **Nobody signs off their own journey.** Stamp criteria only after a PASS, naming reviewer and sha.
- **Predict, then run.** Unit tests and the real app are two oracles; both must pass.
- **Code:** no comments (names carry the meaning), YAGNI, no god files, no stupid patterns: no needless layers, boilerplate or ceremony. CI: [0040](docs/decisions/0040-github-checks-every-push.md), [0041](docs/decisions/0041-land-on-staging-a-bot-moves-main.md). Be brave; other agents review after.
- **Unsure? Test, don't guess.** Rival spikes in `spikes/<name>/`, one agent per direction, same tests; the winner becomes a decision linking the loser's report.
- **Barkpark is the only backend.** Only `src/server/**` talks to it. A missing Barkpark feature gets fixed in Barkpark (`../barkpark`), not worked around here.
- **Fixtures are synthetic.** Real notes never enter tests or transcripts.
- **guerrilla is shared** by every run and agent. A live probe is one timed call: no loops, no deletes or bulk writes without the lead.
- **No secrets in prompts, files or output.** `land.mjs` and `npm run prepush` scan outgoing commits; a plain `git push` runs nothing, so land.
- **Use `trash`, not `rm`.** Ask before pushing or anything destructive.
- **Trial until 2026-11-09 overrides these rules:** [0038](docs/decisions/0038-review-trial.md).

## AI in the app

Runs the installed `claude` and `codex` on the owner's logins. Codex lives only inside the app; the coding agent for this repo is Claude Code. Child processes get no API keys, a fresh temp folder, no settings sources and strict MCP. AI never writes without a diff the user accepts. Every answer cites its notes. See decision 0007.
