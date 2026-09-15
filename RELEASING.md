# Releasing Codex for Intel Macs

Release builds are signed with the Developer ID identity configured in `package.json`, notarized by Apple, and published to GitHub Releases. The app checks that release feed automatically but downloads and installs only after explicit user actions.

## One-time GitHub setup

Configure these Actions secrets without committing their values:

- `MACOS_CERTIFICATE`: base64-encoded `.p12` export containing the Developer ID Application certificate and private key.
- `MACOS_CERTIFICATE_PASSWORD`: password chosen while exporting the `.p12`.
- `KEYCHAIN_PASSWORD`: a random CI-only password used for the temporary runner keychain.
- `APPLE_API_KEY_BASE64`: base64-encoded App Store Connect API `.p8` key.
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER`: App Store Connect API issuer ID.

The repository's built-in `GITHUB_TOKEN` publishes the release; do not create or commit a separate GitHub token.

## Make a release

1. Finish and commit the source changes.
2. Bump `package.json`, `package-lock.json`, and the plan release version.
3. Run formatting, lint, type checking, tests, the production build, and the App Server smoke test.
4. Commit the version bump.
5. Create and push a matching tag such as `v0.3.1`.
6. Confirm the GitHub Actions release job signs, notarizes, and publishes the DMG, ZIP, blockmaps, and `latest-mac.yml`.

Never place a certificate, private key, Apple credential, GitHub token, or `.env` file in this repository.
