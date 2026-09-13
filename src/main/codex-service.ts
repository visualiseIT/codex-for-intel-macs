import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  CodexSettings,
  CodexDiagnostics,
  ChatItem,
  ConnectionState,
  ModelOption,
  OpenThreadResult,
  PendingInteraction,
  QueuedPrompt,
  StartTurnInput,
  StartTurnResult,
  SteerTurnInput,
  ThreadGoal,
  ThreadGoalStatus,
  ThreadHistoryPage,
  ThreadListInput,
  ThreadPage,
  ThreadSummary,
  UiEvent,
  UsageInfo,
  UserInputQuestion,
} from "../shared/types";
import { CodexProcess } from "./codex-process";
import { prepareImageAttachments } from "./image-attachments";
import { loadLegacyLineage } from "./legacy-lineage";
import {
  normalizeNotification,
  normalizeThread,
  normalizeTurns,
} from "./normalization";

interface RpcMessage {
  id: number | string;
  method: string;
  params?: unknown;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {};
}

async function hydrateItemImages(item: ChatItem): Promise<ChatItem> {
  const images = item.images ?? [];
  const local = images.filter((image) => image.path && !image.dataUrl);
  if (!local.length) return item;
  const loaded = await Promise.allSettled(
    local.map(async (image) => {
      const [prepared] = await prepareImageAttachments([image.path]);
      return { ...prepared, name: image.name || prepared.name };
    }),
  );
  const byPath = new Map(
    loaded.flatMap((result) =>
      result.status === "fulfilled"
        ? [[result.value.path, result.value] as const]
        : [],
    ),
  );
  return {
    ...item,
    images: images.flatMap((image) => {
      if (image.dataUrl) return [image];
      const hydrated = byPath.get(image.path);
      return hydrated ? [hydrated] : [];
    }),
  };
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function turnInput(input: StartTurnInput): unknown[] {
  return [
    ...(input.prompt
      ? [{ type: "text", text: input.prompt, text_elements: [] }]
      : []),
    ...input.imagePaths.map((path) => ({ type: "localImage", path })),
  ];
}

function normalizeGoal(value: unknown): ThreadGoal | null {
  const goal = record(value);
  const threadId = string(goal.threadId);
  const objective = string(goal.objective);
  if (!threadId || !objective) return null;
  return {
    threadId,
    objective,
    status: string(goal.status, "active") as ThreadGoalStatus,
    tokenBudget: number(goal.tokenBudget),
    tokensUsed: number(goal.tokensUsed) ?? 0,
    timeUsedSeconds: number(goal.timeUsedSeconds) ?? 0,
    createdAt: number(goal.createdAt) ?? 0,
    updatedAt: number(goal.updatedAt) ?? 0,
  };
}

function normalizeQueuedPrompt(value: unknown): QueuedPrompt {
  const queued = record(value);
  const input = Array.isArray(queued.input) ? queued.input : [];
  const texts = input
    .map(record)
    .filter((part) => part.type === "text")
    .map((part) => string(part.text))
    .filter(Boolean);
  const imageCount = input.filter((part) => {
    const type = record(part).type;
    return type === "image" || type === "localImage";
  }).length;
  return {
    id: string(queued.id),
    text: texts.join("\n"),
    imageCount,
  };
}

async function normalizeHistoryPage(
  value: unknown,
): Promise<ThreadHistoryPage> {
  const page = record(value);
  return {
    items: await Promise.all(normalizeTurns(page.data).map(hydrateItemImages)),
    nextCursor: string(page.nextCursor) || null,
  };
}

export function normalizeUsage(value: unknown): UsageInfo | null {
  const result = record(value);
  const buckets = record(result.rateLimitsByLimitId);
  const bucketValues = Object.values(buckets);
  const snapshot = record(
    buckets.codex ?? result.rateLimits ?? bucketValues[0] ?? null,
  );
  if (!Object.keys(snapshot).length) return null;
  const normalizeWindow = (windowValue: unknown) => {
    const window = record(windowValue);
    const usedPercent = number(window.usedPercent);
    if (usedPercent === null) return null;
    return {
      usedPercent,
      windowDurationMins: number(window.windowDurationMins),
      resetsAt: number(window.resetsAt),
    };
  };
  return {
    label: string(snapshot.limitName, string(snapshot.limitId, "Codex")),
    planType: typeof snapshot.planType === "string" ? snapshot.planType : null,
    primary: normalizeWindow(snapshot.primary),
    secondary: normalizeWindow(snapshot.secondary),
    reached:
      snapshot.rateLimitReachedType !== null &&
      snapshot.rateLimitReachedType !== undefined,
  };
}

function sandboxPolicy(settings: CodexSettings): unknown {
  if (settings.sandbox === "danger-full-access")
    return { type: "dangerFullAccess" };
  if (settings.sandbox === "read-only")
    return { type: "readOnly", networkAccess: false };
  return {
    type: "workspaceWrite",
    writableRoots: [settings.cwd],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

export class CodexService extends EventEmitter {
  private readonly process = new CodexProcess();
  private readonly legacyLineage = loadLegacyLineage(
    join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions"),
  );
  private readonly runtimeLineage = new Map<string, string>();
  private state: ConnectionState = "disconnected";
  private stateMessage: string | undefined;

  constructor() {
    super();
    this.process.on(
      "notification",
      (message: { method: string; params?: unknown }) => {
        if (message.method === "account/rateLimits/updated") {
          this.emitUi({ type: "usage", usage: normalizeUsage(message.params) });
        }
        const event = normalizeNotification(message.method, message.params);
        if (event) {
          if (event.type === "item" && event.item.images?.length)
            void hydrateItemImages(event.item).then((item) =>
              this.emitUi({ ...event, item }),
            );
          else this.emitUi(event);
          if (event.type === "turn" && event.phase === "completed")
            void this.startNextQueuedPrompt(event.threadId).catch(() => {
              // The persisted prompt remains available for a later retry.
            });
        }
      },
    );
    this.process.on("request", (message: RpcMessage) =>
      this.handleServerRequest(message),
    );
    this.process.on("protocol-error", (error: Error) =>
      this.emitUi({ type: "error", message: error.message }),
    );
    this.process.on("exit", (error: Error) =>
      this.setState("error", error.message),
    );
  }

  async connect(): Promise<void> {
    this.setState("connecting");
    try {
      await this.process.connect();
      this.setState("connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState("error", message);
      throw error;
    }
  }

  async reconnect(): Promise<void> {
    this.process.close();
    await this.connect();
  }

  getConnectionState(): { state: ConnectionState; message?: string } {
    return { state: this.state, message: this.stateMessage };
  }

  close(): void {
    this.process.close();
    this.setState("disconnected");
  }

  async listThreads(input: ThreadListInput = {}): Promise<ThreadPage> {
    const result = await this.process.request<UnknownRecord>("thread/list", {
      limit: 50,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: ["cli", "vscode", "exec", "appServer"],
      archived: input.archived === true,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.searchTerm ? { searchTerm: input.searchTerm } : {}),
    });
    const data = result.data;
    const legacyLineage = await this.legacyLineage;
    return {
      threads: Array.isArray(data)
        ? data.map((value) => {
            const thread = normalizeThread(value);
            return thread.forkedFromId
              ? thread
              : {
                  ...thread,
                  forkedFromId:
                    this.runtimeLineage.get(thread.id) ??
                    legacyLineage.get(thread.id) ??
                    null,
                };
          })
        : [],
      nextCursor:
        typeof result.nextCursor === "string" ? result.nextCursor : null,
    };
  }

  async listModels(): Promise<ModelOption[]> {
    const result = await this.process.request<UnknownRecord>("model/list", {
      limit: 100,
      includeHidden: false,
    });
    const data = Array.isArray(result.data) ? result.data : [];
    return data.map((modelValue) => {
      const model = record(modelValue);
      const efforts = Array.isArray(model.supportedReasoningEfforts)
        ? model.supportedReasoningEfforts
            .map((option) => string(record(option).reasoningEffort))
            .filter(Boolean)
        : [];
      return {
        id: string(model.model, string(model.id)),
        label: string(model.displayName, string(model.model, "Model")),
        description: string(model.description),
        isDefault: model.isDefault === true,
        efforts,
        defaultEffort: string(
          model.defaultReasoningEffort,
          efforts[0] ?? "medium",
        ),
        inputModalities: Array.isArray(model.inputModalities)
          ? model.inputModalities.map((value) => string(value)).filter(Boolean)
          : ["text", "image"],
      };
    });
  }

  async openThread(threadId: string): Promise<OpenThreadResult> {
    const result = await this.process.request<UnknownRecord>("thread/resume", {
      threadId,
      excludeTurns: true,
      initialTurnsPage: {
        limit: 12,
        sortDirection: "desc",
        itemsView: "full",
      },
    });
    const page = await normalizeHistoryPage(result.initialTurnsPage);
    const thread = normalizeThread(result.thread);
    const legacyLineage = await this.legacyLineage;
    return {
      thread: thread.forkedFromId
        ? thread
        : {
            ...thread,
            forkedFromId:
              this.runtimeLineage.get(thread.id) ??
              legacyLineage.get(thread.id) ??
              null,
          },
      items: page.items,
      nextCursor: page.nextCursor,
    };
  }

  async loadEarlierThreadTurns(
    threadId: string,
    cursor: string,
  ): Promise<ThreadHistoryPage> {
    const result = await this.process.request<UnknownRecord>(
      "thread/turns/list",
      {
        threadId,
        cursor,
        limit: 20,
        sortDirection: "desc",
        itemsView: "full",
      },
    );
    return normalizeHistoryPage(result);
  }

  async getThreadSummaries(threadIds: string[]): Promise<ThreadSummary[]> {
    const uniqueIds = [...new Set(threadIds.filter(Boolean))].slice(0, 50);
    const results = await Promise.allSettled(
      uniqueIds.map((threadId) =>
        this.process.request<UnknownRecord>("thread/read", {
          threadId,
          includeTurns: false,
        }),
      ),
    );
    const legacyLineage = await this.legacyLineage;
    return results.flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      const thread = normalizeThread(result.value.thread);
      return [
        thread.forkedFromId
          ? thread
          : {
              ...thread,
              forkedFromId:
                this.runtimeLineage.get(thread.id) ??
                legacyLineage.get(thread.id) ??
                null,
            },
      ];
    });
  }

  async createThread(settings: CodexSettings): Promise<ThreadSummary> {
    const result = await this.process.request<UnknownRecord>("thread/start", {
      cwd: settings.cwd,
      approvalPolicy: "on-request",
      sandbox: settings.sandbox,
      threadSource: "codex-desktop-intel",
      ...(settings.model ? { model: settings.model } : {}),
    });
    return normalizeThread(result.thread);
  }

  async renameThread(threadId: string, name: string): Promise<void> {
    await this.process.request("thread/name/set", { threadId, name });
  }

  async archiveThread(threadId: string): Promise<void> {
    await this.process.request("thread/archive", { threadId });
  }

  async unarchiveThread(threadId: string): Promise<void> {
    await this.process.request("thread/unarchive", { threadId });
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.process.request("thread/delete", { threadId });
  }

  async forkThread(
    threadId: string,
    lastTurnId?: string,
  ): Promise<ThreadSummary> {
    const result = await this.process.request<UnknownRecord>("thread/fork", {
      threadId,
      ...(lastTurnId ? { lastTurnId } : {}),
      excludeTurns: true,
      deferGoalContinuation: true,
      threadSource: "codex-desktop-intel",
    });
    const forked = normalizeThread(result.thread);
    this.runtimeLineage.set(forked.id, forked.forkedFromId ?? threadId);
    return { ...forked, forkedFromId: forked.forkedFromId ?? threadId };
  }

  async compactThread(threadId: string): Promise<void> {
    await this.process.request("thread/compact/start", { threadId });
  }

  async getThreadGoal(threadId: string): Promise<ThreadGoal | null> {
    const result = await this.process.request<UnknownRecord>(
      "thread/goal/get",
      { threadId },
    );
    return normalizeGoal(result.goal);
  }

  async setThreadGoal(
    threadId: string,
    objective: string,
    status: ThreadGoalStatus,
    tokenBudget: number | null,
  ): Promise<ThreadGoal> {
    const result = await this.process.request<UnknownRecord>(
      "thread/goal/set",
      {
        threadId,
        objective,
        status,
        tokenBudget,
      },
    );
    const goal = normalizeGoal(result.goal);
    if (!goal) throw new Error("Codex returned an invalid thread goal.");
    return goal;
  }

  async clearThreadGoal(threadId: string): Promise<void> {
    await this.process.request("thread/goal/clear", { threadId });
  }

  async startTurn(input: StartTurnInput): Promise<StartTurnResult> {
    const result = await this.process.request<UnknownRecord>("turn/start", {
      threadId: input.threadId,
      input: turnInput(input),
      cwd: input.cwd,
      approvalPolicy: "on-request",
      sandboxPolicy: sandboxPolicy(input),
      ...(input.model ? { model: input.model } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
    });
    const turn = record(result.turn);
    return { turnId: string(turn.id) };
  }

  async steerTurn(input: SteerTurnInput): Promise<StartTurnResult> {
    const result = await this.process.request<UnknownRecord>("turn/steer", {
      threadId: input.threadId,
      input: turnInput(input),
      expectedTurnId: input.expectedTurnId,
      clientUserMessageId: randomUUID(),
    });
    return { turnId: string(result.turnId, input.expectedTurnId) };
  }

  async queuePrompt(input: StartTurnInput): Promise<QueuedPrompt> {
    const result = await this.process.request<UnknownRecord>(
      "thread/queue/add",
      {
        threadId: input.threadId,
        input: turnInput(input),
        clientUserMessageId: randomUUID(),
      },
    );
    return normalizeQueuedPrompt(result.queuedSubmission);
  }

  async listQueuedPrompts(threadId: string): Promise<QueuedPrompt[]> {
    const result = await this.process.request<UnknownRecord>(
      "thread/queue/list",
      { threadId, limit: 100 },
    );
    return Array.isArray(result.data)
      ? result.data.map(normalizeQueuedPrompt)
      : [];
  }

  async deleteQueuedPrompt(
    threadId: string,
    queuedPromptId: string,
  ): Promise<void> {
    await this.process.request("thread/queue/delete", {
      threadId,
      queuedSubmissionId: queuedPromptId,
    });
  }

  async startNextQueuedPrompt(
    threadId: string,
  ): Promise<StartTurnResult | null> {
    const queued = await this.listQueuedPrompts(threadId);
    if (!queued.length) return null;
    const result = await this.process.request<UnknownRecord>(
      "thread/queue/start",
      { threadId, queuedSubmissionId: queued[0].id },
    );
    const turn = record(result.turn);
    const turnId = string(turn.id);
    return turnId ? { turnId } : null;
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.process.request("turn/interrupt", { threadId, turnId });
  }

  async getUsage(): Promise<UsageInfo | null> {
    try {
      const result = await this.process.request<UnknownRecord>(
        "account/rateLimits/read",
      );
      return normalizeUsage(result);
    } catch {
      return null;
    }
  }

  getDiagnostics(): CodexDiagnostics {
    const details = this.process.getDiagnostics();
    return {
      connection: this.state,
      message: this.stateMessage ?? "",
      ...details,
      stderrTail: details.stderrTail
        .replace(/(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]+/g, "$1…")
        .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]"),
    };
  }

  resolveInteraction(requestId: number | string, result: unknown): void {
    this.process.respond(requestId, result);
    this.emitUi({ type: "interaction-resolved", requestId });
  }

  private handleServerRequest(message: RpcMessage): void {
    const params = record(message.params);
    const common = {
      requestId: message.id,
      threadId: string(params.threadId),
      turnId: string(params.turnId),
    };
    let interaction: PendingInteraction | null = null;

    if (message.method === "item/commandExecution/requestApproval") {
      const command = string(params.command, "Command details unavailable");
      interaction = {
        ...common,
        kind: "command",
        title: "Allow command?",
        detail: string(params.reason, "Codex would like to run this command."),
        command,
        cwd: string(params.cwd),
      };
    } else if (message.method === "item/fileChange/requestApproval") {
      interaction = {
        ...common,
        kind: "file",
        title: "Allow file changes?",
        detail: string(
          params.reason,
          "Codex would like to apply file changes.",
        ),
        cwd: string(params.grantRoot),
      };
    } else if (message.method === "item/tool/requestUserInput") {
      const questions: UserInputQuestion[] = Array.isArray(params.questions)
        ? params.questions.map((questionValue) => {
            const question = record(questionValue);
            const options = Array.isArray(question.options)
              ? question.options.map((optionValue) => {
                  const option = record(optionValue);
                  return {
                    label: string(option.label),
                    description: string(option.description),
                  };
                })
              : null;
            return {
              id: string(question.id),
              header: string(question.header),
              question: string(question.question),
              isOther: question.isOther === true,
              isSecret: question.isSecret === true,
              options,
            };
          })
        : [];
      interaction = {
        ...common,
        kind: "user-input",
        title: "Codex needs your input",
        detail: "Answer to continue the active turn.",
        questions,
      };
    }

    if (interaction) {
      this.emitUi({ type: "interaction", interaction });
    } else {
      this.process.respondError(
        message.id,
        `Unsupported server request: ${message.method}`,
      );
      this.emitUi({
        type: "error",
        message: `Unsupported Codex request: ${message.method}`,
      });
    }
  }

  private setState(state: ConnectionState, message?: string): void {
    this.state = state;
    this.stateMessage = message;
    this.emitUi({ type: "connection", state, message });
  }

  private emitUi(event: UiEvent): void {
    this.emit("event", event);
  }
}
