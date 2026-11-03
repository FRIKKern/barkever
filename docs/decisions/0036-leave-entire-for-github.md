# 0036 Leave Entire for a private GitHub repo

Accepted 2026-11-03 by the owner. Supersedes 0026, the Trail parts of 0024 (no squash stays), the "code is on Entire" reason in 0010, and the Trail steps in 0009 and 0012.

```
Entire main ─► filter-repo ─► GitHub FRIKKern/barkever (private)
  checkpoints, .entire, .claude, pace/  ──✗──  stay behind
  commit reasons, code, decisions       ─────► come along
```

**Decision.** The code lives on GitHub. Only `main` is pushed. Commit messages carry the why; Barkpark stays the one tracker. `land.mjs` lands on plain git; it and `npm run prepush` scan outgoing commits for secrets. A plain `git push` runs nothing.

**Why.** The owner is done with Entire and does not want chat logs in the new repo. The code has no comments, so the cleaned history stays: it is the only record of why.

**Instead of.** One fresh commit: tidier, but blame would say nothing.

**Costs.** Every sha changed, so older shas in docs and spikes point at the old repo. `entire why` is gone; use `git log -L` and `git blame`.
