# Contributing

```
bp task next ─► worktree ─► one journey per branch ─► npm run check ─► review by someone else
     ▲                                                                        │
     └── close with evidence ◄── bot moves main ◄── land.mjs: push staging ◄──┘
```

The full rules are in [AGENTS.md](AGENTS.md).

## Test it

```sh
npm run check     # repo guard: doc sizes, pictures, deps, secrets, Barkpark boundary
pnpm -r test      # unit tests, chaos bot included
pnpm e2e          # production build in Chrome; needs BARKEVER_E2E_* (app/.env.example)
pnpm e2e:mac      # the Mac app
npm run prepush   # guard, tests, e2e + a secret scan; no longer part of a land
```

## Land it

```sh
node scripts/worktree.mjs <name>
node scripts/land.mjs <name> --reviewed <sha>
```

A land ends on `staging`. GitHub checks it there, and `main` follows once the checks are green.

## Issues and milestones

Work is tracked in Barkpark, not here. GitHub's milestones and criterion issues are a one-way mirror, so a change made on them is overwritten. Stamp the criterion on the Barkpark task. The next land redraws, or the lead runs `npm run roadmap:publish`. See [decision 0037](docs/decisions/0037-github-milestones-mirror-barkpark.md).

Something wrong? `bp task create`, or open a report from the [new issue page](https://github.com/FRIKKern/barkever/issues/new/choose).
