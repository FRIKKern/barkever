# 0031 A task is a checklist line in its note

Accepted 2026-10-30 by the lead.

```
note.body ─ list {task: true, items: [{content | text, checked, children?}]}
     │ local replica, offline too
     ▼
Tasks board  ?view=tasks   column per notebook ─ card per checklist ─ row per line
     │ click a row
     ▼
note  ?n=<note>&line=<block>:<item>:<words hash>:<twin>   scrolled to that line, line marked
```

**Decision.** The board is a view over checklists in note bodies. A task's state is the item's `checked`. No task type, nothing extra in Barkpark. A nested line opens at its top-level line.

**Why.** The line is where the task lives, so the link is free. Nothing syncs twice; it works offline.

**Instead of.** A `task` document per line: a second type to keep in step with every edit.

**Line moved.** Items have no stable key; the words hash and `twin` (which line with those words) find it:

| Link opens on | Marks |
|---|---|
| same checklist, that twin still there | that twin, wherever it moved |
| same checklist, fewer twins now | the nearest line with those words |
| words moved to another checklist | the first line with those words there |
| words changed or gone | nothing; the note says "That line has moved or been deleted." |

A link drops its line on the first local edit.

**Limits.** A twin added above, or twins reordered, can swap marks. A line with no text is not a task.

**Owner pick.** Rows draw a checkbox but open the note; the reference ticks in place (task-d513c740903d25ce).
