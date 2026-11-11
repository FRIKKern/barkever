# 0044 The review trial stays, and test tools join the risky list

Recorded 2026-11-11: the owner said "do what's best" and the lead took its pick. Not an owner signature. Supersedes [0038](0038-review-trial.md). Task: task-6764ed1adbb45b48.

```
trial, 22 h     56 commits, 36 marked Trial: unreviewed      2.55 an hour, was 0.58
audit           26 of 40 unreviewed commits read
                app code     0 serious
                test tools   2 serious     task-a705668d39890894, task-f14ad3d2a9c764e7
code survival   read about 2026-11-14

land.mjs        a commit marked Trial: unreviewed changes a risky file ─► refused, file named
```

**Decision.** 0038's rules stay. Code off the risky list lands with no review, marked `Trial: unreviewed`. Risky code gets one fresh review first. Its spikes, journeys and stop rule stand.

**Risky list.** `app/src/replica/**`, `app/src/server/**`, `.github/workflows/**`, and in `scripts/`: `land`, `scan-outgoing`, `secrets`, `check-repo`, `heavy`, `own-tmp` and `test-cleanup`, each with its test, plus `promote.test.mjs`. Also secrets and anything that could lose a note. New: the workflows, the last four tools and every test file. They decide whether tests run or can fail, and both findings sat there.

**Enforced.** The list was prose. `land.mjs` now holds it and refuses a marked commit that changes a listed file. An unmarked one, and "could lose a note", stay with the author.

**Main.** On 2026-11-11 "Repository admin" left the bypass list of the `main` ruleset (id 26987981). A direct push to `main` was then refused: "6 of 6 required status checks are expected". `main` moves only through staging and the bot. Undo: Settings, Rules, Rulesets, `main`, Bypass list.

**Not verified.** Code survival. The unreviewed commits the audit did not read. Root `package.json` holds the test commands and is off the list.
