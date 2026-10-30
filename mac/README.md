# Barkever for Mac

## Package, sign, notarize

```
node mac/scripts/build.mjs
        │
        ├─ CSC_NAME unset ──────► sign ad hoc "-" ──────────────────────────────┐
        │                         hardened runtime, same entitlements           │
        │                                                                       ▼
        └─ CSC_NAME set ────────► sign with that Developer ID ──► notarize ──► mac/dist/Barkever.app
                                  hardened runtime                │            mac/dist/Barkever-<v>-<arch>.dmg
                                                                  │
                                  APPLE_API_KEY, _KEY_ID, _ISSUER ┤ any set: the API key
                                  none set                        ┘ keychain profile barkever-notary

node mac/scripts/rehearse.mjs ─► mount DMG ─► copy to a temp Applications ─► codesign --verify --deep --strict
                                 ─► runtime flag ─► [Developer ID: spctl --assess, stapler validate]
                                 ─► launch ─► window shows Sign in ─► quit ─► detach, delete temp
```

The build prints the path it took on its first line. The DMG is built with `TMPDIR=/tmp/`, because `hdiutil` fails on an external volume. The rehearsal never runs in prepush, so run it by hand after a build. It uses its own empty profile and a mock keychain, and saves a screenshot to `mac/dist/rehearsal.png`.

### Owner steps: switch on real signing

| # | Do | Check |
|---|---|---|
| 1 | Xcode › Settings › Accounts › Manage Certificates › + › **Developer ID Application** (Account Holder only) | `security find-identity -v -p codesigning` lists `Developer ID Application: <Name> (<TEAMID>)` |
| 2 | Make an app-specific password at account.apple.com › Sign-In and Security, then store it once: `xcrun notarytool store-credentials barkever-notary --apple-id <your Apple ID> --team-id <TEAMID>`. Paste the password at the prompt, never on the command line | `xcrun notarytool history --keychain-profile barkever-notary` lists submissions (empty is fine) |
| 3 | `CSC_NAME="Developer ID Application: <Name> (<TEAMID>)" node mac/scripts/build.mjs` | First line: `Signing with … notarizing with keychain profile barkever-notary.` |
| 4 | `node mac/scripts/rehearse.mjs` | Table shows `Developer ID Application: …`, plus `spctl --assess` and `xcrun stapler validate` rows that pass |

With an App Store Connect API key instead of step 2, set `APPLE_API_KEY` (the `.p8` path), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` in the shell. If only some are set, the build fails; it doesn't fall back to the keychain profile. `notarytool store-credentials barkever-notary --key … --key-id … --issuer …` also works, and then the `.p8` file can be deleted.
