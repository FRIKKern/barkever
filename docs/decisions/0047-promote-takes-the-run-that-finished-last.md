# 0047 Promote takes the ci run that finished last

Recorded 2026-11-19. Supersedes how [0046](0046-promote-reads-ci-itself.md) picks a run and when it leaves the red issue alone.

```
ci runs for staging's head   run 1 created 12:00, re-run finished 13:00   ◄── taken
                             run 2 created 12:30, finished 12:40
red issue                    new body equals the open issue's body ─► not edited
                             any change, such as other failed jobs ─► edited
```

**Decision.** On a dispatch or schedule, promote takes the completed ci run that finished last, by `updated_at`, then the higher id. A re-run counts as newest, the same run the workflow_run path reacts to. A red run edits the first open "staging is red" issue only when the new body differs from its body, so a re-run on the same run page that fails other checks updates the list, and repeats on one red head write nothing.

**Limits.** GitHub's issue search can lag, so two red runs close together can open a second "staging is red" issue. Red runs edit only the first; a green head closes all of them.
