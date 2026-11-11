# 0043 test-scripts is steady and the bot closes its red issues

Recorded 2026-11-11. Replaces two lines of "Left" in [0042](0042-staging-is-live.md); the rest of 0042 stands. Tasks: task-eaee96b453f918c2, task-a5c33f7121010d1c.

```
flake   old test: "started within 1.5 s" ─► loaded runner, node starts slower ─► red, no bug
        new test: "started, and never printed heavy: waiting"            9131733, a968394
issues  main moves to a sha, or already holds it
        ─► bot closes its own open "staging is red at <sha>" for that sha and older
        a red run on a sha main already holds opens none             b3bbd14, faa40e1
```

**What 0042 left open.**

- The `heavy.mjs` slot tests flaked on GitHub's macOS. The cause was the tests, not `heavy.mjs`: short clocks stood in for logic. They now read what a run prints.
- A red issue stayed open until closed by hand. The bot now closes it. Only issues the bot wrote, with the exact title.

**Proof.** Run 42926023517: `test-scripts` green 20 of 20 on macOS. Staging green three times in a row: 42926502035, 42926782793 and its rerun. Delaying every heavy start 1.8 s fails the old tests and passes the new ones. `scripts/promote.test.mjs` fails on the old workflow. Promote run 42929267595 ran the new step.

**Still open.**

- Owner: remove "Repository admin" from the `main` bypass list, as in 0042.
- Linux for `test-scripts` is possible, not proven: 3 of 3 green on ubuntu, too few to switch. Task: task-1573fa16f5598e7c.

**Not verified.** A real close by the bot: no red issue has been open since it landed.
