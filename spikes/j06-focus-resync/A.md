# Spike A: the canvas owns the focus event

```
focus ─► Tiptap focusEvents (prio 100, returns false)
      ─► bpFocusResync plugin (prio 1)  ── does prosemirror-view 1.42.6 handlers.focus:
             lastFocus, domObserver.stop/start, ProseMirror-focused, view.focused = true
             setTimeout 20 ms: if NO key since focus and DOM ≠ last read → view.focus()   (= selectionToDOM)
         returns true ─► prosemirror-view's own handlers.focus is skipped
keydown ─► bpFocusResync marks "keyed": the 20 ms resync no longer writes
```

Barkpark branch `j06/focus-resync-a` at d54bb9efdb, on top of the shared red test `j06/focus-resync-red` at 21091298af (off origin/main afb406353f). Local only, not pushed. Worktree: `../barkpark-wt/j06-focus-a`. Task: task-8ee0303670720913.

Diff against the red test: +154/-1 in 4 files. New `src/canvas/focus-resync.js` (55 lines), 2 lines in `index.js` (import + `focusResync()` in the extension list), the second test, and both tests in `npm test`.

## Results

| check | main | A |
|---|---|---|
| `__focus_resync_keeps_caret_mounted` (shared red: hold the resync, type, move the DOM caret up, fire it) | 2 FAIL: DOM and canvas caret back on "Buy packing tape" | all PASS |
| canvas-retry-2's `__focus_resync_queued_mounted` (DOM caret elsewhere at focus, `view.dom.focus()`, so every PM version queues the timer) | 2 move checks FAIL | 4/4 PASS |
| `__focus_resync_without_keys_mounted` (no key since focus: the resync still writes PM's caret back; Tiptap still sees the focus) | PASS (resync half) | all PASS, incl. `editor.isFocused`, `view.focused`, `ProseMirror-focused` |
| nested only through heavy, local canvas bundle, marker check that the bundle is the one named | 1 red / 20 (control) | **0 red / 35** (10x + 25x, marker 35/35) |
| paper-editor `npm test` chain on A (test + posttest; pretest without `__path_filter`) | | all green |
| `__path_filter.test.mjs` (pretest) | red on main too: `api/priv/portable_doc/goldens/ops/` missing from paper-editor.yml | same, unrelated |

Main's red rate for nested only across today's watcher runs: 13 in 80 (about 16%). At that rate, 35 greens in a row by luck is about 0.2%.

The first form of A failed and is replaced. It queued a second 20 ms timer first, to read the DOM selection before PM's resync. That was green in JSDOM but red 1 in 10 in Chrome, because the logged reds showed a key running between the two same-delay timers. Owning the event removes PM's timer instead of racing it.

Logs are in the j06-plan scratchpad `nested-snap/`: `spikeA2-10x.log`, `spikeA2-25x.log`, `control-main-20x.log`, `spikeA-npmtest*.log`, `spikeA-pretest.log`, and `spikeA-10x.log` for the failed first form.

## How the e2e ran against a local canvas

`local-canvas.patch` (next to this file): when `CANVAS_BUNDLE` is set, `watchEditor` routes `**/bp-paper-editor.bundle.js` to that file. The bundle is built with `npx esbuild src/index.js --bundle --format=iife --minify --outfile=<scratch>`. A scratch marker spec checks that the editor's plugins include (or lack) `bpFocusResync$`, so a stale or cached bundle can't pass silently.

```
CANVAS_BUNDLE=<A bundle> node ../scripts/heavy.mjs pnpm e2e e2e/canvas-marker.spec e2e/j06-plan.spec -g "CANVAS_BUNDLE|nested only" --repeat-each=25 --retries=0
```

## Risk to ProseMirror internals

| touch | public? | if prosemirror-view changes it |
|---|---|---|
| `view.input.lastFocus` | internal | PM reads it in selection handling; a rename leaves PM's value stale |
| `view.domObserver.stop/start`, `.currentSelection.eq` | internal | a rename throws in the focus handler, and every focus breaks loudly |
| `view.focused`, `view.docView` | internal fields | same as above |
| `view.hasFocus()`, `view.domSelectionRange()`, `view.focus()` | public | stable |
| handlers.focus body copied | internal | **silent drift**: new logic added upstream to handlers.focus never runs |
| plugin returns true for focus | — | any focus handler registered after `bpFocusResync` (priority ≤ 1) is skipped. Today only Tiptap's focusEvents handles focus, at priority 100, and it runs first |

Mitigation, if A wins: a tripwire test that reads `node_modules/prosemirror-view/src/input.ts`, extracts `handlers.focus`, and compares it with the 1.42.6 body, so an upgrade fails until someone re-checks the copy.

What A can't do: a non-canvas ProseMirror editor in Barkpark keeps the bug.

## Against B2 (prosemirror-view 1.42.9)

```
            fix lives in         copies PM internals   other PM editors   cost on each PM upgrade
A           canvas plugin        yes (5 fields)        still broken       re-read handlers.focus, re-diff the copy, rerun the tripwire
B2 (1.42.9) upstream PM          no                    fixed              none beyond the usual lock bump
```

Upstream 1.42.9 (2026-10-31) fixes the same bug: "a selection change right after focus overwritten by the old selection". It queues the 20 ms resync only when the DOM caret at focus already differs from what PM last read.

Every PM upgrade would cost A something. Someone has to read the new `handlers.focus`, diff it against the copy, and update the copy or the tripwire. If they skip it, upstream focus fixes silently never reach the canvas, and once 1.42.9 is installed, A would be overriding a fixed handler with an older copy. A's one edge is its no-key rule: a key since focus always wins, whatever the DOM looked like at focus. B2 has no such rule, and I have no case where that matters.

If B2's 10x is green, B2 should win. A then stays as the fallback.

A note on the shared test: its first check, "focus queued ProseMirror's resync", reads red under 1.42.9. That's because `view.focus()` syncs the caret before focus, so 1.42.9 queues no timer at all. That check fails because PM's internals changed, not because the bug is back. If B2 lands, use canvas-retry-2's `__focus_resync_queued_mounted` as the red test (A passes it 4/4 too), or drop that first check.
