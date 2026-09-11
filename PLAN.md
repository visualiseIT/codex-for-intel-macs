# Codex Desktop MVP Plan

## Goal

Build a small Intel-compatible macOS desktop client for the locally installed Codex CLI. The app will use `codex app-server` over stdio, keep Codex as the source of truth for conversation history, and present threads, streamed responses, tool activity, and approvals in a chat interface.

## Technical decisions

- Electron, React, TypeScript, and Vite for a straightforward macOS x64 build.
- A long-lived `codex app-server --stdio` child process owned by Electron's main process.
- A narrow, typed IPC bridge exposed through Electron preload; the renderer never receives Node.js access.
- JSON-RPC request tracking and newline-delimited message parsing isolated in a reusable app-server client.
- Codex's own persisted threads for history; local storage is limited to UI preferences such as the last workspace.
- Workspace-write sandboxing and `unlessTrusted` approvals as visible, conservative defaults.

## MVP checklist

### Foundation

- [x] Scaffold the Electron/React/TypeScript application.
- [x] Configure development, type-checking, testing, production builds, and macOS x64 packaging.
- [x] Add a secure context-isolated preload API.

### Codex integration

- [x] Start and stop `codex app-server` with the desktop application.
- [x] Implement JSON-RPC initialization, request correlation, notifications, server requests, and failure handling.
- [x] List persisted CLI, VS Code, exec, and app-server threads.
- [x] Start new threads and resume existing threads.
- [x] Load turn history and translate Codex items into renderer-friendly chat entries.
- [x] Start and interrupt turns.
- [x] Stream assistant deltas and tool/file activity into the active conversation.
- [x] Surface command and file-change approval requests and return the user's decision.

### User interface

- [x] Add a workspace folder picker and remember the last selection.
- [x] Add searchable thread navigation and a new-chat action.
- [x] Add a chat timeline for user, assistant, command, file-change, plan, and status entries.
- [x] Add a multiline composer with send and stop controls.
- [x] Add model, reasoning-effort, and sandbox controls.
- [x] Add approval dialogs and clear connection/error states.
- [x] Add responsive styling suitable for an Intel Mac desktop window.

### Quality and handoff

- [x] Unit-test JSON-RPC framing, request correlation, and history/event normalization.
- [x] Run formatting, linting, tests, type-checking, and production build checks.
- [x] Smoke-test the integration against the installed Codex CLI.
- [x] Document setup, development, packaging, security defaults, and known MVP limitations.
- [x] Inspect Git status and commit the finished implementation.

## Deferred until after MVP

- Rich Markdown syntax highlighting and patch diff views.
- Image/file attachments and drag-and-drop.
- Thread rename, pin, archive, and pagination controls.
- Multiple simultaneous app-server connections or remote WebSocket servers.
- Auto-update, code signing, notarization, and distribution outside the local Mac.
- Voice input, notifications, and advanced Codex features such as collaboration modes.

## Acceptance criteria

The MVP is complete when an authenticated local Codex user can launch the app, choose a folder, browse existing threads, open or create a conversation, send a prompt, watch the response and tool activity stream, answer command/file approvals, stop an active turn, relaunch the app without losing Codex history, and produce a macOS x64 package from the documented command.
