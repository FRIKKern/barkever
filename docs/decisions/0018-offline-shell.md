# 0018 Offline shell: a service worker keeps the last good page

Accepted 2026-10-29. Cold start for 0011.

```
online  ─► sw.js (per build) precaches /assets/* + editor ─► GET / network first, keep it
offline ─► kept / ─► hydrate (me inside) ─► replica of the last owner (localStorage) ─► list
new build ─► new sw.js bytes ─► install, skipWaiting, drop old caches ─► next load is new
sign-out ─► replica, owner and kept / all deleted
```

**Decision.** A hand-written service worker, built by a small Vite plugin that stamps the build and lists its files. Navigations go to the network first; the last good `/` is kept and served when the network fails. The replica opens for the owner saved on the last online boot, and only if the kept page names the same user.

**Why.** `/` is the only page, and its SSR HTML already carries the signed-in user, so keeping it is the whole shell: no second render path, no SPA mode. Network first means an online load always gets the newest build.

**Instead of.** Workbox (a dependency for 80 lines); a user-neutral prerendered shell (a second boot path to keep in step).

**Open.** A tab left open across a deploy may miss a lazy chunk until reload.
