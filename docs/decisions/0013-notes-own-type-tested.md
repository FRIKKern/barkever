# 0013 Notes: own type, tested

Accepted 2026-10-29. Refines 0005 with spike evidence.

```
note { title, notebook ─► notebook { name, parent? }, tags[],
       body: richText editor:"blocks" (vocabulary incl. wikilink),
       links[] ─► note   ◄─ app mirrors body wikilinks here on save }
reads: perspective=drafts
```

**Decision.** Notes stay Barkever's own `note` and `notebook` types. The body is a block-editor field (`"editor":"blocks"` with `wikilink` in its vocabulary) so bp-paper-canvas can write it. On every save the app copies body wikilinks into `links[]`, so backlinks work on drafts. Reads use `perspective=drafts`.

**Why.** Spike A passed every test on the real stack, including a canvas round trip in a real browser. Spike B (Papers) lost: two revision counters that ignore each other, restore rewinding `rev`, and edits overwriting the title. See `spikes/README.md`.

**Instead of.** Papers as notes.

**Upstream.** Barkpark should index draft body links and make the block-ops door answer a stale rev with 412. Once it does, `links[]` mirroring can go.
