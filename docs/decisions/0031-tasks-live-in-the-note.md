# 0031 A task is a checklist line in its note

Accepted 2026-10-30. Builder's pick; the lead agreed.

```
note.body ─ list {task: true, items: [{content | text, checked, children?}]}
     │ local replica, offline too
     ▼
Tasks board  ?view=tasks   column per notebook ─ card per checklist ─ row per line
     │ click a row
     ▼
note  ?n=<note>&line=<block id>:<item>:<text sum>   scrolled to that line, line marked
```

**Decision.** The board is a view over checklists in note bodies. A task's state is the item's `checked`. No task type, nothing extra in Barkpark. A nested line opens at its top-level line.

**Why.** The line is where the task lives, so the link is free. Nothing syncs twice; it works offline.

**Instead of.** A `task` document per line: a second type to keep in step with every edit.

**Line moved.** Items have no stable key; the words' hash finds the line:

| Link opens on | Marks |
|---|---|
| same index, same words | that line |
| words moved in the same checklist | the nearest line with those words |
| words moved to another checklist | the first line with those words there |
| words changed or gone | nothing; the note says "That line has moved or been deleted." |

A link drops its line on the first local edit, so typing never re-aims the mark.

**Limits.** Two lines with the same words in one checklist can swap marks after a move. A line with no text is not a task.
