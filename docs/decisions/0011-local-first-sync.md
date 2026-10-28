# 0011 Local first: offline, then sync

Accepted 2026-10-28.

```
 device                                      cloud
┌──────────────────────────────┐          ┌───────────────────┐
│ UI ─► local replica          │ push ──► │ Barkpark          │
│       (IndexedDB, web + Mac) │ mutate + │ workspace         │
│       outbox of edits        │ ifRev    │ "barkever"        │
│                              │ ◄── pull │ listen SSE        │
└──────────────────────────────┘ changes  └───────────────────┘
conflict ─► three-way merge ─► still conflicting ─► keep both, show side by side
```

**Decision.** Every device keeps a full local replica of the user's notes in IndexedDB, in the browser and in the Mac app alike. The UI only reads and writes the replica. A sync engine pushes an outbox of edits with `ifRevisionID` and pulls changes over listen SSE. Conflicts get Studio's three-way merge; anything left keeps both versions.

**Why.** Typing never waits on the network (J01), notes open instantly (switch < 100 ms), and an hour offline loses nothing (J10). Studio already has the merge and the pending-edit store.

**Instead of.** Online-only with a short offline buffer; bundling a local Barkpark and Postgres (made Barkdown 456 MB).

**Open.** Does Barkpark expose a changes-since-cursor feed for catch-up after long offline? P1 finds out; if not, it's fixed in Barkpark.
