# 0031 A task is a checklist line in its note

Accepted 2026-10-30. Builder's pick, sent to the lead before building.

```
note.body ─ list {task: true, items: [{content | text, checked, children?}]}
     │ local replica, offline too
     ▼
Tasks board  ?view=tasks   column per notebook ─ card per checklist ─ row per line
     │ click a row
     ▼
note  ?n=<note>&line=<block id>:<item>   scrolled to that line, line marked
```

**Decision.** The board is a view over checklists in note bodies. A task's state is the item's `checked` in its note. There is no task type and nothing extra in Barkpark. A line address is the list block's id plus the item's index; a nested checklist line opens at its top-level line.

**Why.** "Links back to its line" comes free: the line is where the task lives. Nothing syncs twice, so the board can't drift from the note, and it works offline from the replica. No task document exists to leak onto the bp board (decision 0006).

**Instead of.** A `task` document per line pointing at its note: a second type to keep in step with every body edit, with its own conflicts.

**Limits.** Adding a line above a task shifts the index, so an old `line=` URL marks the line now at that place. A line with no text is not a task.
