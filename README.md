# Barkever

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/hero-dark.webp">
  <img alt="Barkever: sidebar, note list, editor and a map of a note's links" src="docs/img/hero-light.webp">
</picture>

**Notes and projects for visual thinkers.** Three calm panes on the web and on the Mac. It works offline, syncs when you're back, and its AI answers from your notes and cites them.

[![Barkever roadmap: what is done, what is not, and where we're heading](docs/img/roadmap.svg)](docs/ROADMAP.md)

## What we get

| Reward | Journey | Milestone |
|---|---|---|
| A new note and a cursor in under a second | J01 | P3 |
| Search, notebooks, tags, shortcuts and backlinks | J02–J05 | P3 |
| An hour offline, then everything merges with nothing lost | J10 | P3 |
| A signed Mac app on your own logins | J09 | P4 |
| ✨ Answers that cite every note they used | J07 | P5 |
| AI edits as a visual diff you accept or reject | J08 | P5 |
| Checklists become tasks on a board | J06 | P6 |

[![Ten journeys, each with its sign-off and open tasks](docs/img/journeys.svg)](JOURNEYS.md)

## How it fits together

```
┌──────────── Barkever (one React app: web + Mac) ─────────────┐
│ Sidebar       │ Note list          │ Editor              Ask │
└───────┬──────────────────────────────────────────────┬────────┘
        ▼                                              ▼
  local replica (IndexedDB) ◄─ sync ─► Barkpark   Mac app runs claude + codex
  works offline                                   on your own logins
```

## Where things live

| What | Home |
|---|---|
| Status | Barkpark tasks, goal `task-42e5633d742184c5`; mirrored to [milestones](https://github.com/FRIKKern/barkever/milestones) |
| Order and rewards | [docs/ROADMAP.md](docs/ROADMAP.md) |
| What "works" means | [JOURNEYS.md](JOURNEYS.md) |
| How good | [QUALITY.md](QUALITY.md) |
| Why | [docs/decisions/](docs/decisions/) |
| Rival tests | [spikes/](spikes/) |
| Schemas | [contracts/barkpark/](contracts/barkpark/) |
| How to work here | [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) |

## Layout

```
app/         the React app; only src/server/ talks to Barkpark
mac/         the Electron shell
design/      tokens the app and these pictures share
contracts/   Barkpark schemas
fixtures/    synthetic notes
conformance/ PortableDoc goldens
scripts/     guard, queue, land, roadmap
```

## Run it

Node 22 and pnpm. It reads the synthetic `barkever/fixtures` dataset with your `bp` login, or with `app/.env.local` (see [app/.env.example](app/.env.example)).

```sh
pnpm install
pnpm dev        # http://localhost:3000
pnpm mac        # the Mac app: same build, its own server inside
```
