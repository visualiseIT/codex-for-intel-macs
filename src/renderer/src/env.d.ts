/// <reference types="vite/client" />

import type { CodexDesktopApi } from "../../shared/types";

declare global {
  interface Window {
    codex: CodexDesktopApi;
  }
}

export {};
