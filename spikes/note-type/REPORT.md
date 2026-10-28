# Spike A: notes as their own type — won

```
 notebook { name, parent? } ◄── ref ── note { title, notebook, tags[], links[] ──► note
                                             body: richText editor:"blocks"
                                                   vocabulary incl. wikilink }
 every write ──► drafts.<id>        publish ──► <id>
```

| Test | Result | Evidence |
|---|---|---|
| Schemas apply | ✅ | `schema/note.json`, `schema/notebook.json` |
| Create 5 notes in 2 notebooks, `ifRevisionID` edit, stale rev | ✅ stale → `412 precondition_failed` | `out/01-create-and-conflict.txt:230,244` |
| Backlinks from a `links[]` reference field | ✅ live on drafts | `out/02-links-search.txt:62` |
| Backlinks from a wikilink in the body | ⚠️ only once published | `02:51`, `04:114` → `02:393` |
| Search a body word | ⚠️ drafts need `perspective=drafts` | `02:156`, `02:183` |
| History + restore | ✅ | `03:2`, `03:91,127` |
| bp-paper-canvas load → type → save → read back | ✅ headless Chrome, ops door fenced on `_rev` | `05-canvas.mjs`, `out/05-canvas.txt` |
| Capture: create + publish in one batch | ✅ median 59 ms, p95 72 ms | `out/06-capture-timing.txt` |
| Required fields enforced | ❌ advisory warning only | `01:246-303` |

**Surprises.** A plain `richText` body is refused by the canvas write path (422); it needs `"editor":"blocks"` and a vocabulary naming `wikilink`. Plain mutate accepts wikilinks without one. A stale rev with the wrong vocabulary gets 422, not 412. `backlink-counts` never counts body links.

**For.** Everything works on the real stack today with no publish wall.
**Against.** Body links and default search ignore drafts, so Barkever mirrors body wikilinks into `links[]` until Barkpark indexes draft bodies.
