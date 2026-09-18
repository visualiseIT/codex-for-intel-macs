import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  Notification,
  shell,
  systemPreferences,
} from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CodexSettings,
  ClipboardImageInput,
  DictationAudio,
  MicrophonePermissionStatus,
  NotificationPreferences,
  StartTurnInput,
  SteerTurnInput,
  ThreadListInput,
  ThreadGoalStatus,
  ThemeMode,
  UiEvent,
} from "../shared/types";
import { CodexService } from "./codex-service";
import { ActiveTurnRegistry } from "./active-turns";
import {
  persistClipboardImages,
  prepareFileReferences,
  prepareImageAttachments,
} from "./image-attachments";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationForEvent,
} from "./notifications";
import { TranscriptionService } from "./transcription";
import { DesktopUpdater } from "./updater";

const service = new CodexService();
let mainWindow: BrowserWindow | null = null;
const windows = new Set<BrowserWindow>();
let notificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
let preferencesPath = "";
let transcriptionService: TranscriptionService | null = null;
let attachmentStoragePath = "";
let desktopUpdater: DesktopUpdater | null = null;
const shownNotifications = new Set<string>();
const activeTurns = new ActiveTurnRegistry();

function readNotificationPreferences(): NotificationPreferences {
  if (!preferencesPath || !existsSync(preferencesPath))
    return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    const value: unknown = JSON.parse(readFileSync(preferencesPath, "utf8"));
    if (typeof value !== "object" || value === null)
      return DEFAULT_NOTIFICATION_PREFERENCES;
    const candidate = value as Partial<NotificationPreferences>;
    return {
      turnCompleted: candidate.turnCompleted !== false,
      attentionRequired: candidate.attentionRequired !== false,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

function saveNotificationPreferences(value: NotificationPreferences): void {
  notificationPreferences = {
    turnCompleted: value.turnCompleted === true,
    attentionRequired: value.attentionRequired === true,
  };
  writeFileSync(preferencesPath, JSON.stringify(notificationPreferences), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function microphonePermissionStatus(): MicrophonePermissionStatus {
  return process.platform === "darwin"
    ? systemPreferences.getMediaAccessStatus("microphone")
    : "granted";
}

function showTestNotification(): Promise<void> {
  if (!Notification.isSupported())
    return Promise.reject(
      new Error("Desktop notifications are not supported on this system."),
    );
  return new Promise((resolve, reject) => {
    const notification = new Notification({
      title: "Codex notifications are ready",
      body: "Background completion and attention alerts are enabled.",
    });
    const timeout = setTimeout(
      () => reject(new Error("macOS did not confirm notification delivery.")),
      5_000,
    );
    notification.once("show", () => {
      clearTimeout(timeout);
      resolve();
    });
    notification.once("failed", (_event, error) => {
      clearTimeout(timeout);
      reject(new Error(`macOS could not display the notification: ${error}`));
    });
    notification.show();
  });
}

function sendEvent(event: UiEvent): void {
  if (event.type === "turn") {
    if (event.phase === "started") {
      activeTurns.startObserved(event.threadId, event.turnId);
    } else {
      activeTurns.completionObserved(event.threadId, event.turnId);
    }
  } else if (event.type === "connection" && event.state !== "connected") {
    activeTurns.clear();
  }
  for (const window of windows)
    if (!window.isDestroyed()) window.webContents.send("codex:event", event);
  const spec = notificationForEvent(
    event,
    notificationPreferences,
    [...windows].some((window) => window.isFocused()),
  );
  if (!spec || shownNotifications.has(spec.key) || !Notification.isSupported())
    return;
  shownNotifications.add(spec.key);
  if (shownNotifications.size > 500) shownNotifications.clear();
  const notification = new Notification({ title: spec.title, body: spec.body });
  notification.on("failed", (_event, error) => {
    console.error(`Desktop notification failed: ${error}`);
    app.dock?.bounce("informational");
  });
  notification.on("click", () => {
    const target =
      mainWindow && !mainWindow.isDestroyed()
        ? mainWindow
        : [...windows].find((window) => !window.isDestroyed());
    target?.show();
    target?.focus();
    if (target)
      target.webContents.send("codex:event", {
        type: "focus-thread",
        threadId: spec.threadId,
      } satisfies UiEvent);
  });
  notification.show();
}

function registerIpc(): void {
  ipcMain.handle("codex:connection", () => service.getConnectionState());
  ipcMain.handle("app:set-theme", (_event, theme: ThemeMode) => {
    nativeTheme.themeSource = theme;
    for (const window of windows)
      window.setBackgroundColor(
        nativeTheme.shouldUseDarkColors ? "#171815" : "#f4f1ea",
      );
  });
  ipcMain.handle("codex:choose-workspace", async (event) => {
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose a Codex workspace",
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("codex:choose-images", async (event) => {
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile", "multiSelections"],
      title: "Attach images",
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? [] : prepareImageAttachments(result.filePaths);
  });
  ipcMain.handle("codex:prepare-images", (_event, paths: string[]) =>
    prepareImageAttachments(paths),
  );
  ipcMain.handle(
    "codex:prepare-clipboard-images",
    (_event, images: ClipboardImageInput[]) => {
      if (!attachmentStoragePath)
        throw new Error("Clipboard storage is not ready.");
      return persistClipboardImages(images, attachmentStoragePath);
    },
  );
  ipcMain.handle(
    "codex:reference-files",
    (_event, paths: string[], cwd: string) => prepareFileReferences(paths, cwd),
  );
  ipcMain.handle("codex:list-threads", (_event, input?: ThreadListInput) =>
    service.listThreads(input),
  );
  ipcMain.handle("codex:list-models", () => service.listModels());
  ipcMain.handle("codex:open-thread", (_event, threadId: string) =>
    service.openThread(threadId),
  );
  ipcMain.handle(
    "codex:get-active-turn",
    (_event, threadId: string): string | null =>
      activeTurns.activeTurn(threadId),
  );
  ipcMain.handle("codex:get-active-threads", () =>
    activeTurns.activeThreadIds(),
  );
  ipcMain.handle("app:mark-thread-read", (_event, threadId: string) => {
    if (threadId.trim()) sendEvent({ type: "thread-read", threadId });
  });
  ipcMain.handle(
    "codex:load-earlier-thread-turns",
    (_event, threadId: string, cursor: string) =>
      service.loadEarlierThreadTurns(threadId, cursor),
  );
  ipcMain.handle("codex:get-thread-summaries", (_event, threadIds: string[]) =>
    service.getThreadSummaries(threadIds),
  );
  ipcMain.handle("app:open-thread-window", (_event, threadId: string) => {
    if (!threadId.trim()) throw new Error("A conversation ID is required.");
    createWindow(threadId);
  });
  ipcMain.handle("codex:create-thread", (_event, settings: CodexSettings) =>
    service.createThread(settings),
  );
  ipcMain.handle(
    "codex:rename-thread",
    async (_event, threadId: string, name: string) => {
      await service.renameThread(threadId, name);
      const [thread] = await service.getThreadSummaries([threadId]);
      sendEvent({
        type: "thread-changed",
        threadId,
        action: "changed",
        ...(thread ? { thread } : {}),
      });
    },
  );
  ipcMain.handle("codex:archive-thread", (_event, threadId: string) =>
    service.archiveThread(threadId),
  );
  ipcMain.handle("codex:unarchive-thread", (_event, threadId: string) =>
    service.unarchiveThread(threadId),
  );
  ipcMain.handle("codex:delete-thread", (_event, threadId: string) =>
    service.deleteThread(threadId),
  );
  ipcMain.handle(
    "codex:fork-thread",
    async (_event, threadId: string, lastTurnId?: string) => {
      const forked = await service.forkThread(threadId, lastTurnId);
      sendEvent({
        type: "thread-changed",
        threadId: forked.id,
        action: "changed",
        thread: forked,
      });
      return forked;
    },
  );
  ipcMain.handle("codex:compact-thread", (_event, threadId: string) =>
    service.compactThread(threadId),
  );
  ipcMain.handle("codex:get-thread-goal", (_event, threadId: string) =>
    service.getThreadGoal(threadId),
  );
  ipcMain.handle(
    "codex:set-thread-goal",
    (
      _event,
      threadId: string,
      objective: string,
      status: ThreadGoalStatus,
      tokenBudget: number | null,
    ) => service.setThreadGoal(threadId, objective, status, tokenBudget),
  );
  ipcMain.handle("codex:clear-thread-goal", (_event, threadId: string) =>
    service.clearThreadGoal(threadId),
  );
  ipcMain.handle("codex:start-turn", async (_event, input: StartTurnInput) => {
    if (!activeTurns.beginStart(input.threadId))
      throw new Error("This conversation already has an active turn.");
    try {
      const result = await service.startTurn(input);
      activeTurns.finishStart(input.threadId, result.turnId);
      return result;
    } catch (error) {
      activeTurns.abandonStart(input.threadId);
      throw error;
    }
  });
  ipcMain.handle("codex:steer-turn", (_event, input: SteerTurnInput) =>
    service.steerTurn(input),
  );
  ipcMain.handle("codex:queue-prompt", (_event, input: StartTurnInput) =>
    service.queuePrompt(input),
  );
  ipcMain.handle("codex:list-queued-prompts", (_event, threadId: string) =>
    service.listQueuedPrompts(threadId),
  );
  ipcMain.handle(
    "codex:delete-queued-prompt",
    (_event, threadId: string, queuedPromptId: string) =>
      service.deleteQueuedPrompt(threadId, queuedPromptId),
  );
  ipcMain.handle("codex:start-next-queued-prompt", (_event, threadId: string) =>
    service.startNextQueuedPrompt(threadId),
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
  ipcMain.handle("codex:usage", () => service.getUsage());
  ipcMain.handle("codex:diagnostics", () => service.getDiagnostics());
  ipcMain.handle("codex:reconnect", () => service.reconnect());
  ipcMain.handle(
    "app:get-notification-preferences",
    () => notificationPreferences,
  );
  ipcMain.handle(
    "app:set-notification-preferences",
    (_event, value: NotificationPreferences) =>
      saveNotificationPreferences(value),
  );
  ipcMain.handle("app:test-notification", () => showTestNotification());
  ipcMain.handle("app:get-microphone-permission-status", () =>
    microphonePermissionStatus(),
  );
  ipcMain.handle("app:request-microphone-permission", async () => {
    if (process.platform !== "darwin") return "granted";
    const current = microphonePermissionStatus();
    if (current !== "not-determined") return current;
    const granted = await systemPreferences.askForMediaAccess("microphone");
    return granted ? "granted" : microphonePermissionStatus();
  });
  ipcMain.handle("app:open-microphone-settings", () =>
    shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    ),
  );
  ipcMain.handle("app:get-transcription-status", () =>
    transcriptionService?.status(),
  );
  ipcMain.handle("app:set-transcription-api-key", (_event, apiKey: string) => {
    if (!transcriptionService) throw new Error("Dictation is not ready.");
    return transcriptionService.setApiKey(apiKey);
  });
  ipcMain.handle("app:transcribe-audio", (_event, audio: DictationAudio) => {
    if (!transcriptionService) throw new Error("Dictation is not ready.");
    return transcriptionService.transcribe(audio);
  });
  ipcMain.handle("app:get-update-status", () => desktopUpdater?.getStatus());
  ipcMain.handle("app:check-for-updates", () => desktopUpdater?.check());
  ipcMain.handle("app:download-update", () => desktopUpdater?.download());
  ipcMain.handle("app:install-update", () =>
    desktopUpdater?.install(activeTurns.hasAny()),
  );
}

function createWindow(initialThreadId?: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1260,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    titleBarStyle: "hiddenInset",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#171815" : "#f4f1ea",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  windows.add(window);
  mainWindow = window;
  window.on("closed", () => {
    windows.delete(window);
    if (mainWindow === window)
      mainWindow =
        [...windows].find((candidate) => !candidate.isDestroyed()) ?? null;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol === "https:" || protocol === "http:")
        void shell.openExternal(url);
    } catch {
      // Deny malformed and non-web URLs.
    }
    return { action: "deny" };
  });

  window.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const allowMicrophone =
        [...windows].some(
          (candidate) => candidate.webContents === webContents,
        ) &&
        permission === "media" &&
        "mediaTypes" in details &&
        details.mediaTypes?.includes("audio");
      callback(allowMicrophone === true);
    },
  );
  window.webContents.session.setPermissionCheckHandler(
    (webContents, permission, _origin, details) =>
      webContents !== null &&
      [...windows].some((candidate) => candidate.webContents === webContents) &&
      permission === "media" &&
      details.mediaType === "audio",
  );

  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    if (initialThreadId) url.searchParams.set("thread", initialThreadId);
    void window.loadURL(url.toString());
  } else {
    void window.loadFile(
      join(__dirname, "../renderer/index.html"),
      initialThreadId ? { query: { thread: initialThreadId } } : undefined,
    );
  }
  return window;
}

app.whenReady().then(() => {
  const userData = app.getPath("userData");
  preferencesPath = join(userData, "desktop-preferences.json");
  notificationPreferences = readNotificationPreferences();
  transcriptionService = new TranscriptionService(
    join(userData, "transcription-api-key.enc"),
  );
  attachmentStoragePath = join(userData, "clipboard-images");
  desktopUpdater = new DesktopUpdater((status) =>
    sendEvent({ type: "update", status }),
  );
  registerIpc();
  service.on("event", sendEvent);
  createWindow();
  void service.connect().catch(() => undefined);
  desktopUpdater.initialize();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => service.close());
