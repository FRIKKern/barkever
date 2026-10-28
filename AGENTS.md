# AGENTS.md

Barkever is for visual thinkers. Everything you write follows that: lead with a picture, then the fewest words that carry the point.

## Where things live

```
work + status ─► Barkpark tasks (bp)      goal: task-42e5633d742184c5
plan          ─► Paper /papers/barkever-plan
why           ─► docs/decisions/NNNN-*.md (supersede, never edit)
what "works"  ─► JOURNEYS.md (J01–J10)
how good      ─► QUALITY.md
code history  ─► Entire checkpoints (every commit carries its prompt + transcript)
```

## Loop

1. `bp task next <worker>` or claim the task you were given.
2. Worktree for anything but `main`: `git worktree add ../barkever-wt/<name> -b <name>`. The main checkout never switches branches.
3. One journey per branch. Name it in the commit and the Trail: `J03: …`.
4. `npm run check` before every commit.
5. `npm run prepush` (guard + secret scan of Entire checkpoints), then push, open a Trail with the task id in its body, put the Trail URL on the task.
6. Close with evidence: what ran, where to see it, screenshots for any UI change.

## Long unattended runs

```
bp task get task-42e5633d742184c5 ─► next ready child ─► claim ─► unsure? rival spikes ─► judge
   ▲                                                                              │
   └── close with evidence ◄── push (npm run prepush) ◄── squash onto main ◄──────┘
```

Owner-only choices (a design pick) get a provisional pick from an independent judge, flagged on the task for the owner to override. Pulse claims you hold (`bp task pulse`); leases last 45 minutes.

## Rules

- **Picture first.** Docs, Papers, Trails and task closes open with a diagram, a table or a screenshot.
- **Unrun means unrun.** Never report a check you didn't run.
- **Nobody signs off their own journey.**
- **Predict, then run.** Unit tests and the real app are two oracles; both must pass.
- **Unsure? Test, don't guess.** Any decision you aren't sure of gets rival spikes: one agent per direction, same tests, same report table. Spike code lives in `spikes/<name>/`; the winner becomes a decision, the loser's report is linked from it.
- **Barkpark is the only backend.** Only `src/server/**` talks to it. A missing Barkpark feature gets fixed in Barkpark (`../barkpark`), not worked around here.
- **Fixtures are synthetic.** Real notes never enter tests or transcripts.
- **No secrets in prompts, files or output.** Entire pushes transcripts with the code.
- **Use `trash`, not `rm`.** Ask before pushing or anything destructive.
- **Entire:** run `entire agent-help` for the commands you may use. Never merge a Trail yourself.

## AI in the app

Runs the installed `claude` and `codex` on the owner's logins. Codex lives only inside the app; the coding agent for this repo is Claude Code. Child processes get no API keys, a fresh temp folder, no settings sources and strict MCP. AI never writes without a diff the user accepts. Every answer cites its notes. See decision 0007.
