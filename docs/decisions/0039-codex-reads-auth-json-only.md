# 0039 Codex signs in through auth.json only

Accepted 2026-11-07. Adds to [0030](0030-codex-runs-as-exec-not-sdk.md), which stays as it is.

```
owner's ~/.codex or CODEX_HOME        fresh home for each call
  auth.json ◄──────── link ─────────── .codex/auth.json
  keyring login: no auth.json ───────► the link points at nothing ─► "not signed in"
```

**Decision.** The fresh home holds one link, to the owner's `auth.json`. `-c cli_auth_credentials_store="file"` makes codex read only that file. An owner whose login is in a keyring reads as not signed in, and the app says so.

**Why.** A keyring is outside the fresh home, and reading it would open a door 0030 closed. Signing in again with the file store is one command.

**Proof.** `mac/src/ai.test.ts` pins the link and the "not signed in" answer with a fake codex. It has not been run against a real keyring login.
