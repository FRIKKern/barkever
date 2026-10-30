# 0028 Search matches a link's stored words; views show the current title

Accepted 2026-10-30. Lead's call.

```
stored body ──► blockText ──► search index, hit-line match, merge, ConflictView, chaos truth
            └─► shownText(title) ──► list line, search hit line, backlink line, graph tip, link card, read-only body
link shows the title when: no alias, words === stored target, its docId names a note (canvas 1.18's paint check, read from its bundle: no alias, words === target, resolved)
no such note ──► stored words; the read-only body strikes it through and doesn't link it
```

| Note B links "Tide gauge: spring check", since renamed "autumn check" | Search "spring" | Search "autumn" |
|---|---|---|
| Is B found? | yes | no |
| B's hit line | "Check Tide gauge: autumn check" (no "spring" to highlight) | none |

**Why.** A rename writes only the renamed note. Indexing live titles would re-index every note that links to it on each rename. Evernote doesn't find a linking note by the new title either. Merge and the conflict view compare stored versions, so a rename makes no false conflict.

**Limits.** A search for a word that sits only in an old title finds the note, but the line shown may not hold that word. A conflict copy shows its links' stored words.
