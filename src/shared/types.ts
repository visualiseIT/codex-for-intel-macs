export type ConnectionState =
  "connecting" | "connected" | "disconnected" | "error";

export type SandboxMode =
  "read-only" | "workspace-write" | "danger-full-access";

export type ThemeMode = "system" | "light" | "dark";

export interface CodexSettings {
  cwd: string;
  model: string;
  effort: string;
  sandbox: SandboxMode;
}

export interface ThreadSummary {
  id: string;
  title: string;
  preview: string;
  cwd: string;
  model: string | null;
  createdAt: number;
  updatedAt: number;
  status: string;
}

export interface ThreadListInput {
  searchTerm?: string;
  cursor?: string;
  archived?: boolean;
}

export interface ThreadPage {
  threads: ThreadSummary[];
  nextCursor: string | null;
}

export interface FileChange {
  path: string;
  kind: string;
  diff: string;
}

export type ChatItemKind =
  | "user"
  | "assistant"
  | "command"
  | "file"
  | "plan"
  | "reasoning"
  | "tool"
  | "status"
  | "error";

export interface ChatItem {
  id: string;
  kind: ChatItemKind;
  title?: string;
  text: string;
  status?: string;
  changes?: FileChange[];
}

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  isDefault: boolean;
  efforts: string[];
  defaultEffort: string;
  inputModalities: string[];
}

export interface ImageAttachment {
  path: string;
  name: string;
  size: number;
  dataUrl: string;
}

export interface OpenThreadResult {
  thread: ThreadSummary;
  items: ChatItem[];
}

export interface StartTurnInput extends CodexSettings {
  threadId: string;
  prompt: string;
  imagePaths: string[];
}

export interface StartTurnResult {
  turnId: string;
}

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface UsageInfo {
  label: string;
  planType: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  reached: boolean;
}

export interface CodexDiagnostics {
  connection: ConnectionState;
  message: string;
  binary: string;
  cliVersion: string;
  processId: number | null;
  startedAt: number | null;
  stderrTail: string;
}

export type InteractionKind = "command" | "file" | "user-input";

export interface UserInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: Array<{ label: string; description: string }> | null;
}

export interface PendingInteraction {
  requestId: number | string;
  kind: InteractionKind;
  threadId: string;
  turnId: string;
  title: string;
  detail: string;
  command?: string;
  cwd?: string;
  questions?: UserInputQuestion[];
}

export type UiEvent =
  | { type: "connection"; state: ConnectionState; message?: string }
  | {
      type: "item";
      phase: "started" | "completed";
      threadId: string;
      turnId: string;
      item: ChatItem;
    }
  | {
      type: "delta";
      threadId: string;
      turnId: string;
      itemId: string;
      delta: string;
    }
  | {
      type: "turn";
      phase: "started" | "completed";
      threadId: string;
      turnId: string;
      status: string;
      error?: string;
    }
  | { type: "interaction"; interaction: PendingInteraction }
  | {
      type: "thread-changed";
      threadId: string;
      action: "changed" | "archived" | "unarchived" | "deleted";
    }
  | { type: "usage"; usage: UsageInfo | null }
  | { type: "error"; message: string; threadId?: string };

export interface CodexDesktopApi {
  getConnectionState(): Promise<{ state: ConnectionState; message?: string }>;
  setTheme(theme: ThemeMode): Promise<void>;
  chooseWorkspace(): Promise<string | null>;
  chooseImages(): Promise<ImageAttachment[]>;
  prepareImages(paths: string[]): Promise<ImageAttachment[]>;
  getDroppedFilePath(file: File): string;
  listThreads(input?: ThreadListInput): Promise<ThreadPage>;
  listModels(): Promise<ModelOption[]>;
  openThread(threadId: string): Promise<OpenThreadResult>;
  createThread(settings: CodexSettings): Promise<ThreadSummary>;
  renameThread(threadId: string, name: string): Promise<void>;
  archiveThread(threadId: string): Promise<void>;
  unarchiveThread(threadId: string): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  startTurn(input: StartTurnInput): Promise<StartTurnResult>;
  interruptTurn(threadId: string, turnId: string): Promise<void>;
  getUsage(): Promise<UsageInfo | null>;
  getDiagnostics(): Promise<CodexDiagnostics>;
  reconnect(): Promise<void>;
  resolveInteraction(
    requestId: number | string,
    result: unknown,
  ): Promise<void>;
  onEvent(listener: (event: UiEvent) => void): () => void;
}
