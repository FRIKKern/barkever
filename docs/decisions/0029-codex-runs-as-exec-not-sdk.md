# 0029 Codex runs as `codex exec`, not the Codex SDK

Accepted 2026-10-30. Supersedes the codex line of [0007](0007-ai-on-subscriptions.md).

```
Electron main ─► claude (Agent SDK)  settingSources [] · --strict-mcp-config · --tools ""
              └► codex exec --json   --ignore-user-config --ignore-rules --ephemeral
                                     --sandbox read-only -c web_search="disabled" -c approval_policy="never"
                                     --disable <14 tools>   (MinMacs' flags, Sources/Core/Review/MMModel.m)
```

**Decision.** Codex runs `codex exec` directly with MinMacs' isolation flags. All of them exist in codex-cli 0.154.0 (`codex exec --help`, `codex features list`). Fake codex fails a call that lacks any one.

**Why.** The Codex SDK 0.155 only passes `--config k=v`. It cannot ignore the user's config.toml or rules, so their MCP servers would load. That breaks 0007's strict MCP.

**Instead of.** The Codex SDK with config overrides.
