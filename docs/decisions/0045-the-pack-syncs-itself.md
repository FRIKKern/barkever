# 0045 The PortableDoc pack syncs itself

Recorded 2026-11-19. Builds on [0042](0042-staging-is-live.md) and [0044](0044-the-trial-stays-and-test-tools-are-risky.md).

```
sync-pack.yml, on demand
plan  read only   Barkpark main ─► pack-sync on staging ─► pack-compare, tsc, conformance tests
                  at odds with its stamp, or older than SOURCE.md ─► refused
                  same, or only the stamp moved ─► none
                  all green ─► push           a check fails or a row moved ─► report
act   writes      push: one commit on staging's head, only the pack and the report, every file
                        Barkpark's blob, hashes rebuilt; its own message; ─► gh workflow run ci
                  report: one issue, kept up to date
promote           only staging's head, from ci on staging, pushed or dispatched; fast-forward only
```

**Decision.** Barkpark is the source of `conformance/pack/`; only `scripts/pack-sync.mjs` writes it. `pnpm conformance` starts with `pack-compare.mjs`. The plan runs every check that reads the pack, so a push cannot turn staging red; that is why it lands without a review. A workflow-token push starts no workflow, so act dispatches ci. Only act may write, and it is pinned with its scripts in `scripts/keyed-jobs.json`. The token reaches only the push, the dispatch and the issue calls.

**Schedule.** None yet. It comes on in a later change, only after a watched manual run shows main moving the way a land moves it.

**Considered.** A deploy key: a secret for a push the workflow token can make. Pull requests: Barkever lands on staging. Hourly: most hours move only the stamp.
