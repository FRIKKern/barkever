# 0045 The PortableDoc pack syncs itself

Recorded 2026-11-19. Builds on [0042](0042-staging-is-live.md) and [0044](0044-the-trial-stays-and-test-tools-are-risky.md).

```
sync-pack.yml, on demand
plan  read only   Barkpark main ─► pack-sync + conformance on staging ─► check-repo, pack-compare,
                                                     app tsc, every test that imports pack-door
                  at odds with its stamp, or older than SOURCE.md ─► refused
                  same, or only the stamp moved ─► none
                  all green ─► push           a check fails or a row moved ─► report
act   writes      push: one commit on staging's head, only the pack and the report, every file
                        Barkpark's blob, hashes rebuilt; its own message; ─► gh workflow run ci
                  report: one issue, kept up to date
promote           only staging's head, from ci on staging, pushed or dispatched; fast-forward only
                  ci red ─► main stays; one issue names the failed checks, edited per red head

wall 1  early warning   the name check + readers by imports   misses some readers
wall 2  what holds      every test ci runs, on staging's head  main moves only after green
```

**Decision.** Barkpark sources `conformance/pack/`; only `scripts/pack-sync.mjs` writes it, only `scripts/pack-door.mjs` names it in code. Before a push the plan runs conformance, `check-repo.mjs`, `pack-compare.mjs`, app `tsc` and every test importing the door; it lands unreviewed. Main only moves to a head that passed every test ci runs on staging; the plan's own checks catch most broken packs before the push. Wall 1 misses readers: the two parts in separate consts, a walk or glob over `conformance/`, input paths, child processes. Those turn staging red; promote's one issue names the check. A test reads meaning, not wording. Act dispatches ci; a workflow-token push starts none. Only act writes, pinned in `scripts/keyed-jobs.json`, taking the folder from the door. A push run's token reaches only `git push` and `gh workflow run`; a report run's only `gh issue list`, `create` and `edit`.

**If main stops moving**, stop landing and tell the lead; the owner pushes the repair, nobody force-moves main.

**Schedule.** None yet. It comes on in a later change, only after a watched manual run shows main moving the way a land moves it.

**Considered.** A deploy key: a secret the workflow token makes needless. Pull requests: Barkever lands on staging. Hourly: most hours move only the stamp.
