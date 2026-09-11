import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import type { CodexSettings, StartTurnInput, UiEvent } from "../shared/types";
import { CodexService } from "./codex-service";

const service = new CodexService();
let mainWindow: BrowserWindow | null = null;

function sendEvent(event: UiEvent): void {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("codex:event", event);
}

function registerIpc(): void {
  ipcMain.handle("codex:connection", () => service.getConnectionState());
  ipcMain.handle("codex:choose-workspace", async () => {
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose a Codex workspace",
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("codex:list-threads", (_event, searchTerm?: string) =>
    service.listThreads(searchTerm),
  );
  ipcMain.handle("codex:list-models", () => service.listModels());
  ipcMain.handle("codex:open-thread", (_event, threadId: string) =>
    service.openThread(threadId),
  );
  ipcMain.handle("codex:create-thread", (_event, settings: CodexSettings) =>
    service.createThread(settings),
  );
  ipcMain.handle("codex:start-turn", (_event, input: StartTurnInput) =>
    service.startTurn(input),
  );
  ipcMain.handle(
    "codex:interrupt-turn",
    (_event, threadId: string, turnId: string) =>
      service.interruptTurn(threadId, turnId),
  );
  ipcMain.handle(
    "codex:resolve-interaction",
    (_event, requestId: number | string, result: unknown) => {
      service.resolveInteraction(requestId, result);
    },
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f4f1ea",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  service.on("event", sendEvent);
  createWindow();
  void service.connect().catch(() => undefined);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => service.close());
