# 0020 Mac shell: the Start server inside the app, one port per install

Accepted 2026-10-29. Shapes 0002.

```
Electron main ── utilityProcess ── srvx: app/dist (client files + Start fetch) on 127.0.0.1:<port>
     │                                ▲ env: BARKPARK_URL, BARKEVER_SESSION_SECRET, PATH (login shell, later)
     ├─ port: picked once, kept in userData/port ─► same origin ─► same IndexedDB + service worker
     ├─ vault.bin (safeStorage): {secret, session}
     └─ Set-Cookie bk_session ─► strip Max-Age/Expires ─► memory-only cookie; value ─► vault
        launch ─► vault ─► cookies.set (no expiry)
```

**Decision.** The main process starts the built server in a utility process on a loopback port chosen on first launch and reused after. The sealed sign-in cookie never reaches Chromium's cookie file: main rewrites it to a session cookie and keeps the value in the safeStorage vault, then puts it back in memory on launch.

**Why.** The origin is the replica's and the service worker's key, so it must not move. A utility process keeps SSR off the window's thread. Electron leaves cookie encryption off, and turning it on means flipping fuses on the binary.

**Instead of.** In-process server (SSR blocks the UI loop); a custom `app://` scheme (not tried: cookies and service workers there need extra privileges); a non-persistent partition (loses the replica).

**Test.** Playwright's `_electron` runs on a mock keychain and hangs any relaunch once a service worker is active, so relaunches start Electron plainly and attach over CDP (`mac/e2e/launch.ts`), one of them on the real Keychain.

**Open.** If something else takes the port, the app says so and quits rather than move the origin.
