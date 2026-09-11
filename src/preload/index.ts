import { contextBridge, ipcRenderer } from "electron";
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
  listThreads: (searchTerm) =>
    ipcRenderer.invoke("codex:list-threads", searchTerm),
  listModels: () => ipcRenderer.invoke("codex:list-models"),
  openThread: (threadId) => ipcRenderer.invoke("codex:open-thread", threadId),
  createThread: (settings: CodexSettings) =>
    ipcRenderer.invoke("codex:create-thread", settings),
  startTurn: (input: StartTurnInput) =>
    ipcRenderer.invoke("codex:start-turn", input),
  interruptTurn: (threadId, turnId) =>
    ipcRenderer.invoke("codex:interrupt-turn", threadId, turnId),
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
