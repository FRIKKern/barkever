# Editor candidate restore rehearsal

`pnpm test:editor-candidate-restore` builds the real Barkever app and runs its
canvas loader against an isolated loopback Barkpark fixture. It loads the
candidate first, edits and reloads a note after an acknowledged save, then
switches the fixture to the baseline and repeats the same edit/save/reload.
The command does not change Barkever's loader defaults or dependency pins.

Each mutation must carry the exact prior fixture revision. The fixture records
the revisioned document it returns, and the client must settle on both `Saved`
and `Synced`. Reload proof uses a new browser context with only the session
cookies: it has no prior origin storage, and the fixture must answer a new note
GET with the exact acknowledged revision and text.

Install the exact lockfile first:

```sh
pnpm install --frozen-lockfile
```

Then provide the hosted candidate tarball, its published digest, a preserved
six-file baseline directory, and a new evidence directory:

```sh
BARKEVER_EDITOR_CANDIDATE_TGZ=/absolute/path/portable-doc-editor.tgz \
BARKEVER_EDITOR_CANDIDATE_SHA256=<sha256> \
BARKEVER_EDITOR_BASELINE_DIR=/absolute/path/baseline-assets \
BARKEVER_EDITOR_BASELINE_CONTRACT=1.21.0 \
BARKEVER_EDITOR_BASELINE_ID=<baseline-id-or-commit> \
BARKEVER_EDITOR_RESTORE_EVIDENCE=/absolute/path/new-evidence \
pnpm test:editor-candidate-restore
```

The baseline directory must contain these files:

- `bp-paper-code.js`
- `bp-paper-editor-shell.css`
- `bp-paper-editor.bundle.js`
- `bp-paper-editor.css`
- `bp-paper-mermaid.js`
- `bp-paper-surface.css`

The resulting `manifest.json` records the Barkever source revision, candidate
tarball digest, all six candidate and baseline asset digests, the four assets
actually loaded through `/editor-files` and `/editor-assets`, mutation
revision fences and acknowledgements, fresh-context GET responses, final
revision-backed documents, and the loopback backend address.
Use a fresh evidence directory for every run so previous evidence is retained.
