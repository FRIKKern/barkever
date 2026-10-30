# Spike A: a copy drops only when its text provably lives on

```
each pushed title/block carries a stamp in from[]:
  "<part>=#<text sum><<line>.<step><parent marks…"     e.g.  title=#k2x9<a1b2c3d4.7<#p0q1
  (line = one writer's unbroken run of saves on a part; step = how far along it is)

typing on my own line       ─► same line, step+1
typing on someone's text    ─► new line; its parents are that text's marks (4 marks kept at most)
raw write (by doesn't check) ─► the merging device stamps it "grew from what the server held"

copy C is dropped  ⇔  C has a `by`, and for every title/body part it clashed on,
                      some kept text (the main, the new copy, another kept copy)
                      has C's exact text sum, or C's line at a step ≥ C's step
all other copies stay: unsigned writers' older texts, legacy copies, tag/notebook-only clashes
```

| # | Test | main 7b150a5 | A | Pass |
|---|---|---|---|---|
| 1a | R5 second offline clash, merge level | "Base A1" lost | copies `[A1, B1 a]` | ✅ |
| 1a | same, 2 real browsers | A1 lost | A1 kept | ✅ |
| 1b | R5 offline clash then online typing (merge level, raw objects) | A1 lost | A1 kept; 3 copies | ✅ no loss |
| 1b | same via mergeLocal | — | `[A1, B1 a]` | ✅ |
| 1b | same, 2 real browsers | A1 lost | A1 everywhere; 2 copies | ✅ |
| 1c | R5 titles | "Plan A" lost | kept | ✅ |
| 1d | R5 two raw writers, Studio then CLI | "Studio edit" lost | both kept | ✅ |
| 2 | R4 loser types on main | pass | pass | ✅ |
| 3a | R3 two devices typing one block 5 s | ≤ 1 | ≤ 1 | ✅ |
| 3b | R3 raw writer sets title 6×, unit | 1 copy | 6 copies | ❌ |
| 3b | same, e2e title race | ≤ 1 | 5 copies | ❌ |
| 3c | own fast typing | 0 | 0 | ✅ |
| 4 | echo 0/400/1200 ms | 0/0/0 | 0/0/0 | ✅ |
| 5 | J10 runs 1/2/3 | — | pass / setup flake (`client.ts:114`, no ?n= after New note, load 50) / pass | ◐ |
| 6 | full e2e | — | 54/55, only 3b | ❌ 3b |
| 6 | check, build | ok | ok | ✅ |

Claim: 3b and 1d cannot both pass. Same shape (raw text loses to a signed writer, then raw writes again over the main); 3b wants the first raw text dropped, 1d wants it kept. A keeps both. Either 3b changes to "every remote title survives" or raw writers need an identity from Barkpark.

| Measured | main | A |
|---|---|---|
| 10-min storm copies left (3 seeds) | 2 / 7 / 7 | 15 / 15 / 15 |
| storm typed tokens lost | 540 / 493 / 244 | 0 / 0 / 0 |
| stamp bytes per push (storm) | 0 | avg 843–902, max 1593 |
| real note stamp bytes | 0 | 315 (doc +19 %) |
| lines | — | app +82/−13 (`ancestry.ts` 55), tests +47, contract +4/−1 |

Against: copies grow with real losses (~15 per storm); raw writer rewriting title N times leaves N copies; "server succession" treats a raw write as growth from what the server held (a drop); 60–100 B per stamped block; max 4 marks; journal title path writes no stamp; tag/notebook-only clashes never drop; old clients sign without stamps.

Schema: `contracts/barkpark/note.json` gains `from` (string array) on note and copies.

Unrun: repo-wide npm run test, prepush, mac e2e, review 3's own browser scripts, browser storm.

Evidence: probe dataset `probe-a-202610291039`; logs in `scratchpad/spike-a/`.
