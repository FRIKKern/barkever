# 0017 Conflicts: keep both inside the note

Accepted 2026-10-29. Shapes the "keep both" of 0011.

```
mine ─┐                       ┌─► note (mine where they clash, both where they don't)
base ─┼─► merge field + block ┤
theirs┘                       └─► note.conflicts[] += {_key: theirs._rev, at, title, body, clash[]}

UI: [ This version | Other version | Other version … ]  clashing parts highlighted
```

**Decision.** Merge field by field and the body block by block (block `id`). Where both sides changed the same field or block, the note keeps my value and appends their whole version to `conflicts[]`, keyed by their `_rev` so two devices recording the same version store it once. An edit beats a delete, for a note and for a block. `conflicts[]` itself merges three-way by key, so removing one on any device removes it everywhere.

**Why.** One document stays one document: links, search and the list keep working, and the other version syncs to every device like any field. J10 passes with it (3 versions of one block, side by side).

**Instead of.** A conflict copy as a second note (doubles the note in lists, search and backlinks); a local-only conflict (other devices never see it).

**One device.** Tabs share one replica and outbox. A canvas save applies its block ops to the replica's current body, so tabs editing different blocks both land. The same block typed in two tabs at once: the later write wins, no conflict copy.

**Open.** Resolving (pick a version, drop the copy). The view sits above the body in C's editor column (0016).
