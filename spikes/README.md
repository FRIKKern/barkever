# Spikes

Rival tests for decisions we weren't sure about. Same tests per pair, real Barkpark (`-w barkever`, one dataset per spike).

```
note storage ── A note-type  ✅ won ──► decision 0013
             └─ B note-paper ✗ lost (two revision counters, title overwrite, publish wall)

offline sync ── C sync-sse   ◐ fast, full docs, loses in-flight commits
             └─ D sync-pull  ◐ misses deletes, same in-flight loss
                    both ──► decision 0014: stream + manifest check, Barkpark fix upstream
```

| Spike | Question | Verdict | Report |
|---|---|---|---|
| A | Notes as our own `note` + `notebook` types | Won | [note-type/REPORT.md](note-type/REPORT.md) |
| B | Notes as Barkpark Papers | Lost | [note-paper/REPORT.md](note-paper/REPORT.md) |
| C | Catch-up via listen SSE + `Last-Event-ID` | Kept as the main path | [sync-sse/REPORT.md](sync-sse/REPORT.md) |
| D | Catch-up via `_updatedAt` pull queries | Kept as the safety check | [sync-pull/REPORT.md](sync-pull/REPORT.md) |

Spike code is evidence, not product code. Scripts read the token inside Node from `~/.config/barkpark/config.json` and never print it.
