# Quality

## 1. Made for visual thinkers

```
  ✗ wall of text            ✓ picture → few words → proof
  ┌──────────────┐          ┌──────────────┐
  │ ............ │          │  ┌─┐   ┌─┐   │  diagram or screenshot
  │ ............ │          │  └─┘──►└─┘   │
  │ ............ │          ├──────────────┤
  │ ............ │          │ 2 lines      │  what it means
  └──────────────┘          │ ▣ evidence   │  how we know
                            └──────────────┘
```

- Open with a diagram, a table or a screenshot. Words explain the picture.
- If it has rows, it's a table. If it has flow, it's a diagram.
- Cut every sentence a reader could skip. No intros, no recaps.
- Every UI change shows before and after screenshots in its Trail.
- In the app, the same rule: show previews, thumbnails and visual diffs, not paragraphs. Empty states show what to do in one line.

## 2. Evidence

- Unrun means unrun. Say which checks ran and where to see them.
- Nobody approves their own journey. Tests guard silent failures; they don't sign off UX.
- Predict the result, then run it. Unit tests and the real app both pass, or it isn't done.
- Screenshots and recordings of runs go in the Trail or the Barkpark task, not in git. Only curated reference images live in `reference/` and `docs/img/`: each under 300 KB, all under 5 MB together (`npm run check` enforces it).

## 3. Speed budgets

| Moment | Budget |
|---|---|
| Keystroke → screen | < 16 ms, never waits on network |
| Cmd-N → cursor | < 1 s |
| Switch note | < 100 ms (local replica) |
| Search first results | < 150 ms (local replica) |
| Reconnect → synced | < 10 s |
| Reload → first save on Barkpark | < 1 s, at any length of history |
| Remote edit appears | p95 < 300 ms online |

## 4. Chaos bot (sync merge rules)

```
seed ─► 15–75 random steps ─► world: no network, no browser, simulated clock
          A B C  real local · settle · push · check · merge on a fake IndexedDB, signed
          raw    Studio / CLI patches on the server, unsigned
          fake Barkpark: one note, 412 on a stale ifRevisionID, frames late · stale · duplicate
          steps: type end / middle / over, add / delete block, title, push, reply,
                 frame, offline, reload, render, wait 61 s
                      │
  after every step ─► no lost text · no echo copy
  then all online  ─► settled · converged · no lost text · solo writer: 0 copies
                      │ fails
                      ▼
            shrink ─► seed + the shortest step list that still fails
```

- **Lost text**: every version a writer typed stays, as the main or a copy, unless a writer later edited from that exact text. The bot knows what each screen showed; the app has to infer it.
- `pnpm -r test` runs 2,000 seeds and 300 solo seeds (`app/src/chaos/`). `npm run chaos [count] [from] [--solo]` runs deeper (default 50,000).
- Every check is strict: a lost-text or echo seed fails the run. Shrunk seeds that once failed stay as pinned tests.

## 5. AI

No silent writes. Always cite. One ✨ per pane; nothing pops up on its own. Every AI feature has an off switch. Show the model and cost. Note text is data, never instructions.
