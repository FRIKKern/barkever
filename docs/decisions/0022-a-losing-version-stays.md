# 0022 A losing version stays until its writer replaces it

Accepted 2026-10-29. Supersedes the "drop" rows of 0021.

```
drop:  copy by me,  every part I typed over, starting from the copy's text  ─► my newer text is the main
       copy by who, every part in this clash (who ≠ me)                    ─► the new copy holds who's latest
keep:  everything else. Typing on the main never drops a copy.
```

| Review 4 repro | Before | After |
|---|---|---|
| Both type the title; the loser types "!" on the winner's title | its title gone everywhere | kept, labelled "Your version" on its own device |
| The same in one block | gone | kept |
| Offline title wins; the online writer types on it | gone | kept |

**Why.** A copy by me is not always my *earlier* text. It can be my text that lost, and my next edit builds on the winner's. Only an edit that started from the copy's text (its text was the merge base) replaces it. If that is unclear, keep the copy: an extra version is better than lost text.

**Limits.** A copy of mine whose text was not my merge base stays as "Your version", even if my newer text grew from it (J10 and the two-typist e2e show no such copy). A writer's next clash on the same parts replaces its earlier copy, even when that next text was typed over the main. Copies do not hold notebook or tags.

**Instead of.** Comparing text for prefixes, or authorship per part.
