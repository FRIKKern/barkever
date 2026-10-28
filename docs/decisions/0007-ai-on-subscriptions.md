# 0007 AI runs on the owner's subscriptions

Accepted 2026-10-28.

```
Electron main ─► claude (Agent SDK, pathToClaudeCodeExecutable) ─► Claude login
              └► codex  (Codex SDK, codexPathOverride)        ─► ChatGPT login
web ─► Mac app bridge or Barkever MCP server
```

**Decision.** The Mac app runs the installed `claude` and `codex` on the owner's logins. Each call: API-key and nested-session env vars removed, fresh temp folder, `settingSources: []`, strict MCP, JSON-schema answers, Claude then Codex fallback, a daily token budget. Tests use fake CLIs that refuse any call carrying a key.

**Why.** No API keys to buy or leak. MinMacs and Barkdown both run this way.

**Instead of.** API keys in the app; a hosted AI proxy.
