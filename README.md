# Codex Desktop Intel

A small local macOS desktop client for the Codex CLI, designed to be packaged for Intel (`x86_64`) Macs. It talks to the officially supported Codex App Server protocol instead of scraping terminal output.

## What the MVP includes

- Existing CLI, VS Code, exec, and app-server conversation history.
- New and resumed conversations scoped to a selected workspace.
- Streaming assistant messages, plans, command output, file activity, and tool status.
- Command and file-change approval dialogs.
- Codex `request_user_input` questions.
- Stop controls for active turns.
- Model, reasoning-effort, and sandbox selection.
- Conservative defaults: workspace-write access, no sandbox network access, and on-request approvals.

Codex remains the source of truth for thread history and authentication. The app only remembers the most recently selected workspace in local UI storage.

## Requirements

- macOS on Intel or Apple Silicon for development; the packaging command below targets Intel.
- Node.js 22 or newer and npm.
- A current, installed Codex CLI with `codex app-server` support.
- An authenticated Codex CLI session (`codex` should already work in Terminal).

The application looks for `codex` in `PATH`, common Homebrew/npm locations, and installed NVM Node versions. If it cannot locate the CLI, set `CODEX_BINARY` to its absolute path before launching.

## Run locally

```bash
npm install
npm run smoke
npm run dev
```

The smoke test starts the installed app server, initializes the protocol, reads at most five thread summaries, and exits without starting a Codex turn.

## Validate the project

```bash
npm run check
```

This runs ESLint, TypeScript, unit tests, and a production build.

## Package for an Intel Mac

```bash
npm run package:mac:x64
```

Unsigned `.dmg` and `.zip` artifacts are written to `release/`. macOS may require you to right-click and choose **Open** for a locally built, unsigned application. Code signing, notarization, and auto-update are intentionally outside the MVP.

## Security model

- Electron's renderer has no Node.js integration.
- A context-isolated, sandboxed preload script exposes only the required IPC methods.
- The app starts `codex app-server --stdio` directly; prompts are not interpolated into shell commands.
- Workspace-write mode grants writes only to the selected workspace and disables sandbox network access by default.
- Codex approval requests remain explicit UI decisions. “Allow for session” should only be selected for commands or changes you understand.
- Full-access mode is available because Codex supports it, but it removes filesystem sandbox restrictions and should be used deliberately.

## Known MVP limitations

- Thread and turn lists are limited to the newest 100 entries; pagination UI is deferred.
- Markdown is rendered as readable plain text; rich syntax highlighting and patch diff views are deferred.
- Thread rename, pin, archive, attachments, and remote app-server connections are deferred.
- The App Server surface is still evolving. The protocol adapter is intentionally isolated in `src/main/` so it can be updated without rewriting the UI.
- Distribution signing and the minimum macOS version ultimately depend on the selected Electron release and your signing setup.

See [PLAN.md](./PLAN.md) for the implementation checklist and deferred scope.
