# 0032 Codex's login stays in the owner's auth.json file

Accepted 2026-10-31. Supersedes the login part of [0030](0030-codex-runs-as-exec-not-sdk.md).

```
fresh CODEX_HOME/auth.json ──link──► owner's auth.json
refresh ─► FileAuthStorage::save: open(truncate, write) ─► follows the link ─► owner's file, in place
keyring/auto ─► key = sha256(temp CODEX_HOME), then delete auth.json ─► rotated token stranded   ✗
```

**Decision.** Every codex call passes `-c cli_auth_credentials_store="file"`. Fake codex refuses a call without it.

**Why.** A refresh rotates the refresh token. In codex-rs 0.154.0, the file store writes `CODEX_HOME/auth.json` in place with no rename, so the new token reaches the owner's file. A dummy login against a localhost fake proved it: the token was rotated through the link, the link survived, and the owner's next refresh with the new token was accepted. The keyring and auto stores would save under a key for the temp folder and then remove the link.

**Cost.** An owner whose codex login lives only in the keyring has no auth.json, so the link points at nothing. Codex 0.154 does not stop there. It starts the turn with no credential. Ask then shows "Ask failed." with codex's own failure after "codex:": the `turn.failed` message, else the exit code and stderr (codex.ts). Offline, codex retries the stream ("Reconnecting… 3/5" in review-j05's probe). The online text is unprobed.

**Instead of.** Copying auth.json in and back, which races a second codex.
