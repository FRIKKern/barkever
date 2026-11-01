# J06 focus resync, spike B: take upstream's fix (prosemirror-view 1.42.9)

```
focus ──► PM queues a 20 ms resync ──► (under load the timer starves)
                                           │
user types, ArrowUp moves the DOM caret ───┤   selectionchange not read yet
                                           ▼
1.42.6: timer sees DOM ≠ last read ──► writes PM's old caret back      ✗ snap-back
1.42.9: timer runs only if the DOM caret has not moved since focus     ✓ user's move kept
```

| | |
|---|---|
| Change | `api/assets/paper-editor/package-lock.json`: prosemirror-view 1.42.6 → 1.42.9 (3 lines: version, resolved, integrity), plus the regenerated third-party notices (1 version line each). No package.json dependency change: @tiptap/pm 3.31.4 asks `^1.42.3`. |
| Upstream | [prosemirror-view CHANGELOG 1.42.9](https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md#1429-2026-10-31) (2026-10-31): "Fix an issue that could cause a selection change right after focus to be overwritten by the old selection." `handlers.focus` (src/input.ts:845) now records the DOM caret at focus and resyncs only if it is unchanged 20 ms later. |
| Barkpark | PR branch `j06/prosemirror-view-1.42.9` at `a54be1e9be` on origin/main `03b57020ec` (bump, test, notices, rebuilt bundle; not pushed), worktree ../barkpark-wt/j06-pm-1429. Spike branch `spike/j06-focus-b2` at `1c83f340fe` (the bump + B2's test `221198d5a1`, then notices `220318c2e2`), off j06-plan's red `j06/focus-resync-red` `21091298af` (origin/main `afb406353f`). Worktree ../barkpark-wt/j06-focus-b2 |
| Barkever | `barkever-wt/j06-focus-b` at `8cfc68a`: `e2e/local-canvas.ts` serves a local bundle when `BARKEVER_LOCAL_CANVAS` is set, and fails a run that never served it. **Spike-only, never lands.** |

## Install

Clean `npm ci` in barkpark-wt/j06-focus-b2/api/assets/paper-editor (node_modules trashed first), then `npm ls prosemirror-view`, before every result below:

```
@barkpark/paper-editor@1.0.0
└─┬ @tiptap/pm@3.31.4
  ├─┬ prosemirror-dropcursor@1.8.2
  │ └── prosemirror-view@1.42.9 deduped
  ├─┬ prosemirror-gapcursor@1.4.1
  │ └── prosemirror-view@1.42.9 deduped
  ├─┬ prosemirror-history@1.5.1
  │ └── prosemirror-view@1.42.9 deduped
  ├─┬ prosemirror-state@1.4.4
  │ └── prosemirror-view@1.42.9 deduped
  ├─┬ prosemirror-tables@1.8.5
  │ └── prosemirror-view@1.42.9 deduped
  └── prosemirror-view@1.42.9
```

The 1.42.6 and B1 columns swap only `node_modules/prosemirror-view` (1.42.6 from `npm pack prosemirror-view@1.42.6`; B1 = that plus the postinstall patch), then restore the 1.42.9 install.

## Red → green

| Test | 1.42.6 (main) | 1.42.9 (B2) | B1 fallback (1.42.6 patched) |
|---|---|---|---|
| j06-plan's shared `__focus_resync_keeps_caret_mounted` | **2 FAIL** (DOM caret, canvas caret back on "Buy packing tape"), 2 PASS | 3 PASS, 1 FAIL: "focus queued ProseMirror's resync" | 4/4 PASS |
| B2's `__focus_resync_queued_mounted` (DOM caret already elsewhere at focus, so every version queues the resync) | queued PASS, **2 FAIL** (move lost), no-move PASS | **4/4 PASS** | 4/4 PASS |

- The shared test's one 1.42.9 FAIL is its precondition, not the bug: it focuses with `view.focus()`, which syncs the caret first, and 1.42.9 queues no timer in that case. Its 3 behavior checks pass, but they don't touch the new code. B2's test sets the DOM caret elsewhere, then focuses, so 1.42.9's timer is queued and its new guard is what keeps the move.
- B2's test also pins what upstream kept: with no move after focus, the resync still puts the canvas's caret in the DOM.

## Suite, e2e

| Run | Where | Result |
|---|---|---|
| **PR `npm test`, plain chain** (pretest + test + posttest, stops at the first failure) | `j06/prosemirror-view-1.42.9` a54be1e9be on origin/main 03b57020ec, via heavy, 12:51–13:01 local | **exit 0** (597 s). Log: scratchpad/j06-b/pr-suite.log |
| Spike suite, every step with a keep-going runner (scratchpad/j06-b/run-chain.mjs), NODE_V8_COVERAGE on | `spike/j06-focus-b2` 1c83f340fe on afb406353f, via heavy, 12:47–12:58 | 287 of 289 pass. The 2 FAILs are known and neither comes from 1.42.9: `__path_filter.test.mjs` is red on afb406353f itself (same exit on origin/main + B1 with 1.42.6; fixed on main by 03b57020ec, which the PR branch has), and the shared `__focus_resync_keeps_caret_mounted` fails only its "queued" precondition (see Red → green). Log: scratchpad/j06-b/suite-1.42.9.log |
| J06 nested only 1x, local B2 bundle (sha256 `527c773deae49db3…`) | barkever-wt/j06-focus-b 75ed55d, via heavy, no land.mjs | 1/1 green, bundle served |
| J06 nested only **10x**, same bundle | same, 12:48–12:50 | **10/10 green** (2.6 min), served in every run, 0 guard failures |
| J06 nested only **20x**, same bundle | same, 13:01–13:05 | **20/20 green** (4.6 min), served in every run, 0 guard failures |
| Baseline | not rerun (lead's call) | main is about 16% red (j06-plan: 1 of 20 on a local main bundle; 4 of 20 on nested-watch). An unrouted run of mine on guerrilla's live editor was 1 of 10 red (12:15–12:17, see below) |

30 of 30 green on the B2 bundle. If B2 changed nothing, 30 greens at a 16% red rate would come by luck about 0.5% of the time (0.84^30).

The PR's committed `bp-paper-editor.bundle.js` (a54be1e9be) is byte-identical to the bundle these e2e runs served.

### The red at 12:17 (11:17 UTC) was not B2

The first B2 10x served no local bundle. The app's service worker answers `/editor-assets/v/` itself (app/src/worker/sw.ts:86), so `page.route` never saw the request, and every run loaded guerrilla's live editor. The served-guard failed all 10. Inside those runs, 9 passed the J06 steps and 1 hit the real snap-back ("the caret moved up to the parent line"). Fixed in f6f1112 (rewrite `/editor-files` to a fixed local path) and 75ed55d (block service workers when `BARKEVER_LOCAL_CANVAS` is set). Every run counted above passed the guard.

## 1.42.7 decoration paths (review-24788's list)

1.42.7 changed decoration-set updates ("lots of node decorations inside a single parent"), `posAtDOM` and backspace detection. Each of the node decorations below has a suite test that asserts its output:

| Path | Decoration | Asserted by (in the npm test chain) | Runs on 1.42.9 (V8 coverage of the suite run) |
|---|---|---|---|
| src/canvas/index.js:1096 | empty locked title: `is-empty`, `data-placeholder` | canvas/__title_enter_caret.test.mjs:236, 243 | ran in 1 test process |
| src/canvas/inline-object.js:815 | inline atom: `role="img"`, `aria-label` | canvas/__inline_object_mounted.test.mjs:130 | ran in 5 test processes |
| src/canvas/inline-object.js:826 | object block with fields: `role="group"`, `aria-label`, `data-object-editable` | canvas/__object_block_fields_mounted.test.mjs:122–124, canvas/__object_block_row_mounted.test.mjs:78 | ran in 12 test processes |
| src/canvas/resting-scaffolds.js:59 | `bp-resting-scaffold` | canvas/__resting_scaffolds.test.mjs, canvas/__title_enter_caret.test.mjs | ran in 33 test processes |

Coverage is read with scratchpad/j06-b/cov-lines.mjs (the innermost V8 block range holding the line's first token has count > 0). Checked first on one test: __title_enter_caret runs index.js:1096 and resting-scaffolds.js:59, and not the two inline-object lines.

## Widget regression check (1.42.6 → 1.42.8)

1.42.8 fixed "a regression since 1.42.6 that causes widgets that render as non-element nodes to no longer be wrapped, and document fragment widgets to be entirely dropped". Main runs 1.42.6, so it has that regression today; 1.42.9 removes it. No widget in the bundle is affected either way: every `Decoration.widget` returns an element.

| Widget | Renders |
|---|---|
| src/canvas/remote-selections.js:214 remote caret | `span` |
| src/canvas/resting-scaffolds.js:30 scaffold control | `button` |
| src/canvas/wikilink-titles.js:82 wikilink label | `span` |
| prosemirror-gapcursor gap cursor | `div` |
| prosemirror-tables column resize handle | `div` |

## Risk to PM internals, upkeep

| | B2: bump to 1.42.9 | B1 fallback: patch 1.42.6 |
|---|---|---|
| What changes | upstream code, three releases (1.42.7–1.42.9): selection reads, Safari shadow root, backspace on Chrome Android, composition Enter/Backspace, decoration-set speed, the widget fix above | one condition in `handlers.focus`: resync only if no selection input (`lastSelectionTime`) came after focus |
| Touches PM internals | no | yes: reads `view.input.lastFocus` and `lastSelectionTime`, private fields with no API promise |
| Upkeep | none: later bumps carry the fix | postinstall `scripts/patch-prosemirror-view.mjs`, pinned to 1.42.6; any other version, or a moved anchor, fails `npm ci`, so every bump has to look at it again |
| Age | released 1 day before this spike | n/a |

B1 fallback is on `spike/j06-focus-b` at `c10b3be8d3`: its unit test went red → green, 4/4 mutants killed, and a wrong version or a moved anchor exits 1. Its plain local build is byte-identical to the committed bundle. Upstream's guard is narrower than B1's (a caret that moved since focus, for any reason) and needs no private fields.

## Lands with it (if B2 wins)

- The rebuilt `api/priv/static/assets/bp-paper-editor.bundle.js` (the CI freshness gate rebuilds after `npm ci` and diffs it).
- THIRD-PARTY-NOTICES: the version shows there, so `220318c2e2` regenerates them (`npm run notices:check` exit 0 after, 1 before).
- Tests: only `__focus_resync_queued_mounted` (red on 1.42.6, green on 1.42.9). It is the shared test with the precondition fixed (the DOM caret is elsewhere when focus lands, so both versions queue the timer), plus the no-move case. The shared `__focus_resync_keeps_caret_mounted` does not go in: on 1.42.9 its "queued" check fails, and Barkpark main can't carry a test known to fail. In the spike branch it runs last in posttest only to satisfy the test-chain census.
