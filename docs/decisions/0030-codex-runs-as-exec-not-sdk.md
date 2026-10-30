# 0030 Codex runs as `codex exec`, not the Codex SDK

Accepted 2026-10-30. Supersedes the codex line of [0007](0007-ai-on-subscriptions.md).

```
Electron main ─► claude (Agent SDK)  settingSources [] · --strict-mcp-config · --tools ""
              └► codex exec --json   HOME = CODEX_HOME = fresh empty folder, auth.json linked in
                                     --ignore-user-config --ignore-rules --ephemeral
                                     --sandbox read-only -c web_search="disabled" -c approval_policy="never"
                                     --disable <14 tools>   (MinMacs' flags, Sources/Core/Review/MMModel.m)
```

**Decision.** Codex runs `codex exec` directly with MinMacs' isolation flags. All of them exist in codex-cli 0.154.0 (`codex exec --help`, `codex features list`). Fake codex fails a call that lacks any one.

**Why.** The Codex SDK 0.155 only passes `--config k=v`. It cannot ignore the user's config.toml or rules, so their MCP servers would load. That breaks 0007's strict MCP.

**Own home.** `--ignore-user-config` skips config.toml only. So each call sets HOME and CODEX_HOME to a fresh empty folder that holds one link, to the owner's `auth.json`. A `codex debug prompt-input` probe (no model call) with a marker at every door of a synthetic home: the owner’s home sent AGENTS.override.md (AGENTS.md when there is none), config.toml’s instructions, `~/.codex/skills` and `~/.agents/skills`; a fresh HOME and CODEX_HOME sent none. `codex login` writes through the link, so a refreshed token should reach the owner's file; a refresh needs a real call, so that part is unproved. Codex's own bundled skills and one tool, `request_user_input`, remain.

**Instead of.** The Codex SDK with config overrides.
