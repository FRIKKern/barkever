# Spike B: notes as Papers — lost

```
 notebook { _id nb-work, title, stack } ◄── paper { _id note-<uuid> (drafts.<id>)
                                                notebook: "nb-work"
                                                blocks[0] = locked h1 title
                                                related[] {_ref}
                                                rev (int, ops ifRev) · _rev (hash, mutate)
                                                description + tags: only to publish }
```

| Test | Result | Evidence |
|---|---|---|
| Draft with no tags or description | ✅ | `01-quick-capture.mjs` |
| Publish | ⚠️ heavy: 20+ char description, weighted registered tags | `01b`, `01c` |
| Notebooks and stacks | ✅ | `03-notebooks-and-ops.mjs` |
| Ops edit with `ifRev`, stale rev | ✅ 412 | `03b-ops-ifrev.mjs` |
| Body-link backlinks on drafts | ❌ only after publish; `related[]` works | `04`, `04b`, `04c` |
| Search a body word, typo tolerant | ✅ | `06-search.mjs` |
| History + restore | ✅ | `07-history-restore.mjs` |
| bp-paper-canvas load → type → reload | ✅ in Chrome | `canvas-host/` |
| Capture timing | ✅ median 38 ms | `09-timing.mjs` |

**Why it lost.**
- An ops edit overwrites `title` with the slug unless block 0 is a locked title heading (`05-title-after-ops.mjs`).
- Two revision counters (`rev` int, `_rev` hash) don't see each other: a mutate rename leaves `rev` alone, so a stale ops write is accepted (`07b-rev-fences.mjs`).
- Restore rewinds `rev`, so a client holding an old rev is accepted (ABA). That breaks `ifRevisionID` sync.
- The flat Bulldocs door can't reach a non-default workspace; only `/w/:ws/p/:proj/v1/papers/:slug/ops` works.

**Worth borrowing.** Typo-tolerant search on drafts; the terminal reader; share-as-Paper later.
