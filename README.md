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
- Thread rename, local starring, archive/restore, permanent deletion, and cursor pagination.
- Fast conversation opening with the newest 12 turns first and older history loaded as you scroll upward.
- Image selection, drag-and-drop, native clipboard screenshots, polished previews, and model capability checks.
- User-message image thumbnails remain visible when reopening conversation history.
- Safe workspace-relative references when non-image files are dropped into the composer.
- Optional ChatGPT usage display plus reconnect and redacted diagnostics controls.
- A composer that grows naturally for multiline prompts, then returns to its compact height when cleared.
- Drafting the next prompt while a turn is still running.
- User-controlled conversation scrolling with a **Jump to latest** shortcut.
- A **Previous prompt** shortcut while browsing earlier output.
- Active-turn steering plus a persistent **Queue next** action for follow-up prompts.
- File-change details collapsed by default to keep long conversations navigable.
- A distinctive custom Dock and application icon.
- Whole-thread and per-prompt forks, manual context compaction, and conversation goals.
- Project-grouped conversation history with indented fork trees, parent breadcrumbs, and fork counts.
- A resizable sidebar that collapses to a compact icon rail and remembers its layout.
- The ability to open a conversation in another window without starting another Codex process.
- Configurable background completion and attention notifications, with a delivery test in Settings.
- Push-to-record microphone dictation using OpenAI's `gpt-transcribe` service.
- Conservative defaults: workspace-write access, no sandbox network access, and on-request approvals.

Codex remains the source of truth for thread history and authentication. The app only remembers UI preferences such as the selected workspace, theme, and locally starred thread IDs. Clipboard screenshots—which have no source file—are stored in the app's private data directory so Codex can receive them and history can display them later. Starring is local in this release because the installed Codex CLI schema does not yet expose server-side pin metadata.

## Requirements

- macOS on Intel or Apple Silicon for development; the packaging command below targets Intel.
- Node.js 22 or newer and npm.
- A current, installed Codex CLI with `codex app-server` support.
- An authenticated Codex CLI session (`codex` should already work in Terminal).

The application looks for `codex` in `PATH`, common Homebrew/npm locations, and installed NVM Node versions. It also preserves the discovered NVM binary directory when launching Codex, because macOS GUI applications do not inherit the Terminal's full `PATH`. If it cannot locate the CLI, set `CODEX_BINARY` to its absolute path before launching.

Microphone dictation requests native macOS microphone permission, records a bounded WebM clip, and sends it to the OpenAI Audio transcription API. Open **Desktop settings** to grant microphone access and add an OpenAI API key; the key is encrypted through macOS Keychain-backed storage and is never returned to the renderer. `OPENAI_API_KEY` is also supported and takes precedence. Audio API usage is billed separately from a Codex subscription.

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

Ad-hoc-signed `.dmg` and `.zip` artifacts are written to `release/`. They are intended for use on the Mac that built them, and macOS may still require you to right-click and choose **Open**.

The desktop client includes a manual-install update flow backed by `electron-updater`: signed release builds check for updates, show download progress in Desktop settings, and install only when the user chooses **Restart and install**. Installation is blocked while a Codex turn is active. The update feed remains disabled until an explicit GitHub Releases owner/repository is embedded during packaging; Developer ID signing and notarization credentials must be supplied outside the repository.

Every distributable rebuild must use a new version number so artifacts and installed builds are unambiguous; never overwrite a previously packaged version.

## Security model

- Electron's renderer has no Node.js integration.
- A context-isolated, sandboxed preload script exposes only the required IPC methods.
- The app starts `codex app-server --stdio` directly; prompts are not interpolated into shell commands.
- Workspace-write mode grants writes only to the selected workspace and disables sandbox network access by default.
- Codex approval requests remain explicit UI decisions. “Allow for session” should only be selected for commands or changes you understand.
- Full-access mode is available because Codex supports it, but it removes filesystem sandbox restrictions and should be used deliberately.

## Known limitations

- Conversation history loads in turn-sized pages; unusually large individual turns can still take longer to render.
- Thread stars are a local UI preference until the installed Codex CLI exposes persisted pin metadata.
- App-server supports native text and image inputs. Other dropped files are inserted as safe workspace-relative prompt references.
- Dedicated review mode remains deferred by request.
- Remote app-server connections remain deferred while WebSocket transport is experimental.
- The App Server surface is still evolving. The protocol adapter is intentionally isolated in `src/main/` so it can be updated without rewriting the UI.
- Distribution signing and the minimum macOS version ultimately depend on the selected Electron release and your signing setup.

See [PLAN.md](./PLAN.md) for the completed MVP checklist and
[PLAN_V0.2.md](./PLAN_V0.2.md) for the next release roadmap.
