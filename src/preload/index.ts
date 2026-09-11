import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  CodexDesktopApi,
  CodexSettings,
  StartTurnInput,
  UiEvent,
} from "../shared/types";

const api: CodexDesktopApi = {
  getConnectionState: () => ipcRenderer.invoke("codex:connection"),
  setTheme: (theme) => ipcRenderer.invoke("app:set-theme", theme),
  chooseWorkspace: () => ipcRenderer.invoke("codex:choose-workspace"),
  chooseImages: () => ipcRenderer.invoke("codex:choose-images"),
  prepareImages: (paths) => ipcRenderer.invoke("codex:prepare-images", paths),
  referenceFiles: (paths, cwd) =>
    ipcRenderer.invoke("codex:reference-files", paths, cwd),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  listThreads: (input) => ipcRenderer.invoke("codex:list-threads", input),
  listModels: () => ipcRenderer.invoke("codex:list-models"),
  openThread: (threadId) => ipcRenderer.invoke("codex:open-thread", threadId),
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
  startTurn: (input: StartTurnInput) =>
    ipcRenderer.invoke("codex:start-turn", input),
  interruptTurn: (threadId, turnId) =>
    ipcRenderer.invoke("codex:interrupt-turn", threadId, turnId),
  getUsage: () => ipcRenderer.invoke("codex:usage"),
  getDiagnostics: () => ipcRenderer.invoke("codex:diagnostics"),
  reconnect: () => ipcRenderer.invoke("codex:reconnect"),
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
