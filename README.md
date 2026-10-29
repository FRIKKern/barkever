# Barkever

Notes and projects for visual thinkers. Evernote's calm three panes, built on Barkpark. Works offline and syncs when you're back online.

```
┌──────────── Barkever (one React app: web + Mac) ─────────────┐
│ Sidebar       │ Note list          │ Editor            ✨ Ask │
│ Search, +Note │ notebook · date    │ breadcrumb        panel  │
│ Shortcuts     │ title              │ toolbar, AI Edit         │
│ Recent, Tasks │ 2-line snippet     │ backlinks, tags          │
└───────┬──────────────────────────────────────────────┬────────┘
        ▼                                              ▼
  local replica (IndexedDB) ◄─ sync ─► Barkpark   Mac app runs claude + codex
  works offline                        "barkever"  on your own logins
```

| Read | For |
|---|---|
| [AGENTS.md](AGENTS.md) | How to work here |
| [JOURNEYS.md](JOURNEYS.md) | What "works" means, J01–J10 |
| [QUALITY.md](QUALITY.md) | Visual rules, evidence, speed budgets |
| [docs/decisions/](docs/decisions/) | Why it's built this way |
| [spikes/](spikes/) | Rival tests behind the unsure decisions |
| [contracts/barkpark/](contracts/barkpark/) | Schemas, prefs keys, datasets |
| [pace/](pace/) | Speed, compute and hygiene data; 6-hour reports |

Plan: `/papers/barkever-plan` on guerrilla.barkpark.cloud. Work: `bp task get task-42e5633d742184c5`.

Run the app (Node 22, pnpm). It reads `barkever/fixtures` with your `bp` login, or with `app/.env.local` (see [app/.env.example](app/.env.example)):

```sh
pnpm install
pnpm dev        # http://localhost:3000 — lists the 50 fixture notes
pnpm mac        # the Mac app: same build, its own server inside (decision 0020)
```

```sh
npm run check     # repo guard: doc sizes, pictures, images, deps, secrets, Barkpark boundary
npm run seed      # 50 synthetic notes → barkever/fixtures (never production)
pnpm -r build     # typecheck + production build
pnpm -r test      # unit tests, chaos bot included (2,000 seeds)
npm run chaos     # chaos bot, 50,000 seeds: lost text, echo copies, convergence (QUALITY.md §4)
pnpm e2e          # production build in Chrome: ≥ 50 notes
pnpm e2e:mac      # the Mac app: sign-in, edit, offline relaunch, safeStorage
npm run prepush   # all of the above + secret scan of Entire checkpoints
node scripts/pace.mjs          # progress, machine load, hygiene since the last snapshot
node scripts/heavy.mjs <cmd>   # run an e2e or suite in the shared 2-slot queue
```
