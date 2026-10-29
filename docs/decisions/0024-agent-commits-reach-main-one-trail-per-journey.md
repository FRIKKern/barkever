# 0024 Agent commits reach main; one Trail per journey branch

Accepted 2026-10-29 by the owner ("go for what you really believe will be helpful long run").

```
agent worktree branch (commits carry the agent's Entire checkpoint)
  ─► rebase onto main ─► npm run prepush ─► entire trail create (publishes the branch)
  ─► git merge --ff-only ─► push main ─► reviewer findings: entire trail finding
```

**Decision.** Agent commits land on main as they are: rebase, then fast-forward. No squash. Each journey branch gets a Trail whose body opens with a picture, names the Barkpark task, and lists what ran. Independent reviews post their verdicts as Trail findings.

**Why.** Squashing pinned every line to the lead's checkpoint, which holds only "agent finished". So `entire why` found no reasoning, and nobody had opened a Trail. Kept commits give each line the transcript of the agent that wrote it.

**Instead of.** Squash merges (the old AGENTS loop), or Entire as a plain git host.
