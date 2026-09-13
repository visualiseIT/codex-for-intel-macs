import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  CodexDesktopApi,
  CodexSettings,
  DictationAudio,
  NotificationPreferences,
  StartTurnInput,
  SteerTurnInput,
  ThreadGoalStatus,
  UiEvent,
} from "../shared/types";

const api: CodexDesktopApi = {
  getConnectionState: () => ipcRenderer.invoke("codex:connection"),
  setTheme: (theme) => ipcRenderer.invoke("app:set-theme", theme),
  chooseWorkspace: () => ipcRenderer.invoke("codex:choose-workspace"),
  chooseImages: () => ipcRenderer.invoke("codex:choose-images"),
  prepareImages: (paths) => ipcRenderer.invoke("codex:prepare-images", paths),
  prepareClipboardImages: (images) =>
    ipcRenderer.invoke("codex:prepare-clipboard-images", images),
  referenceFiles: (paths, cwd) =>
    ipcRenderer.invoke("codex:reference-files", paths, cwd),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  listThreads: (input) => ipcRenderer.invoke("codex:list-threads", input),
  listModels: () => ipcRenderer.invoke("codex:list-models"),
  openThread: (threadId) => ipcRenderer.invoke("codex:open-thread", threadId),
  getThreadSummaries: (threadIds) =>
    ipcRenderer.invoke("codex:get-thread-summaries", threadIds),
  openThreadInNewWindow: (threadId) =>
    ipcRenderer.invoke("app:open-thread-window", threadId),
  createThread: (settings: CodexSettings) =>
    ipcRenderer.invoke("codex:create-thread", settings),
  renameThread: (threadId, name) =>
    ipcRenderer.invoke("codex:rename-thread", threadId, name),
  archiveThread: (threadId) =>
    ipcRenderer.invoke("codex:archive-thread", threadId),
  unarchiveThread: (threadId) =>
    ipcRenderer.invoke("codex:unarchive-thread", threadId),
  deleteThread: (threadId) =>
    ipcRenderer.invoke("codex:delete-thread", threadId),
  forkThread: (threadId, lastTurnId) =>
    ipcRenderer.invoke("codex:fork-thread", threadId, lastTurnId),
  compactThread: (threadId) =>
    ipcRenderer.invoke("codex:compact-thread", threadId),
  getThreadGoal: (threadId) =>
    ipcRenderer.invoke("codex:get-thread-goal", threadId),
  setThreadGoal: (
    threadId: string,
    objective: string,
    status: ThreadGoalStatus,
    tokenBudget: number | null,
  ) =>
    ipcRenderer.invoke(
      "codex:set-thread-goal",
      threadId,
      objective,
      status,
      tokenBudget,
    ),
  clearThreadGoal: (threadId) =>
    ipcRenderer.invoke("codex:clear-thread-goal", threadId),
  startTurn: (input: StartTurnInput) =>
    ipcRenderer.invoke("codex:start-turn", input),
  steerTurn: (input: SteerTurnInput) =>
    ipcRenderer.invoke("codex:steer-turn", input),
  queuePrompt: (input: StartTurnInput) =>
    ipcRenderer.invoke("codex:queue-prompt", input),
  listQueuedPrompts: (threadId) =>
    ipcRenderer.invoke("codex:list-queued-prompts", threadId),
  deleteQueuedPrompt: (threadId, queuedPromptId) =>
    ipcRenderer.invoke("codex:delete-queued-prompt", threadId, queuedPromptId),
  startNextQueuedPrompt: (threadId) =>
    ipcRenderer.invoke("codex:start-next-queued-prompt", threadId),
  interruptTurn: (threadId, turnId) =>
    ipcRenderer.invoke("codex:interrupt-turn", threadId, turnId),
  getUsage: () => ipcRenderer.invoke("codex:usage"),
  getDiagnostics: () => ipcRenderer.invoke("codex:diagnostics"),
  reconnect: () => ipcRenderer.invoke("codex:reconnect"),
  getNotificationPreferences: () =>
    ipcRenderer.invoke("app:get-notification-preferences"),
  setNotificationPreferences: (preferences: NotificationPreferences) =>
    ipcRenderer.invoke("app:set-notification-preferences", preferences),
  getTranscriptionStatus: () =>
    ipcRenderer.invoke("app:get-transcription-status"),
  setTranscriptionApiKey: (apiKey) =>
    ipcRenderer.invoke("app:set-transcription-api-key", apiKey),
  transcribeAudio: (audio: DictationAudio) =>
    ipcRenderer.invoke("app:transcribe-audio", audio),
  resolveInteraction: (requestId, result) =>
    ipcRenderer.invoke("codex:resolve-interaction", requestId, result),
  onEvent: (listener: (event: UiEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, event: UiEvent): void =>
      listener(event);
    ipcRenderer.on("codex:event", handler);
    return () => ipcRenderer.removeListener("codex:event", handler);
  },
};

contextBridge.exposeInMainWorld("codex", api);
