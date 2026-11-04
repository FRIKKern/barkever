# Contributing

```
bp task next ─► worktree ─► one journey per branch ─► npm run check ─► review by someone else
     ▲                                                                        │
     └── close with evidence ◄── roadmap redraws ◄── land.mjs: prepush + ff ◄─┘
```

The full rules are in [AGENTS.md](AGENTS.md).

## Test it

```sh
npm run check     # repo guard: doc sizes, pictures, deps, secrets, Barkpark boundary
pnpm -r test      # unit tests, chaos bot included
pnpm e2e          # production build in Chrome; needs BARKEVER_E2E_* (app/.env.example)
pnpm e2e:mac      # the Mac app
npm run prepush   # guard, tests, e2e + a secret scan of outgoing commits
```

## Land it

```sh
node scripts/worktree.mjs <name>
node scripts/land.mjs <name> --reviewed <sha>
```

## Issues and milestones

Work is tracked in Barkpark, not here. GitHub's milestones and criterion issues are a one-way mirror, so a change made on them is overwritten. Stamp the criterion on the Barkpark task, then run `npm run roadmap:publish` on a clean main, or let the next land do it. See [decision 0037](docs/decisions/0037-github-milestones-mirror-barkpark.md).

Something wrong? `bp task create`, or open a report from the [new issue page](https://github.com/FRIKKern/barkever/issues/new/choose).
