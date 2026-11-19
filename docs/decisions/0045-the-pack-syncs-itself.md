# 0045 The PortableDoc pack syncs itself

Recorded 2026-11-19. Builds on [0042](0042-staging-is-live.md) and [0044](0044-the-trial-stays-and-test-tools-are-risky.md).

```
sync-pack.yml, daily and on demand
plan    read-only token: Barkpark main ─► pack-plan.mjs on staging ─► pack-sync.mjs + conformance
        source at odds with its stamp, or older than SOURCE.md ─► refused
        same, or only the stamp moved ─► none
        real change, no row moved ─► push        rows moved ─► report
push    contents: write   sync-act.sh: one commit on staging's head, only the pack and the report,
                          every file Barkpark's own blob; its own message; token on the push alone
ci      actions: write    gh workflow run ci.yml --ref staging ─► promote moves main
report  issues: write     one issue names the moved rows; nothing pushed
```

**Decision.** Barkpark is the source of `conformance/pack/`; only `scripts/pack-sync.mjs` writes it. `pnpm conformance` starts with `pack-compare.mjs`: a file the stamp or SOURCE.md does not name, or one not as written, fails. A workflow-token push starts no workflow, so the sync dispatches ci; promote takes a dispatched ci on staging. Every workflow job holds no write power, or is pinned with the files it runs in `scripts/keyed-jobs.json` (`workflow-keys.mjs`, in `npm run check`).

**Considered.** A deploy key: a secret to keep for a push the workflow token can make. A pull request: Barkever lands on staging. Hourly: most hours move only the stamp.

**Not verified.** That a dispatched ci starts promote.
