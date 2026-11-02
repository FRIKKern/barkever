# F04: AI-written docs through the PortableDoc MCP server

| Docs | Valid (JS and Elixir) | Invalid | First draft valid | Failed runs | Model | Cost (CLI estimate) |
|---|---|---|---|---|---|---|
| 50 | 50 | 0 | 39 | 0 | claude-opus-5-5 | ≈ $2.01 |

```
fixtures/f04/prompts.json ──► claude 2.1.316 (Claude Code), owner login, decision 0007 sandbox
                               (no API keys, temp cwd, no settings, strict MCP, no built-in tools)
                               └─► portable-doc-mcp @ 82be3a8: validate · explain · apply_ops · render (off)
final doc ──► @portable-doc/validate @ 82be3a8  +  Barkpark.PortableDoc.Validate @ 6918c5247c
```

Run with `node --experimental-strip-types mac/scripts/f04.ts <portable-doc @ 82be3a8> <barkpark api>`, concurrency 2. Prompts are synthetic. Every doc and count is in [runs.json](runs.json). Valid means schema-valid: both validators accept the doc. It says nothing about whether the content is good.

Known gaps:

- **Redacted doc.** f04-13's author line was redacted to a made-up name after the run, because the child claude wrote the owner's real account email there. It learns the owner identity from its login, and `settingSources: []` does not hide it. The redacted doc was re-validated in both validators. The real fix in the app harness is task-e24cec6e0c744e33.
- **Added after the 50 runs.** The SYSTEM line "made-up names only" and the runner's email guard (it refuses to write output that contains an email address) came after the run, so this run did not use them.
- **Thin block mix.** Only 9 block types appear: heading, paragraph, list, table, callout, code, quote, task-list, divider. f04-11, 19, 20, 27, 32 and 33 are heading and paragraph only. The validator is permissive: a paragraph with no text, string list items and an unknown callout tone all pass. So 50/50 says the docs are schema-valid, not that the agent covers the spec.
- **render in allowedTools.** render stays allowed, as it ran. It was off only because no BARKPARK_* variable reached the MCP server.

| Id | Model | First draft valid | validate · explain · apply_ops calls | Turns | Tokens | ≈ Cost | JS | Elixir |
|---|---|---|---|---|---|---|---|---|
| f04-01 | claude-opus-5-5 | no | 7 · 1 · 0 | 10 | 20637 | $0.064 | valid | valid |
| f04-02 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5827 | $0.031 | valid | valid |
| f04-03 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6261 | $0.039 | valid | valid |
| f04-04 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6683 | $0.045 | valid | valid |
| f04-05 | claude-opus-5-5 | no | 2 · 0 · 0 | 4 | 9234 | $0.040 | valid | valid |
| f04-06 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6023 | $0.035 | valid | valid |
| f04-07 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5694 | $0.030 | valid | valid |
| f04-08 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6077 | $0.036 | valid | valid |
| f04-09 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5329 | $0.024 | valid | valid |
| f04-10 | claude-opus-5-5 | no | 5 · 1 · 0 | 8 | 24239 | $0.067 | valid | valid |
| f04-11 | claude-opus-5-5 | no | 8 · 1 · 0 | 11 | 38408 | $0.106 | valid | valid |
| f04-12 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6234 | $0.038 | valid | valid |
| f04-13 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6513 | $0.043 | valid | valid |
| f04-14 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5202 | $0.022 | valid | valid |
| f04-15 | claude-opus-5-5 | yes | 2 · 0 · 0 | 4 | 8155 | $0.030 | valid | valid |
| f04-16 | claude-opus-5-5 | no | 2 · 0 · 0 | 4 | 10452 | $0.055 | valid | valid |
| f04-17 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5585 | $0.028 | valid | valid |
| f04-18 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5949 | $0.034 | valid | valid |
| f04-19 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6278 | $0.039 | valid | valid |
| f04-20 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6760 | $0.046 | valid | valid |
| f04-21 | claude-opus-5-5 | no | 2 · 0 · 0 | 4 | 9229 | $0.039 | valid | valid |
| f04-22 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6105 | $0.036 | valid | valid |
| f04-23 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 7574 | $0.059 | valid | valid |
| f04-24 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6191 | $0.037 | valid | valid |
| f04-25 | claude-opus-5-5 | no | 3 · 1 · 0 | 6 | 16409 | $0.058 | valid | valid |
| f04-26 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5494 | $0.026 | valid | valid |
| f04-27 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6270 | $0.039 | valid | valid |
| f04-28 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5176 | $0.022 | valid | valid |
| f04-29 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6488 | $0.043 | valid | valid |
| f04-30 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5417 | $0.025 | valid | valid |
| f04-31 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5384 | $0.025 | valid | valid |
| f04-32 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5177 | $0.021 | valid | valid |
| f04-33 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6882 | $0.049 | valid | valid |
| f04-34 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5133 | $0.021 | valid | valid |
| f04-35 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5391 | $0.025 | valid | valid |
| f04-36 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5509 | $0.027 | valid | valid |
| f04-37 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 7050 | $0.051 | valid | valid |
| f04-38 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5300 | $0.023 | valid | valid |
| f04-39 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 8182 | $0.069 | valid | valid |
| f04-40 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5487 | $0.027 | valid | valid |
| f04-41 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5773 | $0.031 | valid | valid |
| f04-42 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5126 | $0.021 | valid | valid |
| f04-43 | claude-opus-5-5 | no | 4 · 1 · 0 | 7 | 23426 | $0.092 | valid | valid |
| f04-44 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6032 | $0.035 | valid | valid |
| f04-45 | claude-opus-5-5 | no | 2 · 1 · 0 | 5 | 11853 | $0.041 | valid | valid |
| f04-46 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5558 | $0.027 | valid | valid |
| f04-47 | claude-opus-5-5 | no | 2 · 0 · 0 | 4 | 9447 | $0.043 | valid | valid |
| f04-48 | claude-opus-5-5 | no | 5 · 1 · 0 | 8 | 24247 | $0.084 | valid | valid |
| f04-49 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 5262 | $0.023 | valid | valid |
| f04-50 | claude-opus-5-5 | yes | 1 · 0 · 0 | 3 | 6154 | $0.037 | valid | valid |
