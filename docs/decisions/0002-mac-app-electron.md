# 0002 Mac app: Electron around the same build

Accepted 2026-10-28.

**Decision.** The Mac app is Electron loading the same web build. The main process adds what a browser can't: running `claude` and `codex`, the OS keychain, files.

**Why.** Barkdown ships Electron with subscription AI today. One codebase, two shells.

**Instead of.** Tauri (needs a Node sidecar to run the CLIs, so two runtimes).
