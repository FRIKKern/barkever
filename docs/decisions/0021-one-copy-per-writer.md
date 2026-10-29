# 0021 One kept copy per other writer

Accepted 2026-10-29. Supersedes the "new clash drops an unshared copy keyed by the base rev" row of 0019.

```
push:  note.by = <device>.<sum of content>        raw write (CLI, Studio) ─► sum fails ─► "unsigned"
clash: copy.by = writer of theirs                 local save: writer of the server change, else <device>~tab
drop:  copy by me,  every part I changed and kept ─► my newer text is the main
       copy by who, every part in this clash     ─► the new copy holds who's latest
```

| Before (review 3) | After |
|---|---|
| Two devices typing in one block: 11 copies after 12 saves | 1, the other device's latest |
| A raw writer setting the title 6 times while I type: 6 copies | 1, its latest |
| My own earlier text came back as an "Other version" | Never |

**Why.** A copy keyed by rev alone can't tell a newer version of the same writer from a new writer. The sum makes the stamp honest: a writer that changes content without signing is "unsigned", never mistaken for the last device that signed.

**Limits.** All unsigned writers count as one. A copy of a writer whose newer text was adopted into the main without a clash stays until the next clash on that part. Copies from before this (no `by`) are never dropped.

**Instead of.** Barkpark authorship per revision (one account spans many devices); dropping copies whenever theirs moved a part (loses a copy when two writers changed it between catch-ups).
