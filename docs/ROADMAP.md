# Roadmap

[![Barkever roadmap: which milestones are done, which are moving, and where we're heading](img/roadmap.svg)](https://github.com/FRIKKern/barkever/milestones)

```
P0 Ground ─► P1 Platform ─► P2 Prototype ─┬─► P3 Web core ─► P4 Mac app ─┬─► P7 Later
                                          └─► P5 AI v1 ──► P6 Projects ──┘
```

Heading to: every journey signed off, on the web and in a signed Mac app that updates itself. Then the later list.

| Id | Milestone | After | Reward |
|---|---|---|---|
| P0 | Ground | | The rules, the journeys and the first push |
| P1 | Platform | P0 | Notes and notebooks have a home in Barkpark |
| P2 | Prototype | P1 | The look is picked from real options |
| P3 | Web core | P2 | Write, browse, find, organize and link, online or off |
| P4 | Mac app | P3 | A signed Mac app that updates itself |
| P5 | AI v1 | P2 | Ask your notes, and edit with AI through a diff you accept |
| P6 | Projects | P5 | Checklists become tasks on a board |
| P7 | Later | P4, P6 | Semantic search, meeting notes, an MCP server, reminders |

Rewards and order live here. Status lives on the Barkpark board, goal `task-42e5633d742184c5`. The pictures and the [GitHub milestones](https://github.com/FRIKKern/barkever/milestones) are drawn from it, one way ([0037](decisions/0037-github-milestones-mirror-barkpark.md)).

```sh
npm run roadmap            # redraw the pictures here
npm run roadmap:publish    # on a clean main: redraw, push, sync GitHub
```

`land.mjs` runs the publish step after each land.

[![The ten journeys and how far each one is](img/journeys.svg)](../JOURNEYS.md)
