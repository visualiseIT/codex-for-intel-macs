import type { ChatItem, ThreadSummary, UiEvent } from "../shared/types";

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

function formatChanges(changes: unknown): string {
  if (!Array.isArray(changes)) return "File changes proposed";
  return changes
    .map((change) => {
      const value = record(change);
      const path = string(value.path, string(value.filePath, "Unknown file"));
      const kind = string(value.kind, string(value.type, "changed"));
      return `${kind}: ${path}`;
    })
    .join("\n");
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
  };
}

export function normalizeItem(value: unknown): ChatItem {
  const item = record(value);
  const id = string(item.id, `unknown-${Date.now()}`);
  const type = string(item.type, "status");

  switch (type) {
    case "userMessage":
      return { id, kind: "user", text: userText(item.content) };
    case "agentMessage":
      return { id, kind: "assistant", text: string(item.text) };
    case "plan":
      return { id, kind: "plan", title: "Plan", text: string(item.text) };
    case "reasoning": {
      const summary = Array.isArray(item.summary)
        ? item.summary.map(String).join("\n")
        : "";
      return { id, kind: "reasoning", title: "Reasoning", text: summary };
    }
    case "commandExecution":
      return {
        id,
        kind: "command",
        title: `$ ${string(item.command, "Command")}`,
        text: string(item.aggregatedOutput),
        status: statusText(item.status),
      };
    case "fileChange":
      return {
        id,
        kind: "file",
        title: "File changes",
        text: formatChanges(item.changes),
        status: statusText(item.status),
      };
    case "mcpToolCall":
      return {
        id,
        kind: "tool",
        title: `${string(item.server, "MCP")} · ${string(item.tool, "tool")}`,
        text: item.error ? JSON.stringify(item.error, null, 2) : "",
        status: statusText(item.status),
      };
    case "dynamicToolCall":
      return {
        id,
        kind: "tool",
        title: `${string(item.namespace)}${item.namespace ? " · " : ""}${string(item.tool, "Tool")}`,
        text: "",
        status: statusText(item.status),
      };
    default:
      return {
        id,
        kind: "status",
        title: type,
        text: "",
        status: statusText(item.status),
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
    const items = record(turn).items;
    return Array.isArray(items) ? items.map(normalizeItem) : [];
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
      item: normalizeItem(params.item),
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

  if (method === "thread/name/updated" || method === "thread/started") {
    const thread = record(params.thread);
    return {
      type: "thread-changed",
      threadId: string(params.threadId, string(thread.id)),
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
