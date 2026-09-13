import type {
  ChatItem,
  FileChange,
  ThreadSummary,
  UiEvent,
} from "../shared/types";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {};
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function statusText(value: unknown): string {
  if (typeof value === "string") return value;
  const valueRecord = record(value);
  return string(valueRecord.type, "unknown");
}

function userText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      const value = record(part);
      if (value.type === "text") return string(value.text);
      if (value.type === "image" || value.type === "localImage")
        return "[Image]";
      if (value.type === "audio" || value.type === "localAudio")
        return "[Audio]";
      if (value.type === "skill") return `$${string(value.name, "skill")}`;
      if (value.type === "mention") return `@${string(value.name, "app")}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeChanges(changes: unknown): FileChange[] {
  if (!Array.isArray(changes)) return [];
  return changes.map((change) => {
    const value = record(change);
    const path = string(value.path, string(value.filePath, "Unknown file"));
    const kindValue = record(value.kind);
    const kind = string(
      kindValue.type,
      string(value.kind, string(value.type, "changed")),
    );
    return { path, kind, diff: string(value.diff) };
  });
}

export function normalizeThread(value: unknown): ThreadSummary {
  const thread = record(value);
  const preview = string(thread.preview, "Untitled conversation");
  return {
    id: string(thread.id),
    title: string(thread.name, preview || "Untitled conversation"),
    preview,
    cwd: string(thread.cwd),
    model: typeof thread.model === "string" ? thread.model : null,
    createdAt: typeof thread.createdAt === "number" ? thread.createdAt : 0,
    updatedAt: typeof thread.updatedAt === "number" ? thread.updatedAt : 0,
    status: statusText(thread.status),
    forkedFromId:
      typeof thread.forkedFromId === "string" ? thread.forkedFromId : null,
    projectId: typeof thread.projectId === "string" ? thread.projectId : null,
  };
}

export function normalizeItem(value: unknown, turnId?: string): ChatItem {
  const item = record(value);
  const id = string(item.id, `unknown-${Date.now()}`);
  const type = string(item.type, "status");

  switch (type) {
    case "userMessage":
      return { id, kind: "user", text: userText(item.content), turnId };
    case "agentMessage":
      return { id, kind: "assistant", text: string(item.text), turnId };
    case "plan":
      return {
        id,
        kind: "plan",
        title: "Plan",
        text: string(item.text),
        turnId,
      };
    case "reasoning": {
      const summary = Array.isArray(item.summary)
        ? item.summary.map(String).join("\n")
        : "";
      return {
        id,
        kind: "reasoning",
        title: "Reasoning",
        text: summary,
        turnId,
      };
    }
    case "commandExecution":
      return {
        id,
        kind: "command",
        title: `$ ${string(item.command, "Command")}`,
        text: string(item.aggregatedOutput),
        status: statusText(item.status),
        turnId,
      };
    case "fileChange": {
      const changes = normalizeChanges(item.changes);
      return {
        id,
        kind: "file",
        title:
          `${changes.length || ""} file change${changes.length === 1 ? "" : "s"}`.trim(),
        text: changes
          .map((change) => `${change.kind}: ${change.path}`)
          .join("\n"),
        status: statusText(item.status),
        changes,
        turnId,
      };
    }
    case "mcpToolCall":
      return {
        id,
        kind: "tool",
        title: `${string(item.server, "MCP")} · ${string(item.tool, "tool")}`,
        text: item.error ? JSON.stringify(item.error, null, 2) : "",
        status: statusText(item.status),
        turnId,
      };
    case "dynamicToolCall":
      return {
        id,
        kind: "tool",
        title: `${string(item.namespace)}${item.namespace ? " · " : ""}${string(item.tool, "Tool")}`,
        text: "",
        status: statusText(item.status),
        turnId,
      };
    case "contextCompaction":
      return {
        id,
        kind: "status",
        title: "Context compacted",
        text: "Earlier conversation context was summarized to make room for continued work.",
        status: "completed",
        turnId,
      };
    default:
      return {
        id,
        kind: "status",
        title: type,
        text: "",
        status: statusText(item.status),
        turnId,
      };
  }
}

export function normalizeTurns(value: unknown): ChatItem[] {
  const turns = Array.isArray(value) ? [...value] : [];
  turns.sort((a, b) => {
    const aStarted = record(a).startedAt;
    const bStarted = record(b).startedAt;
    return (
      (typeof aStarted === "number" ? aStarted : 0) -
      (typeof bStarted === "number" ? bStarted : 0)
    );
  });

  return turns.flatMap((turn) => {
    const turnRecord = record(turn);
    const items = turnRecord.items;
    const turnId = string(turnRecord.id) || undefined;
    return Array.isArray(items)
      ? items.map((item) => normalizeItem(item, turnId))
      : [];
  });
}

export function normalizeNotification(
  method: string,
  paramsValue: unknown,
): UiEvent | null {
  const params = record(paramsValue);
  const threadId = string(params.threadId);
  const turn = record(params.turn);
  const turnId = string(params.turnId, string(turn.id));

  if (method === "item/started" || method === "item/completed") {
    return {
      type: "item",
      phase: method === "item/started" ? "started" : "completed",
      threadId,
      turnId,
      item: normalizeItem(params.item, turnId),
    };
  }

  if (
    method === "item/agentMessage/delta" ||
    method === "item/plan/delta" ||
    method === "item/commandExecution/outputDelta" ||
    method === "item/fileChange/outputDelta"
  ) {
    return {
      type: "delta",
      threadId,
      turnId,
      itemId: string(params.itemId),
      delta: string(params.delta),
    };
  }

  if (method === "item/fileChange/patchUpdated") {
    const item = normalizeItem(
      {
        id: string(params.itemId),
        type: "fileChange",
        changes: params.changes,
        status: "inProgress",
      },
      turnId,
    );
    return {
      type: "item",
      phase: "started",
      threadId,
      turnId,
      item,
    };
  }

  if (method === "turn/started" || method === "turn/completed") {
    const error = record(turn.error);
    return {
      type: "turn",
      phase: method === "turn/started" ? "started" : "completed",
      threadId,
      turnId,
      status: statusText(turn.status),
      error: string(error.message) || undefined,
    };
  }

  if (method === "thread/queue/changed") {
    return { type: "queue-changed", threadId };
  }

  if (method === "thread/goal/updated") {
    const goal = record(params.goal);
    return {
      type: "goal",
      threadId,
      goal: {
        threadId,
        objective: string(goal.objective),
        status: string(
          goal.status,
          "active",
        ) as import("../shared/types").ThreadGoalStatus,
        tokenBudget:
          typeof goal.tokenBudget === "number" ? goal.tokenBudget : null,
        tokensUsed: typeof goal.tokensUsed === "number" ? goal.tokensUsed : 0,
        timeUsedSeconds:
          typeof goal.timeUsedSeconds === "number" ? goal.timeUsedSeconds : 0,
        createdAt: typeof goal.createdAt === "number" ? goal.createdAt : 0,
        updatedAt: typeof goal.updatedAt === "number" ? goal.updatedAt : 0,
      },
    };
  }

  if (method === "thread/goal/cleared") {
    return { type: "goal", threadId, goal: null };
  }

  if (method === "thread/compacted") {
    return { type: "compacted", threadId, turnId };
  }

  if (
    method === "thread/name/updated" ||
    method === "thread/started" ||
    method === "thread/archived" ||
    method === "thread/unarchived" ||
    method === "thread/deleted"
  ) {
    const thread = record(params.thread);
    const action = method.endsWith("/archived")
      ? "archived"
      : method.endsWith("/unarchived")
        ? "unarchived"
        : method.endsWith("/deleted")
          ? "deleted"
          : "changed";
    return {
      type: "thread-changed",
      threadId: string(params.threadId, string(thread.id)),
      action,
    };
  }

  if (method === "error") {
    const error = record(params.error);
    return {
      type: "error",
      message: string(error.message, "Codex reported an error."),
      threadId,
    };
  }

  if (
    method === "warning" ||
    method === "deprecationNotice" ||
    method === "configWarning"
  ) {
    return {
      type: "error",
      message: string(params.message, string(params.details, "Codex warning.")),
      threadId,
    };
  }

  return null;
}
