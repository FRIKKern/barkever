# Barkever for Mac

## Package, sign, notarize

```
node mac/scripts/build.mjs
        │
        │ which identity?   CSC_NAME set ─────────────────────────► that one
        │                   else the keychain's Developer ID Application identities:
        │                     one ────────────────────────────────► that one
        │                     two or more ────────────────────────► refuse, name them
        │                     none ───────────────────────────────► ad hoc "-"
        │
        ├─ ad hoc ──────► sign "-", hardened runtime, same entitlements, no notarizing ─┐
        │                                                                               ▼
        └─ Developer ID ► sign, hardened runtime ─► notarize ─► staple ──► mac/dist/Barkever.app
                                                    │                      mac/dist/Barkever-<v>-<arch>.dmg
                                  keychain profile barkever-notary   (main path)
                                  APPLE_API_KEY, _KEY_ID, _ISSUER    (any set: the API key instead)

node mac/scripts/rehearse.mjs ─► mount DMG ─► copy to a temp Applications ─► codesign --verify --deep --strict
                                 ─► runtime flag ─► [Developer ID: spctl --assess, stapler validate]
                                 ─► launch ─► window shows Sign in ─► quit ─► detach, delete temp
```

The build's first line names the path it took. The DMG is built with `TMPDIR=/tmp/` because `hdiutil` breaks on an external volume. Prepush never runs the rehearsal, so run it by hand after a build. It uses its own empty profile and a mock keychain, and saves `mac/dist/rehearsal.png`.

### Owner steps: switch on real signing

| # | Do | Check |
|---|---|---|
| 1 | Xcode › Settings › Accounts › Manage Certificates › + › **Developer ID Application** (Account Holder only) | `security find-identity -v -p codesigning` lists one `Developer ID Application: <Name> (<TEAMID>)` |
| 2 | In App Store Connect › Users and Access › Integrations, make a Team API key and download its `.p8`. Store it once: `xcrun notarytool store-credentials barkever-notary --key <path to AuthKey_<KEYID>.p8> --key-id <KEYID> --issuer <issuer UUID>`. After that the keychain holds the key, so the `.p8` can be deleted. Or use an app-specific password: `xcrun notarytool store-credentials barkever-notary --apple-id <your Apple ID> --team-id <TEAMID>`, pasting the password at the prompt, never on the command line | `xcrun notarytool history --keychain-profile barkever-notary` answers (an empty list is fine) |
| 3 | `node mac/scripts/build.mjs`, with no env vars | First line: `Signing with Developer ID <Name> (<TEAMID>) from the keychain; notarizing with keychain profile barkever-notary.` |
| 4 | `node mac/scripts/rehearse.mjs` | Table shows `Developer ID Application: …`, and the `spctl --assess` and `xcrun stapler validate` rows pass |

If the keychain holds two Developer IDs, the build refuses and names both. Pick one with `CSC_NAME="<Name> (<TEAMID>)"`, without the `Developer ID Application:` prefix, which electron-builder rejects. To skip the profile and pass the API key in the shell, set `APPLE_API_KEY` (the `.p8` path), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`. If only some are set, the build fails; it doesn't fall back to the profile.
