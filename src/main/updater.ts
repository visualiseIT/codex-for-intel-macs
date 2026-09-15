import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { autoUpdater } from "electron-updater";
import type { DesktopUpdateStatus } from "../shared/types";

type StatusListener = (status: DesktopUpdateStatus) => void;

export class DesktopUpdater {
  private status: DesktopUpdateStatus = {
    phase: "disabled",
    version: null,
    percent: null,
    message: "Updates are available in signed release builds.",
  };

  constructor(private readonly onStatus: StatusListener) {}

  initialize(): void {
    if (!app.isPackaged) return;
    if (!existsSync(join(process.resourcesPath, "app-update.yml"))) {
      this.setStatus({
        phase: "disabled",
        version: null,
        percent: null,
        message: "This build has no update server configured.",
      });
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.on("checking-for-update", () =>
      this.setStatus({
        ...this.status,
        phase: "checking",
        message: "Checking for updates…",
      }),
    );
    autoUpdater.on("update-available", (info) =>
      this.setStatus({
        phase: "available",
        version: info.version,
        percent: null,
        message: `Version ${info.version} is available.`,
      }),
    );
    autoUpdater.on("update-not-available", () =>
      this.setStatus({
        phase: "current",
        version: app.getVersion(),
        percent: null,
        message: "You have the latest version.",
      }),
    );
    autoUpdater.on("download-progress", (progress) =>
      this.setStatus({
        ...this.status,
        phase: "downloading",
        percent: Math.round(progress.percent),
        message: `Downloading update… ${Math.round(progress.percent)}%`,
      }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      this.setStatus({
        phase: "downloaded",
        version: info.version,
        percent: 100,
        message: `Version ${info.version} is ready to install.`,
      }),
    );
    autoUpdater.on("error", (error) =>
      this.setStatus({
        ...this.status,
        phase: "error",
        percent: null,
        message: error.message,
      }),
    );
    this.setStatus({
      phase: "idle",
      version: null,
      percent: null,
      message: "Ready to check for updates.",
    });
    setTimeout(() => void this.check().catch(() => undefined), 10_000);
  }

  getStatus(): DesktopUpdateStatus {
    return this.status;
  }

  async check(): Promise<void> {
    this.requireEnabled();
    await autoUpdater.checkForUpdates();
  }

  async download(): Promise<void> {
    if (this.status.phase !== "available")
      throw new Error("No update is ready to download.");
    await autoUpdater.downloadUpdate();
  }

  install(hasActiveTurn: boolean): void {
    if (hasActiveTurn)
      throw new Error(
        "Wait for the active Codex turn to finish before updating.",
      );
    if (this.status.phase !== "downloaded")
      throw new Error("Download the update before installing it.");
    autoUpdater.quitAndInstall(false, true);
  }

  private requireEnabled(): void {
    if (this.status.phase === "disabled") throw new Error(this.status.message);
  }

  private setStatus(status: DesktopUpdateStatus): void {
    this.status = status;
    this.onStatus(status);
  }
}
