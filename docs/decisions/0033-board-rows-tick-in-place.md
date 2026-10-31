# 0033 Board rows tick in place

Accepted 2026-10-31. Supersedes the "Owner pick" line of 0031.

```
board row:  [box] Oil the chain ›
              │         └─ words ─► open the note at that line
              └─ click / Space ─► tick(note, box) ─► replica edit ─► outbox ─► Barkpark
```

| Before (0031) | After |
|---|---|
| The box is drawn only; a click anywhere opens the note | The box ticks that line; the words open the note |
| Ticking happens in the note | Ticking happens on the board row or in the note |
| The phone box is the icon size | The phone box is a 44 px tap target |

**Why.** The owner's reference ticks in place, and opening a note just to flip a box costs a trip.

**How it holds.** The box carries its line key (block, item, words sum, twin). The tick finds the line inside the replica write, so quick ticks stack and a line that moved still ticks its own words. If the words changed, nothing is ticked. It works offline and survives a reload. A clash keeps both versions, per 0017.

**Evidence.** task-d513c740903d25ce. review-flakes passed it at 31dab96. `app/e2e/j06-tick.spec.ts` ran 10 times in a row through heavy.
