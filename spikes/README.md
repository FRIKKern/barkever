# Spikes

Rival tests for decisions we weren't sure about. Same tests per pair, real Barkpark (`-w barkever`, one dataset per spike).

```
note storage ── A note-type  ✅ won ──► decision 0013
             └─ B note-paper ✗ lost (two revision counters, title overwrite, publish wall)

offline sync ── C sync-sse   ◐ fast, full docs, loses in-flight commits
             └─ D sync-pull  ◐ misses deletes, same in-flight loss
                    both ──► decision 0014: stream + manifest check, Barkpark fix upstream

local replica ─ E replica-tanstack-db ✗ young library, merge not built
              └ F replica-idb         ✅ won ──► decision 0015

copy rule ───── G copy-rule-ancestry  ✗ lost (464 lost seeds / 10k)
             └─ H copy-rule-never-drop ◐ won + 3 fixes (copy-rule-judge) ──► decision 0027

focus resync ── I j06-focus-resync/A  ✗ lost (copies PM's focus handler)
             └─ J j06-focus-resync/B  ✅ won: prosemirror-view 1.42.9 ──► decision 0034
```

| Spike | Question | Verdict | Report |
|---|---|---|---|
| A | Notes as our own `note` + `notebook` types | Won | [note-type/REPORT.md](note-type/REPORT.md) |
| B | Notes as Barkpark Papers | Lost | [note-paper/REPORT.md](note-paper/REPORT.md) |
| C | Catch-up via listen SSE + `Last-Event-ID` | Kept as the main path | [sync-sse/REPORT.md](sync-sse/REPORT.md) |
| D | Catch-up via `_updatedAt` pull queries | Kept as the safety check | [sync-pull/REPORT.md](sync-pull/REPORT.md) |
| E | Replica on TanStack DB + offline-transactions | Lost | [replica-tanstack-db/REPORT.md](replica-tanstack-db/REPORT.md) |
| F | Replica on `idb` + TanStack Query + own outbox | Won | [replica-idb/REPORT.md](replica-idb/REPORT.md) |
| G | A copy drops only when a kept text covers it (ancestry stamps) | Lost | [copy-rule-ancestry/REPORT.md](copy-rule-ancestry/REPORT.md) |
| H | Never drop a kept copy; Keep this · Dismiss | Won, plus three fixes | [copy-rule-never-drop/REPORT.md](copy-rule-never-drop/REPORT.md), [copy-rule-judge/JUDGE.md](copy-rule-judge/JUDGE.md) |
| I | The canvas owns PM's focus event so its resync can't undo a key | Lost | [j06-focus-resync/A.md](j06-focus-resync/A.md) |
| J | Take upstream's fix: prosemirror-view 1.42.9 (B2; B1 patch as fallback) | Won | [j06-focus-resync/B.md](j06-focus-resync/B.md), [j06-focus-resync/JUDGE.md](j06-focus-resync/JUDGE.md) |

Spike code is evidence, not product code. Scripts read the token inside Node from `~/.config/barkpark/config.json` and never print it.
