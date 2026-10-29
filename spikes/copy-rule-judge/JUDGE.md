| Option | Lost seeds / 10k | Echo seeds / 10k | Copies per note | Storm 10 min (stored · bytes) | 3b · 1d | UX | App lines vs main |
|---|---|---|---|---|---|---|---|
| main 7b150a5 | 262 | 7 | 2.72 | 5 · 17 KB | ✅ · ✘ | side by side, no resolve | — |
| A ancestry 7364ca0 | **464** | 7 | 1.82 | 53 after 1 min, all 53 shown, 4.7 s CPU per sim-minute | ✘ · ✅ | main's view | +81 −14 |
| B never drop 1564edb | 1 (2337) + 1 flaky (7985) | 7 | 3.39 | 1,138 · 1.85 MB | ✅ (rewritten) · ✅ | grouped, folded, Keep / Dismiss | +129 −24 |
| **Hybrid: B + 3 fixes** (`judge-hybrid`) | **0** (0 in 100k) | **0** | 3.33 | **488 · 815 KB** (0 of them redundant) | ✅ (B's) · ✅ | B's | +166 −37 |
| Hybrid + copies hold only clashing blocks | 0 | 0 | 3.33 | 488 · 616 KB | ✅ · ✅ | narrower copies | +1 line more |

Chaos: strict, seeds 1–10,000, `Date` pinned to the simulated clock (see bot note below). Storm: B's `storm.ts` (seed 1010, 2 typists, 10 simulated minutes) via `spikes/copy-rule-judge/storm.ts`, which also keeps the device-only `_typed` list across pulls and strips it from pushes, as the app does.

## Pick: B, plus three fixes

```
B (copies only added; exact duplicates and copies the main holds collapse; Keep this · Dismiss)
 + copy _key = <rev>~<sum of clash parts>           fixes B's 2 losses and A's key half
 + baseFor over every unacked push, part by part     fixes the echo (7 seeds → 0)
 + drop a copy whose every clashing text I typed from storage: 1,138 → 488, 1.85 MB → 815 KB
   (device-only _typed list, written by mergeLocal)
```

A is out. Its losses are real, it can't pass 3b and 1d together, and its storm grows just as fast with every copy shown.

## 1. A's 464 losses are real

The bot's truth is right. Every loss I traced is text nobody edited from. There are three separate causes. I patched each one in A and reran 10k seeds:

| Cause in A | Example | Lost seeds when fixed |
|---|---|---|
| (as shipped) | | 464 |
| A copy "covers" another through a part that isn't one of its clash parts; then that copy drops on its own clash parts, and the text is gone | seed 2: `T0 R1` dropped because copy r2's *unclashed* title held it; r2 then dropped because r3's *unclashed* body held `R2 S0` | 84 with cover limited to clash parts |
| Same `_key` (theirs' rev), different `clash` on different devices; the key merge keeps one device's label | seed 2 after fix 1: A's r4 clashes on the title, B's r4 on s0 | 33 with clash labels unioned |
| **Server succession** for raw writers: `theirsFrom` says unsigned text grew from *my base*, but the raw writer edited a newer revision | seed 387: B's base r1 `S0 R1`; raw wrote `A1 R3` from r3's `A1`; A claims `A1 R3 < S0 R1` and drops both copies of `S0 R1`, which nobody edited from | 5 without succession, but copies rise to 2.92 (above main) |

**3b and 1d have the same shape**, and the claim holds. Both are an unsigned write over my main title, twice: 3b's raw writer sets `Server title i` over `D title i-1`, and 1d's Studio and then the CLI each write over `Plan mine`. All unsigned writers are one writer (0021), so no rule can drop in 3b and keep in 1d. Run on A's test file: main passes 3b and fails 1d; A fails 3b and passes 1d; the hybrid fails 3b's old form and passes 1d.

**3b is the wrong test.** It asks to drop five raw titles nobody edited from. That is lost text by QUALITY §4. Its real intent is "don't pile up noise", and that is a display rule: B's rewrite (keep all six, show the latest, fold the rest) already does it.

## 2. B's 2 losses: key collision, then collapse

```
C: copy r2 (clash title,  body s0 = "R2 S0")   B/A: copy r2 (clash body:s0)
C merges r4: mine r2 ∩ theirs r2 → keeps mine's label (title)
collapse: r2's title "T0 R1" == r1's title → r2 is a "duplicate" → dropped
"R2 S0" was only in r2 → lost                                   (seed 2337)
```

Seed 7985 is the same shape between an `r2` copy and a `local-…` copy. It flakes because `before()` orders duplicates by `at`, and `at` comes from `new Date()`, which the bot doesn't pin.

**The fix is 1 line:** key each copy by rev *and* clash set (`merge.ts`, `copyKey`). With that, the dedupe and Dismiss act on the label they were made with. I tried unioning labels on collision first. It fixes 2337, but then removals spread: one device drops a narrow-label copy, and the 3-way key merge deletes the wide one everywhere (2 new losses: 7424, 8780). Separate keys have 0.

## 3. Echo: one bug on every branch, now fixed

The same 7 seeds fail on main, A and B (1052, 2464, 4108, 5918, 6837, 7025, 9107). Seed 1052:

```
B push r1 (title "T0 B1") ── reply lost ── reload ── types "B2" ── push → 412
entry.pushed = the "B2" attempt; A merged r1 → r2 (signed A)
baseFor: pushed ≠ r2 → falls back to base r0 → "T0 B1" looks like A's → copy of B's own text
```

There are two holes: `pushed` keeps only the *latest* attempt, and the match is all-or-nothing.

**The fix:** `Entry.sent[]` holds every push since the last ack (up to 8). `baseFor` takes, part by part, theirs' value where some sent version equals it, and base's value elsewhere. It returns `base` itself when nothing landed. Echo: 7 → 0 in 10k, and 0 failures in 100k.

## 4. Storage that can't lose text

```
mergeLocal: every part I change, mark(part, text I edited from) → note._typed  (device-only, last 512)
mergeNote:  drop a copy if every clash part's text is in mine._typed
            → removal syncs by the 3-way key merge
```

This rule is the chaos truth itself: the text was retired by a writer who edited from it, here me, so it can't count as lost. It needs no ancestry stamps, and it covers idea 1 (the prefix or ancestor rule) without needing the later copy to be kept.

| Idea | Verdict |
|---|---|
| 1. Collapse an exact prefix or ancestor by the same writer, from local history | **Built, in a stronger form** (above). In the storm, 0 of the 488 copies left are text anyone typed from. B kept 140 such copies out of 235 at minute 2. |
| 2. Copy only after the loser pauses | Not built. The copy is the only server-side holder of the loser's text. Delaying it opens a window for loss, depending on timing. |
| 3. Character-level merge of one block | Not built. It breaks the oracle: the bot's truth is verbatim versions, so a merged text "loses" both sides by definition. It needs an owner call on the invariant ("no lost characters"), then its own spike. This is the only idea that cuts below 488, because those 488 are real losing versions. |
| + Copies store only clashing blocks | Measured: 0 lost, 815 → 616 KB. Not in the pick: it changes the view and makes `keep()` lose the block's position. |

The storm floor under the verbatim invariant is about 49 copies per minute of two people typing in one block, and the hybrid is at it. Main gets 5 copies by losing text.

## 5. UX: B's view, judged against C and QUALITY

| | Design C (`07-conflict.webp`) | B (`grouped-dark.webp`, `quiet-line-dark.webp`) |
|---|---|---|
| Closed state | full banner | ✅ one quiet line, "3 versions kept · Show" |
| Who | "This Mac" / "iPhone" | ✘ "Other version · 12:20"; two lanes look the same |
| What differs | word-level highlight | ✘ whole title and block highlighted; "This version" lights up every clash part |
| Layout | two columns, side by side | ◐ auto-fit grid wraps lane 2 under lane 1 |
| Resolve | "Keep this Mac's version" | ✅ Keep this · Dismiss per copy, synced, works offline |
| Many copies | — | ✅ lanes per writer and part, "N earlier" folded |

Verdict: keep B's structure (quiet line, lanes, fold, Keep this and Dismiss). These are owner-visible follow-ups, flagged rather than decided: name the writer (device name, or "Studio / CLI" for unsigned), add a word-level diff highlight, fix two columns with lanes stacked inside the right one, and make Keep this undoable, since it overwrites the main's text without a copy.

## Changes for the lead

Commit `judge(copy-rule)` on branch `judge-hybrid`, on top of B (1564edb):

| File | Change |
|---|---|
| `app/src/replica/merge.ts` | `copyKey = ${key}~${digest(canon(sorted clash))}`; `typedFrom` filter before `collapse`; `mergeLocal` writes `_typed`; `baseFor(base, sent[], theirs)` part by part |
| `app/src/replica/note.ts` | `_typed?: string[]` (never in `STORED`, so never pushed) |
| `app/src/replica/db.ts` | `Entry.sent?: NoteDoc[]` |
| `app/src/sync/push.ts` | append to `sent` (up to 8); strip `_typed` before signing |
| `app/src/replica/settle.ts` | pass `sent` to `baseFor`; clear `sent` with `pushed`; keep `_typed` on `show()` and `ack()` |
| `app/src/replica/sign.ts` | export `digest` |
| `contracts/barkpark/README.md` | copy `_key` format |
| `app/src/chaos/world.ts` (bot branch) | echo check reads the rev as `c._key.split('~')[0]`; also pin `new Date()` to the simulated clock, not just `Date.now` (that's the cause of the 7985 flake) |

Tests:

| Test | Update |
|---|---|
| `copies.test.ts` "two writers typing in one block…" | back to main's assertion: one copy, the other writer's latest. The hybrid proves it: each writer typed from its own last text |
| `copies.test.ts` "two tabs…" | one copy, the other tab's latest |
| `echo.test.ts` bug 1 | the copy the canvas typed from (`R1`, "Plan A1") goes; "Plan OFF-B" stays |
| `echo.test.ts` bug 6 ×3, `merge.test.ts` ×2 | compare `_key.split('~')[0]` |
| `echo.test.ts` all `baseFor` calls | take an array |
| `chaos.test.ts` | drop the `todo` marks: strict is green, 7/7 |
| **to add** | seed 2337 (key collision), 1052 (echo after a lost reply on reload), 7424 (narrow-label removal), and a `_typed` unit test |

Decision record: supersede 0021 and 0022. A copy goes only when it's an exact duplicate, when the main holds it, when the person dismisses it, or when I typed from every one of its clashing texts. 3b becomes "kept, folded".

## Runs

| Ran | Result |
|---|---|
| Hybrid chaos, strict, 1–50,000 and 50,001–100,000 (real clock) | 0 failing; 3.34 and 3.37 copies per note |
| Hybrid chaos, 10,000 solo | 0 copies |
| Hybrid `CHAOS_STRICT=1 chaos.test.ts` | 7/7 |
| Hybrid unit tests (`src/*/*.test.ts scripts/*.test.ts`), `tsc --noEmit`, `check-repo` | 105 pass, 0 fail, 5 todo; ok; ok |
| Storm, 10 min: B, hybrid, main; A for 1 min (its 10-min run passed 9 CPU-minutes and was stopped) | table above |
| A with each cause patched, 10k each | table in §1 |

**Unrun:** e2e, J10, the Mac app, and B's real-app pile-up probe (52 copies in 5 s; the storm sim gives 8 in 5 s). No screenshots of the hybrid: its UI is B's, unchanged. Barkpark's document size limit at 488 copies (815 KB) is also unchecked.
