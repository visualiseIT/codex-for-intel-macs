# Codex Desktop Intel v0.2 Plan

## Status

- Current patch release: `0.2.1`
- Planning status: P0 implemented; manual packaged-app validation pending
- Baseline: the `0.1.1` MVP launches Codex correctly from a packaged Intel macOS app, loads persisted threads, streams conversations, supports approvals and user questions, and provides system/light/dark themes.
- First real chat through the custom desktop UI confirmed on 11 September 2026.

## Goal

Turn the functional MVP into a comfortable daily-driver desktop client. Version 0.2 should make conversations easier to read, thread history easier to manage, visual context easier to send, usage and failures easier to understand, and common coding workflows accessible without leaving the app.

## Product principles

- Keep Codex and `codex app-server` as the sources of truth for authentication, threads, turns, and agent state.
- Prefer stable app-server APIs. Experimental APIs must be isolated, feature-detected, and allowed to fail without breaking core chat.
- Preserve the existing secure Electron boundary: no Node.js access in the renderer and only narrow, typed preload methods.
- Keep conservative permission defaults and make destructive actions explicit.
- Continue supporting Intel (`x86_64`) macOS as the primary packaged target.

## Release priorities

- **P0 — required:** daily-driver polish required to ship v0.2.
- **P1 — desired:** high-value workflows to include after P0 is stable.
- **P2 — stretch:** useful additions that may move to v0.3 without delaying v0.2.

## P0 — Daily-driver experience

### Rich conversation rendering

- [x] Render assistant responses as GitHub-flavored Markdown.
- [x] Add syntax highlighting with language labels for fenced code blocks.
- [x] Add one-click copy controls for code blocks and command output.
- [x] Open external links safely in the system browser rather than inside Electron.
- [x] Sanitize rendered content and keep raw HTML disabled by default.
- [x] Preserve streaming behavior without repeatedly rebuilding the entire conversation.
- [x] Add readable fallbacks for unknown or malformed content.

### File changes and command activity

- [x] Render Codex file changes as proper unified diffs with added, removed, and context lines.
- [x] Group changes by file and allow individual files to be expanded or collapsed.
- [x] Show a concise per-file change summary before the full patch.
- [x] Keep long command output collapsed by default with expand and copy actions.
- [x] Clearly distinguish running, completed, failed, interrupted, and approval-waiting activity.
- [x] Bound large patch rendering and keep long command logs collapsible.

### Thread management

- [x] Rename threads through `thread/name/set`.
- [x] Pin and unpin threads locally; migrate to `thread/metadata/update` when the installed CLI schema exposes pin metadata.
- [x] Sort pinned threads above recent threads.
- [x] Archive threads through `thread/archive`.
- [x] Add an archived-thread view and restore with `thread/unarchive`.
- [x] Permanently delete threads through `thread/delete` only after a clear destructive confirmation.
- [x] React to name, archive, unarchive, and delete notifications without requiring an app restart.
- [x] Add cursor-based thread pagination beyond the previous 100-thread limit.
- [x] Preserve search and selection correctly while pages or filters change.

### Image and file context

- [x] Add an attachment picker to the composer.
- [x] Support drag-and-drop and clipboard paste for local images.
- [x] Show removable image previews before sending.
- [x] Send images as app-server `localImage` inputs.
- [x] Check the selected model's advertised input modalities and disable image sending when unsupported.
- [x] Validate paths, supported image types, file sizes, and missing files before sending.
- [x] Never copy attachments into application storage unless the user explicitly requests it.
- [x] Add a safe general-file workflow that inserts a workspace-relative file reference into the prompt; do not pretend arbitrary files are native app-server attachments.

### Usage, connection, and diagnostics

- [x] Show a compact ChatGPT usage/rate-limit indicator when the authenticated account provides it.
- [x] Display reset time and used percentage without blocking normal chat when usage data is unavailable.
- [x] Refresh the display from `account/rateLimits/updated` notifications.
- [x] Add a reconnect/restart Codex action.
- [x] Show the detected Codex executable, CLI version, connection state, process, and workspace context in diagnostics.
- [x] Preserve a bounded app-server stderr tail for troubleshooting.
- [x] Add a copy-diagnostics action that redacts likely secrets and authentication data.
- [x] Turn process exits and protocol failures into actionable error messages.

## P1 — Coding workflows

### Follow-up interaction polish

- [x] Stop automatic scrolling when the user moves away from the bottom of an active conversation.
- [x] Add a **Jump to latest** control while new output continues below.
- [x] Collapse file-change patches by default while keeping their summaries visible.
- [x] Keep the composer editable for drafting while the active turn is running.
- [x] Add a custom Intel macOS application and Dock icon.
- [ ] Add microphone dictation after choosing a dependable transcription approach and permission flow.

### Active-turn steering

- [ ] Allow another message while a turn is running.
- [ ] Send it through `turn/steer` with the expected active turn ID.
- [ ] Visually distinguish steering instructions from new turns.
- [ ] Fall back cleanly when the turn finishes before the steering request arrives.

### Dedicated review mode

- [ ] Add a **Review changes** action backed by `review/start`.
- [ ] Support uncommitted changes, base branch, commit, and custom review targets.
- [ ] Allow inline reviews and detached review threads.
- [ ] Render entered/exited review states and findings clearly in the timeline.
- [ ] Prevent review actions when the selected workspace is not a Git repository.

### Conversation controls

- [ ] Fork a thread, optionally from a selected turn, through `thread/fork`.
- [ ] Surface the parent/fork relationship in the thread UI.
- [ ] Add manual conversation compaction through `thread/compact/start`.
- [ ] Render compaction progress and completion without duplicating timeline items.
- [ ] Add thread goal view/set/clear controls when supported by the installed CLI.

### Desktop notifications

- [ ] Notify when a long-running turn completes while the app is unfocused.
- [ ] Notify when Codex is waiting for approval or user input.
- [ ] Add notification preferences and avoid duplicate notifications.
- [ ] Clicking a notification should focus the relevant thread.

## P2 — Stretch features

### Integrated terminal

- [ ] Prototype a sandboxed terminal using `command/exec` rather than unsandboxed process APIs.
- [ ] Stream output, support stdin, resize PTYs, and terminate running commands.
- [ ] Label terminal sandbox and permission behavior prominently.
- [ ] Keep `thread/shellCommand` out of the first implementation because it runs outside the thread sandbox.

### Advanced Codex controls

- [ ] Discover and select collaboration modes when supported.
- [ ] List available skills for the selected workspace and insert an explicit skill invocation.
- [ ] Add a personality selector only for models that advertise support.
- [ ] Hide experimental controls when the installed CLI does not support them.

### Convenience features

- [ ] Add configurable keyboard shortcuts and a command palette.
- [ ] Add voice-to-text prompt input with an explicit recording state.
- [ ] Support multiple open workspaces or windows without mixing thread state.

## Deferred beyond v0.2

- [ ] Code signing, notarization, and a repeatable distribution pipeline.
- [ ] Automatic updates with signed release metadata and rollback behavior.
- [ ] Remote app-server connections. WebSocket transport is currently experimental and should not be exposed as a normal user option yet.
- [ ] Multiple simultaneous remote app-server connections.
- [ ] Plugin marketplace installation or other app-server APIs documented as under development.

## Technical implementation plan

### Protocol layer

- [x] Generate TypeScript definitions from the installed CLI with `codex app-server generate-ts` and compare them with the hand-written adapter types.
- [x] Add typed service methods only for the endpoints used in v0.2.
- [x] Add cursor/result types without exposing raw JSON-RPC objects to the renderer.
- [x] Track active thread and turn IDs for notifications and reconnect behavior.
- [x] Add capability checks for model image modalities.
- [x] Treat completed item notifications as authoritative while retaining smooth deltas during streaming.

### Electron IPC and security

- [x] Extend the preload API with narrow methods for P0 thread actions, attachments, usage, and diagnostics.
- [ ] Validate every renderer-supplied path, identifier, enum, and payload in the main process.
- [x] Use native file dialogs only from trusted Electron contexts.
- [x] Add explicit confirmation for permanent deletion.
- [x] Keep diagnostics bounded and redact secrets before returning them to the renderer.

### Renderer architecture

- [ ] Split the current main React component into conversation, sidebar, composer, activity, dialog, and settings modules.
- [x] Add reusable timeline renderers by normalized item kind.
- [ ] Keep thread pagination, filters, and optimistic actions in a dedicated state layer.
- [ ] Preserve accessible keyboard navigation, focus handling, and light/dark contrast.
- [ ] Virtualize only the views shown by profiling to need it.

## Testing checklist

### Automated

- [ ] Unit-test Markdown sanitization and code-block behavior.
- [ ] Unit-test diff parsing and large-output truncation/collapse logic.
- [ ] Unit-test pagination, optimistic thread actions, and notification reconciliation.
- [x] Unit-test attachment and workspace file-reference validation.
- [x] Unit-test rate-limit normalization and missing data.
- [ ] Unit-test steering races, review item normalization, forks, and compaction events.
- [ ] Add integration tests for every new IPC handler and preload method.
- [x] Extend the app-server smoke test with read-only calls for v0.2 endpoints.
- [x] Run formatting, linting, TypeScript, unit tests, and production build checks.

### Manual on Intel macOS

- [ ] Send and receive a normal prompt.
- [ ] Restart the app and resume the same conversation.
- [ ] Trigger and answer a harmless command approval.
- [ ] Trigger and answer a file-change approval.
- [ ] Stop an active turn and confirm the final state is interrupted.
- [ ] Verify Read only, Workspace write, and Full access labels and behavior.
- [ ] Test Markdown, code copying, a large diff, and long command output.
- [ ] Rename, pin, archive, restore, and permanently delete disposable threads.
- [ ] Load more than 100 threads and verify search and selection.
- [ ] Paste, drag, select, preview, send, and remove supported images.
- [ ] Disconnect/restart Codex and verify recovery without losing the active thread.
- [ ] Test both light and dark themes at compact and full-window sizes.
- [ ] Package and launch the unsigned x64 build with a Terminal-style minimal `PATH`.

## Release acceptance criteria

Version 0.2 is ready when:

- All P0 checklist items are complete.
- P1 items included in the release are complete and tested; unfinished P1 items are moved explicitly to the next plan.
- No known regression affects conversation loading, sending, streaming, approvals, interruption, or theme persistence.
- The automated check suite and app-server smoke test pass.
- The manual Intel macOS checklist passes on the packaged x64 application.
- `README.md`, screenshots, version metadata, and release notes describe the shipped behavior accurately.
- Git status is clean and the release is represented by descriptive commits and a matching version tag.

## Suggested implementation sequence

1. Protocol schema audit and renderer component split.
2. Markdown, code blocks, and activity/diff rendering.
3. Thread actions and pagination.
4. Image attachments and model capability checks.
5. Usage indicator, diagnostics, and reconnect behavior.
6. Active-turn steering and review mode.
7. Forking, compaction, goals, and notifications as schedule permits.
8. Automated regression coverage, full manual Intel test pass, and packaging.

## Protocol reference

The feature mapping in this plan follows the [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server). The protocol evolves with the installed Codex CLI, so implementation should verify generated schemas against the version being packaged and should gate experimental features at runtime.
