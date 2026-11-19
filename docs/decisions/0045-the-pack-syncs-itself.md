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
```

**Decision.** Barkpark is the source of `conformance/pack/`; only `scripts/pack-sync.mjs` writes it. Only `scripts/pack-door.mjs` names that folder; `check-repo.mjs` refuses it in any other file it does not list, and act gets it from the door. Before a push the plan runs on the new pack: the conformance run, `check-repo.mjs`, `pack-compare.mjs`, the app's `tsc --noEmit`, and every test that imports the door (`packReaders`, by resolved imports). It pushes only if all pass, so it lands unreviewed. A test reads what the pack means, never its wording. A workflow-token push starts no workflow, so act dispatches ci. Only act writes, pinned in `scripts/keyed-jobs.json`. A push run's token reaches only `git push` and `gh workflow run`; a report run's only `gh issue list`, `create` and `edit`.

**If main stops moving** after this lands, stop landing and tell the lead. The repair is the owner's push; nobody force-moves main.

**Schedule.** None yet. It comes on in a later change, only after a watched manual run shows main moving the way a land moves it.

**Considered.** A deploy key: a secret for a push the workflow token can make. Pull requests: Barkever lands on staging. Hourly: most hours move only the stamp.
