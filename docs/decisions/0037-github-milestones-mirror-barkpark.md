# 0037 GitHub milestones mirror Barkpark

Accepted 2026-11-04. Replaces "Instead of GitHub Issues" in 0010 for milestones only. Builds on 0036.

```
Barkpark board ─► scripts/roadmap.mjs ─┬─► docs/img/roadmap.svg, journeys.svg
                                       └─► GitHub: P0–P7 milestones, one issue per criterion
```

**Decision.** Barkpark stays the one tracker. GitHub gets a one-way mirror: a milestone per P, an issue per acceptance criterion, closed once stamped. Issues we didn't create are left alone. Blank issues are off.

**Why.** The owner wants real milestones with a picture of done, not done and ahead. One issue per criterion makes GitHub's progress bar mean sign-off, not task churn. The Barkpark bridge already mirrors every task to FRIKKern/barkpark, so copying tasks here would be a third list.

**Refresh.** `land.mjs` publishes after each land; the lead can run `npm run roadmap:publish`. It pushes only the pictures, past check and scan, not prepush, and refuses while a land runs or main isn't level with origin. No bot and no CI, unlike the sibling repos: a bot pushing to main can reject a land after its long prepush, and it would need a Barkpark token.

**Instead of.** Every task as an issue; a housekeeping Action; a hand-drawn picture.
