# 0046 Promote reads staging's ci run itself

Recorded 2026-11-19. Supersedes the trigger in [0041](0041-land-on-staging-a-bot-moves-main.md) and [0042](0042-staging-is-live.md): promote no longer waits only for ci's workflow_run. Builds on [0045](0045-the-pack-syncs-itself.md).

```
land.mjs push ─► ci ─► workflow_run ─────────────────────────┐
act push + gh workflow run ci ─► ci ─► (no workflow_run)     │
promote dispatched, later on a schedule ─► latest completed  ├─► promote's rules ─► main
            ci run for staging's exact head, push or dispatch ┘
```

**Why.** A run the workflow token starts fires no workflow_run. The first watched pack sync showed it: act pushed staging and dispatched ci, ci went green, and promote never ran.

**Decision.** Promote runs on ci's workflow_run, on a dispatch and, once switched on, a schedule. On a dispatch or schedule it reads staging's head itself and takes the latest completed ci run for that exact sha. Its rules stay as 0042 set them: fast-forward only, only staging's head, only after green ci, and only for a ci run from a push or a dispatch. No run, a run in progress, an older head or a cancelled run moves nothing. When main already holds staging's head it says so in one line. It reads staging and main again just before it moves main. Repeated runs on one red head keep one issue unchanged.

**Schedule.** Off in this change. It comes on after one watched dispatch moves main.
