# 0040 GitHub checks every push; land.mjs still lands

Accepted 2026-11-10 on the lead's brief; the owner has not signed it. Task: task-4802d3c237aa7964. Replaces "No CI" in AGENTS.md and the "no CI" half of 0037's Refresh. "No bot" stays.

```
push to main, any pull request ─► .github/workflows/ci.yml      reads only, never pushes
  scan          scan-outgoing.mjs over the pushed commits   ubuntu    6 s
  check         npm run check                               ubuntu   24 s
  build         pnpm -r build                               ubuntu   17 s
  test-app      522 unit tests                              ubuntu   35 s
  test-mac      82 unit tests                               macos    41 s
  test-scripts  266 script tests                            macos   154 s
  e2e           app e2e                                     skips until its secrets exist
```

**Decision.** GitHub runs the gate's secret-free half on every push to `main` and every pull request. It gates nothing yet: `land.mjs` is unchanged and still runs the full prepush on the Mac.

**Why.** The repo went public on 2026-11-09, so hosted minutes are free. Every check ran on one 16 GB Mac.

**Secrets.** e2e needs three, set by the owner: `BARKEVER_E2E_EMAIL`, `BARKEVER_E2E_PASSWORD` and `BARKEVER_E2E_BARKPARK_TOKEN`, the Barkpark token `app/e2e/account.ts` reads from the bp login. j10 and the Mac e2e stay on the Mac.

**Costs.** Four `heavy.mjs` ghost-slot tests fail on Linux, so the script tests run on macOS. CI has no known tokens to match, so its scan is key patterns only.

**Proof.** Run 42857195532 on pull request 25: seven jobs green, times above. The e2e steps past the skip have never run.
