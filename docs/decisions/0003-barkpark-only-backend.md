# 0003 Barkpark is the only backend

Accepted 2026-10-28.

```
browser ─► src/server/** ─► Barkpark API
   ✗ browser ─────────────► Barkpark   (build fails)
```

**Decision.** Only `src/server/**` talks to Barkpark, always with the signed-in user's own token. The build fails on any other import, as in Studio and Pensum.

**Why.** One source of truth, one auth model, no second database to drift.

**Instead of.** A sidecar database or our own API server.
