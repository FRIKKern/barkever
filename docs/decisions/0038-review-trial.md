# 0038 48-hour review trial

Accepted 2026-11-07. Ends 2026-11-09 unless the owner keeps it. Overrides parts of AGENTS.md until then. Task: task-6764ed1adbb45b48. Plan: /papers/ecosystem-efficiency-plan.

```
now    build ─► agent review ─► fix ─► review again ─► lead lands
trial  build ─► own tests + real app ─► land it yourself
                                    └─ risky code only: one review first
```

**Why.** Review took about 36% of agent hours, more than building at about 32%.

**Risky code keeps its review first:** `app/src/replica/**`, `app/src/server/**`, `scripts/land.mjs`, `scripts/scan-outgoing.mjs`, `scripts/secrets.mjs`, secrets, and anything that could lose a note.

**Other code.** `npm run check`, your own tests and a real-app run, then `node scripts/land.mjs <name> --reviewed <your own head sha>`. Put `Trial: unreviewed` in the commit message, for counting and audit.

**Spikes.** Pick one and go. Rival spikes only for choices that are hard to undo, two at most.

**Journeys.** One review when a journey is finished, before its stamp. Owner sign-off stays with the owner.

**Stop early** if a note is lost or corrupted, or `main` stays broken for over an hour.

**Judged by.** 1.5 or more commits per agent hour (now about 0.66), review share under 15%, code present after a week 75% or more (now 86%), and an audit of sampled `Trial: unreviewed` commits.
