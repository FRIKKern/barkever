# P2 judge

**Owner picked C (linked map)** on 2026-10-29, overriding the pick below. See [decision 0016](../../docs/decisions/0016-design-c-linked-map.md).

| Row | A quiet | B cards | C map | D lanes | Why low |
|---|---|---|---|---|---|
| §1 Picture first | 3 | 4 | 5 | 4 | A: text rows. B: overlay discounted |
| §1 Rows → table, flow → diagram | 4 | 4 | 5 | 5 | |
| §1 Cut words | 4 | 5 | 4 | 4 | A: dead Files/Calendar/Templates |
| §1 Previews, thumbnails, diffs | 4 | 4 | 5 | 4 | B: thumbnails are overlay images |
| §1 One-line empty state | 5 | 4 | 4 | 3 | D: "press N" does nothing |
| J01 Capture | 4 | 1 | 1 | 1 | B: New note dead. C, D: can't create |
| J02 Browse | 5 | 5 | 2 | 5 | C: no URL, Back leaves the app |
| J03 Find | 5 | 5 | 5 | 4 | D: needs Enter to reach the list |
| J04 Organize | 4 | 3 | 2 | 2 | A: no sidebar tags. B: no shortcuts. C, D: notebooks only |
| J05 Link | 3 | 3 | 4 | 3 | Nobody adds a link by hand |
| J06 Plan | 3 | 4 | 3 | 5 | A, C: grouped by notebook, no status |
| J07 Ask | 5 | 5 | 5 | 5 | |
| J08 AI Edit | 4 | 4 | 5 | 5 | None start from a selection |
| J10 Offline/conflict | 5 | 5 | 4 | 5 | C: offline not seen on screen |
| Mobile 390 px | 5 | 4 | 4 | 4 | |
| Dark | 5 | 5 | 4 | 5 | C: dim map tiles |
| Visual thinker, daily | 3 | 4 | 4 | 4 | A: tidy text, no pictures |
| **Total /85** | **71** | **69** | **66** | **68** | |

## Pick (provisional, owner overrides)

**Winner: B cards.** A's three-pane skeleton, plus a picture of each note's shape in the list, beside the note, on backlinks and on Ask sources. It is 2 points behind A, wins the visual rows, and its one failing row is an unwired button.

**Runner-up: A quiet.** The most complete: it is the only one that creates notes, and it has Shortcuts, Recent, and the clearest Ask and diff. But it is text-first, against §1.

Risk: shapes need varied notes. On plain fixtures they look alike, as B's author says.

## Steal

1. C's link graph (`c-map/src/graph.js`, `rail.js`) in B's right column, in place of "0 out · 4 in".
2. C's dashed edge for a link the AI proposes, and Ask's "where this came from" mini-map (`c-map/src/ai-edit.js`, `rail.js`).
3. D's project × time board and Today/Week/Later home (`d-lanes/src/board.js`, `home.js`). Needs due dates; D invents them in `plan.mjs`.
4. D's AI Edit names the source note on each change (`d-lanes/src/ai-edit.js`).
5. A's capture (N → new note, title focused), Shortcuts + Recent, and Ask's "Searched 50 notes for …" line (`a-quiet/src/state.js`, `sidebar.js`, `ask.js`).

## Not verified

- Speed budgets: I timed only search (under 40 ms in all four).
- B without `overlay.mjs` (not rebuilt).
- C's offline state: read in the code, not seen on screen.
- A: text typed after Enter in a new note's empty body did not appear. Could be my test driver.
- J09, real AI, drag.

Flip between all four: `index.html` here.
