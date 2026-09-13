# Codex Desktop Intel

A small local macOS desktop client for the Codex CLI, designed to be packaged for Intel (`x86_64`) Macs. It talks to the officially supported Codex App Server protocol instead of scraping terminal output.

## What version 0.2 includes

- Existing CLI, VS Code, exec, and app-server conversation history.
- New and resumed conversations scoped to a selected workspace.
- Streaming assistant messages, plans, command output, file activity, and tool status.
- Command and file-change approval dialogs.
- Codex `request_user_input` questions.
- Stop controls for active turns.
- Model, reasoning-effort, and sandbox selection.
- Persistent system, light, and dark appearance modes.
- GitHub-flavored Markdown, syntax-highlighted code, copy buttons, and unified diff views.
- Thread rename, local pinning, archive/restore, permanent deletion, and cursor pagination.
- Image selection, drag-and-drop, clipboard paste, previews, and model capability checks.
- Safe workspace-relative references when non-image files are dropped into the composer.
- Optional ChatGPT usage display plus reconnect and redacted diagnostics controls.
- A composer that grows naturally for multiline prompts before it begins scrolling.
- Drafting the next prompt while a turn is still running.
- User-controlled conversation scrolling with a **Jump to latest** shortcut.
- File-change details collapsed by default to keep long conversations navigable.
- A distinctive custom Dock and application icon.
- Conservative defaults: workspace-write access, no sandbox network access, and on-request approvals.

Codex remains the source of truth for thread history and authentication. The app only remembers UI preferences such as the selected workspace, theme, and locally pinned thread IDs. Pinning is local in this release because the installed Codex CLI schema does not yet expose server-side pin metadata.

## Requirements

- macOS on Intel or Apple Silicon for development; the packaging command below targets Intel.
- Node.js 22 or newer and npm.
- A current, installed Codex CLI with `codex app-server` support.
- An authenticated Codex CLI session (`codex` should already work in Terminal).

The application looks for `codex` in `PATH`, common Homebrew/npm locations, and installed NVM Node versions. It also preserves the discovered NVM binary directory when launching Codex, because macOS GUI applications do not inherit the Terminal's full `PATH`. If it cannot locate the CLI, set `CODEX_BINARY` to its absolute path before launching.

The microphone/dictation control remains deferred: a dependable implementation needs explicit microphone permissions and a supported transcription service or native speech integration.

## Run locally

```bash
npm install
npm run smoke
npm run dev
```

The smoke test starts the installed app server, initializes the protocol, reads active and archived thread summaries, models, and optional rate-limit data, then exits without starting a Codex turn.

## Validate the project

```bash
npm run check
```

This runs ESLint, TypeScript, unit tests, and a production build.

## Package for an Intel Mac

```bash
# Bump the patch version in package.json and package-lock.json first.
npm run package:mac:x64
```

Unsigned `.dmg` and `.zip` artifacts are written to `release/`. macOS may require you to right-click and choose **Open** for a locally built, unsigned application. Code signing, notarization, and auto-update are intentionally outside the MVP.

Every distributable rebuild must use a new version number so artifacts and installed builds are unambiguous; never overwrite a previously packaged version.

## Security model

- Electron's renderer has no Node.js integration.
- A context-isolated, sandboxed preload script exposes only the required IPC methods.
- The app starts `codex app-server --stdio` directly; prompts are not interpolated into shell commands.
- Workspace-write mode grants writes only to the selected workspace and disables sandbox network access by default.
- Codex approval requests remain explicit UI decisions. “Allow for session” should only be selected for commands or changes you understand.
- Full-access mode is available because Codex supports it, but it removes filesystem sandbox restrictions and should be used deliberately.

## Known limitations

- Turn history is limited to the newest 100 entries; older-turn pagination remains deferred.
- Thread pins are a local UI preference until the installed Codex CLI exposes persisted pin metadata.
- App-server supports native text and image inputs. Other dropped files are inserted as safe workspace-relative prompt references.
- Active-turn steering, dedicated review mode, thread forks, and compaction remain planned work.
- Remote app-server connections remain deferred while WebSocket transport is experimental.
- The App Server surface is still evolving. The protocol adapter is intentionally isolated in `src/main/` so it can be updated without rewriting the UI.
- Distribution signing and the minimum macOS version ultimately depend on the selected Electron release and your signing setup.

See [PLAN.md](./PLAN.md) for the completed MVP checklist and
[PLAN_V0.2.md](./PLAN_V0.2.md) for the next release roadmap.
