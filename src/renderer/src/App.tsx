import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChatItem,
  CodexDiagnostics,
  CodexSettings,
  ConnectionState,
  ImageAttachment,
  ModelOption,
  PendingInteraction,
  SandboxMode,
  ThemeMode,
  ThreadSummary,
  UiEvent,
  UsageInfo,
} from "../../shared/types";
import { ActivityOutput } from "./ActivityOutput";
import {
  DiagnosticsDialog,
  InteractionDialog,
  ThreadActionsDialog,
} from "./Dialogs";
import { DiffView } from "./DiffView";
import { RichText } from "./RichText";

const LAST_WORKSPACE_KEY = "codex-desktop:last-workspace";
const THEME_KEY = "codex-desktop:theme";
const PINNED_THREADS_KEY = "codex-desktop:pinned-threads";

function initialTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function initialPins(): Set<string> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(PINNED_THREADS_KEY) ?? "[]",
    );
    return new Set(
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

const defaultSettings: CodexSettings = {
  cwd: localStorage.getItem(LAST_WORKSPACE_KEY) ?? "",
  model: "",
  effort: "medium",
  sandbox: "workspace-write",
};

function shortPath(value: string): string {
  if (!value) return "Choose workspace";
  const parts = value.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : value;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1_000);
  const today = new Date();
  if (date.toDateString() === today.toDateString())
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatReset(timestamp: number | null): string {
  if (!timestamp) return "Reset time unavailable";
  const date = new Date(timestamp * 1_000);
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "Resetting soon";
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `Resets in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `Resets in ${hours}h${remaining ? ` ${remaining}m` : ""}`;
}

function itemIcon(kind: ChatItem["kind"]): string {
  switch (kind) {
    case "user":
      return "You";
    case "assistant":
      return "C";
    case "command":
      return ">_";
    case "file":
      return "±";
    case "plan":
      return "✓";
    case "reasoning":
      return "…";
    case "error":
      return "!";
    default:
      return "◇";
  }
}

function upsertItem(items: ChatItem[], incoming: ChatItem): ChatItem[] {
  const index = items.findIndex((item) => item.id === incoming.id);
  if (index < 0) return [...items, incoming];
  const next = [...items];
  next[index] = incoming;
  return next;
}

function MessageContent({
  item,
}: {
  item: ChatItem;
}): React.JSX.Element | null {
  if (item.kind === "file" && item.changes?.length)
    return <DiffView changes={item.changes} />;
  if (
    item.kind === "assistant" ||
    item.kind === "plan" ||
    item.kind === "reasoning"
  )
    return item.text ? <RichText text={item.text} /> : null;
  if (item.kind === "command" || item.kind === "tool")
    return item.text ? <ActivityOutput text={item.text} /> : null;
  return item.text ? <pre className="plain-message">{item.text}</pre> : null;
}

export function App(): React.JSX.Element {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [threadView, setThreadView] = useState<"active" | "archived">("active");
  const [pinnedThreads, setPinnedThreads] = useState<Set<string>>(initialPins);
  const [threadMenu, setThreadMenu] = useState<ThreadSummary | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(
    null,
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [settings, setSettings] = useState<CodexSettings>(defaultSettings);
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<PendingInteraction[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [diagnostics, setDiagnostics] = useState<CodexDiagnostics | null>(null);
  const [error, setError] = useState("");
  const activeThreadRef = useRef<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedModel = models.find((model) => model.id === settings.model);
  const effortOptions = selectedModel?.efforts.length
    ? selectedModel.efforts
    : ["low", "medium", "high", "xhigh", "max", "ultra"];
  const supportsImages =
    !selectedModel || selectedModel.inputModalities.includes("image");
  const archived = threadView === "archived";

  const displayedThreads = useMemo(
    () =>
      [...threads].sort((a, b) => {
        const pinDifference =
          Number(pinnedThreads.has(b.id)) - Number(pinnedThreads.has(a.id));
        return pinDifference || b.updatedAt - a.updatedAt;
      }),
    [pinnedThreads, threads],
  );

  const refreshThreads = useCallback(
    async (term = "", showArchived = false) => {
      try {
        const page = await window.codex.listThreads({
          ...(term ? { searchTerm: term } : {}),
          archived: showArchived,
        });
        setThreads(page.threads);
        setNextCursor(page.nextCursor);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [],
  );

  const loadMoreThreads = async (): Promise<void> => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await window.codex.listThreads({
        ...(search ? { searchTerm: search } : {}),
        archived,
        cursor: nextCursor,
      });
      setThreads((current) => {
        const existing = new Set(current.map((thread) => thread.id));
        return [
          ...current,
          ...page.threads.filter((thread) => !existing.has(thread.id)),
        ];
      });
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingMore(false);
    }
  };

  const loadModels = useCallback(async () => {
    try {
      const available = await window.codex.listModels();
      setModels(available);
      setSettings((current) => {
        if (current.model || !available.length) return current;
        const initial =
          available.find((model) => model.isDefault) ?? available[0];
        return { ...current, model: initial.id, effort: initial.defaultEffort };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const loadUsage = useCallback(async () => {
    setUsage(await window.codex.getUsage());
  }, []);

  const clearConversation = useCallback(() => {
    activeThreadRef.current = null;
    setSelectedThread(null);
    setItems([]);
    setActiveTurnId(null);
    setRunning(false);
  }, []);

  const handleUiEvent = useCallback(
    (event: UiEvent) => {
      if (event.type === "connection") {
        setConnection(event.state);
        setConnectionMessage(event.message ?? "");
        if (event.state === "connected") {
          void refreshThreads(search, archived);
          void loadModels();
          void loadUsage();
        }
        return;
      }
      if (event.type === "usage") {
        setUsage(event.usage);
        return;
      }
      if (event.type === "interaction") {
        setInteractions((current) => [...current, event.interaction]);
        return;
      }
      if (event.type === "thread-changed") {
        if (
          event.threadId === activeThreadRef.current &&
          (event.action === "deleted" ||
            (event.action === "archived" && !archived))
        )
          clearConversation();
        void refreshThreads(search, archived);
        return;
      }
      if (event.type === "error") {
        setError(event.message);
        return;
      }
      if (event.threadId !== activeThreadRef.current) return;
      if (event.type === "item") {
        setItems((current) => upsertItem(current, event.item));
      } else if (event.type === "delta") {
        setItems((current) =>
          current.map((item) =>
            item.id === event.itemId
              ? { ...item, text: item.text + event.delta }
              : item,
          ),
        );
      } else if (event.type === "turn") {
        if (event.phase === "started") {
          setActiveTurnId(event.turnId);
          setRunning(true);
        } else {
          setActiveTurnId(null);
          setRunning(false);
          if (event.error) setError(event.error);
          void refreshThreads(search, archived);
          void loadUsage();
        }
      }
    },
    [
      archived,
      clearConversation,
      loadModels,
      loadUsage,
      refreshThreads,
      search,
    ],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (): void => {
      const resolved =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    localStorage.setItem(THEME_KEY, theme);
    applyTheme();
    void window.codex.setTheme(theme);
    if (theme === "system") media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = window.codex.onEvent(handleUiEvent);
    void window.codex.getConnectionState().then((result) => {
      setConnection(result.state);
      setConnectionMessage(result.message ?? "");
      if (result.state === "connected") {
        void refreshThreads(search, archived);
        void loadModels();
        void loadUsage();
      }
    });
    return unsubscribe;
  }, [archived, handleUiEvent, loadModels, loadUsage, refreshThreads, search]);

  useEffect(() => {
    if (connection !== "connected") return;
    const timer = window.setTimeout(
      () => void refreshThreads(search, archived),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [archived, connection, refreshThreads, search]);

  useLayoutEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const height = Math.min(Math.max(textarea.scrollHeight, 28), 180);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden";
  }, [prompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  const openThread = async (thread: ThreadSummary): Promise<void> => {
    if (archived) {
      setThreadMenu(thread);
      return;
    }
    setLoadingThread(true);
    setError("");
    try {
      const result = await window.codex.openThread(thread.id);
      activeThreadRef.current = result.thread.id;
      setSelectedThread(result.thread);
      setItems(result.items);
      setSettings((current) => ({
        ...current,
        cwd: result.thread.cwd || current.cwd,
        model: result.thread.model || current.model,
      }));
      if (result.thread.cwd)
        localStorage.setItem(LAST_WORKSPACE_KEY, result.thread.cwd);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingThread(false);
    }
  };

  const newChat = (): void => {
    clearConversation();
    setAttachments([]);
    setError("");
    promptRef.current?.focus();
  };

  const chooseWorkspace = async (): Promise<void> => {
    const cwd = await window.codex.chooseWorkspace();
    if (!cwd) return;
    localStorage.setItem(LAST_WORKSPACE_KEY, cwd);
    setSettings((current) => ({ ...current, cwd }));
  };

  const addAttachments = (incoming: ImageAttachment[]): void => {
    if (!supportsImages) {
      setError("The selected model does not advertise image input support.");
      return;
    }
    setAttachments((current) => {
      const seen = new Set(current.map((item) => item.path));
      const next = [
        ...current,
        ...incoming.filter((item) => !seen.has(item.path)),
      ];
      if (next.length > 8) setError("Attach at most 8 images at a time.");
      return next.slice(0, 8);
    });
  };

  const chooseImages = async (): Promise<void> => {
    try {
      addAttachments(await window.codex.chooseImages());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const attachFiles = async (files: FileList | File[]): Promise<void> => {
    try {
      const selectedFiles = Array.from(files);
      const imageExtensions = new Set(["gif", "jpeg", "jpg", "png", "webp"]);
      const imagePaths = selectedFiles
        .filter((file) =>
          imageExtensions.has(file.name.split(".").at(-1)?.toLowerCase() ?? ""),
        )
        .map((file) => window.codex.getDroppedFilePath(file))
        .filter(Boolean);
      const filePaths = selectedFiles
        .filter(
          (file) =>
            !imageExtensions.has(
              file.name.split(".").at(-1)?.toLowerCase() ?? "",
            ),
        )
        .map((file) => window.codex.getDroppedFilePath(file))
        .filter(Boolean);
      const paths = [...imagePaths, ...filePaths];
      if (!paths.length)
        throw new Error("Could not read the dropped file path.");
      if (imagePaths.length)
        addAttachments(await window.codex.prepareImages(imagePaths));
      if (filePaths.length) {
        const references = await window.codex.referenceFiles(
          filePaths,
          settings.cwd,
        );
        const referenceText = references
          .map((path) => `- \`${path}\``)
          .join("\n");
        setPrompt(
          (current) =>
            `${current}${current.trim() ? "\n\n" : ""}Please inspect these workspace files:\n${referenceText}`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const sendPrompt = async (): Promise<void> => {
    const text = prompt.trim();
    if ((!text && !attachments.length) || running) return;
    if (!settings.cwd) {
      setError("Choose a workspace before starting a conversation.");
      return;
    }
    if (attachments.length && !supportsImages) {
      setError("Choose an image-capable model or remove the attachments.");
      return;
    }

    const pendingAttachments = attachments;
    setPrompt("");
    setAttachments([]);
    setError("");
    setRunning(true);
    try {
      let thread = selectedThread;
      if (!thread) {
        thread = await window.codex.createThread(settings);
        activeThreadRef.current = thread.id;
        setSelectedThread(thread);
        await refreshThreads(search, archived);
      }
      const result = await window.codex.startTurn({
        ...settings,
        threadId: thread.id,
        prompt: text,
        imagePaths: pendingAttachments.map((attachment) => attachment.path),
      });
      setActiveTurnId(result.turnId);
    } catch (cause) {
      setRunning(false);
      setError(cause instanceof Error ? cause.message : String(cause));
      setPrompt(text);
      setAttachments(pendingAttachments);
    }
  };

  const stopTurn = async (): Promise<void> => {
    if (!selectedThread || !activeTurnId) return;
    try {
      await window.codex.interruptTurn(selectedThread.id, activeTurnId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const resolveInteraction = async (result: unknown): Promise<void> => {
    const interaction = interactions[0];
    if (!interaction) return;
    try {
      await window.codex.resolveInteraction(interaction.requestId, result);
      setInteractions((current) => current.slice(1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const runThreadAction = async (
    action: () => Promise<void>,
  ): Promise<void> => {
    try {
      await action();
      setThreadMenu(null);
      await refreshThreads(search, archived);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const renameThread = (): void => {
    if (!threadMenu) return;
    const name = window.prompt("Conversation name", threadMenu.title)?.trim();
    if (name)
      void runThreadAction(() =>
        window.codex.renameThread(threadMenu.id, name),
      );
  };

  const togglePin = (): void => {
    if (!threadMenu) return;
    const next = new Set(pinnedThreads);
    if (next.has(threadMenu.id)) next.delete(threadMenu.id);
    else next.add(threadMenu.id);
    setPinnedThreads(next);
    localStorage.setItem(PINNED_THREADS_KEY, JSON.stringify([...next]));
    setThreadMenu(null);
  };

  const deleteThread = (): void => {
    if (!threadMenu) return;
    if (
      !window.confirm(
        `Permanently delete “${threadMenu.title}”? This cannot be undone.`,
      )
    )
      return;
    const threadId = threadMenu.id;
    void runThreadAction(async () => {
      await window.codex.deleteThread(threadId);
      if (activeThreadRef.current === threadId) clearConversation();
      const next = new Set(pinnedThreads);
      next.delete(threadId);
      setPinnedThreads(next);
      localStorage.setItem(PINNED_THREADS_KEY, JSON.stringify([...next]));
    });
  };

  const showDiagnostics = async (): Promise<void> => {
    try {
      setDiagnostics(await window.codex.getDiagnostics());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const reconnect = async (): Promise<void> => {
    setDiagnostics(null);
    setError("");
    try {
      await window.codex.reconnect();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await showDiagnostics();
    }
  };

  const visibleItems = useMemo(
    () =>
      items.filter((item) => item.kind !== "status" || item.text || item.title),
    [items],
  );

  return (
    <div
      className={`app-shell ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void attachFiles(event.dataTransfer.files);
      }}
    >
      <aside className="sidebar">
        <div className="traffic-space" />
        <div className="brand-row">
          <div className="brand-mark">C</div>
          <div>
            <strong>Codex</strong>
            <small>Desktop Intel</small>
          </div>
        </div>
        <button className="new-chat-button" onClick={newChat}>
          <span>＋</span> New conversation
        </button>
        <div className="search-wrap">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search threads"
          />
        </div>
        <div
          className="thread-tabs"
          role="tablist"
          aria-label="Conversation type"
        >
          <button
            className={!archived ? "active" : ""}
            onClick={() => setThreadView("active")}
          >
            Recent
          </button>
          <button
            className={archived ? "active" : ""}
            onClick={() => setThreadView("archived")}
          >
            Archived
          </button>
        </div>
        <nav className="thread-list" aria-label="Conversation history">
          {displayedThreads.map((thread) => (
            <div
              className={`thread-row-wrap ${selectedThread?.id === thread.id ? "selected" : ""}`}
              key={thread.id}
            >
              <button
                className="thread-row"
                onClick={() => void openThread(thread)}
              >
                <span className="thread-title">
                  {pinnedThreads.has(thread.id) ? (
                    <span className="pin-mark">◆</span>
                  ) : null}
                  {thread.title}
                </span>
                <span className="thread-meta">
                  <span>{shortPath(thread.cwd)}</span>
                  <time>{formatDate(thread.updatedAt)}</time>
                </span>
              </button>
              <button
                className="thread-more"
                onClick={() => setThreadMenu(thread)}
                aria-label={`Manage ${thread.title}`}
              >
                •••
              </button>
            </div>
          ))}
          {!threads.length && connection === "connected" ? (
            <p className="empty-sidebar">No matching conversations.</p>
          ) : null}
          {nextCursor ? (
            <button
              className="load-more"
              onClick={() => void loadMoreThreads()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </nav>
        <button
          className="connection-row"
          onClick={() => void showDiagnostics()}
        >
          <span className={`connection-dot ${connection}`} />
          <span>
            {connection === "connected"
              ? "Codex connected"
              : connectionMessage || connection}
          </span>
          <span className="connection-help">ⓘ</span>
        </button>
      </aside>

      <main className="main-panel">
        <header className="toolbar">
          <button
            className="workspace-button"
            onClick={() => void chooseWorkspace()}
            title={settings.cwd}
          >
            <span className="folder-icon">▱</span>
            <span>{shortPath(settings.cwd)}</span>
          </button>
          <div className="toolbar-controls">
            {usage?.primary ? (
              <button
                className={`usage-pill ${usage.reached ? "reached" : ""}`}
                onClick={() => void showDiagnostics()}
                title={`${usage.label}: ${usage.primary.usedPercent}% used · ${formatReset(usage.primary.resetsAt)}`}
              >
                {Math.round(usage.primary.usedPercent)}% used
              </button>
            ) : null}
            <select
              aria-label="Model"
              value={settings.model}
              onChange={(event) => {
                const model = models.find(
                  (item) => item.id === event.target.value,
                );
                setSettings((current) => ({
                  ...current,
                  model: event.target.value,
                  effort: model?.defaultEffort ?? current.effort,
                }));
              }}
            >
              {!models.length ? <option value="">Default model</option> : null}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Reasoning effort"
              value={settings.effort}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  effort: event.target.value,
                }))
              }
            >
              {effortOptions.map((effort) => (
                <option key={effort} value={effort}>
                  {effort} effort
                </option>
              ))}
            </select>
            <select
              aria-label="Sandbox mode"
              value={settings.sandbox}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  sandbox: event.target.value as SandboxMode,
                }))
              }
            >
              <option value="read-only">Read only</option>
              <option value="workspace-write">Workspace write</option>
              <option value="danger-full-access">Full access</option>
            </select>
            <select
              className="theme-select"
              aria-label="Appearance"
              value={theme}
              onChange={(event) => setTheme(event.target.value as ThemeMode)}
            >
              <option value="system">System theme</option>
              <option value="light">Light theme</option>
              <option value="dark">Dark theme</option>
            </select>
          </div>
        </header>

        <section className="conversation">
          {loadingThread ? (
            <div className="center-state">
              <span className="spinner" /> Loading conversation…
            </div>
          ) : !visibleItems.length ? (
            <div className="welcome">
              <span className="eyebrow">Local coding agent</span>
              <h1>
                {selectedThread ? selectedThread.title : "What shall we build?"}
              </h1>
              <p>
                {settings.cwd
                  ? `Codex will work inside ${settings.cwd}.`
                  : "Choose a workspace, then describe what you want Codex to do."}
              </p>
              <div className="suggestions">
                <button
                  onClick={() =>
                    setPrompt("Explain this codebase and its architecture.")
                  }
                >
                  Explain this codebase
                </button>
                <button
                  onClick={() =>
                    setPrompt("Run the test suite and fix the failing tests.")
                  }
                >
                  Fix failing tests
                </button>
                <button
                  onClick={() =>
                    setPrompt(
                      "Review the current changes for bugs and regressions.",
                    )
                  }
                >
                  Review current changes
                </button>
              </div>
            </div>
          ) : (
            <div className="messages">
              {visibleItems.map((item) => (
                <article key={item.id} className={`message ${item.kind}`}>
                  <div className="message-icon">{itemIcon(item.kind)}</div>
                  <div className="message-body">
                    <div className="message-heading">
                      <strong>
                        {item.title ??
                          (item.kind === "assistant"
                            ? "Codex"
                            : item.kind === "user"
                              ? "You"
                              : item.kind)}
                      </strong>
                      {item.status ? (
                        <span className={`status-pill ${item.status}`}>
                          {item.status}
                        </span>
                      ) : null}
                    </div>
                    <MessageContent item={item} />
                    {!item.text &&
                    !item.changes?.length &&
                    item.status === "inProgress" ? (
                      <span className="working">Working…</span>
                    ) : null}
                  </div>
                </article>
              ))}
              {running ? (
                <div className="running-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          )}
        </section>

        <footer className="composer-area">
          {error ? (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          ) : null}
          <div className={`composer ${running ? "running" : ""}`}>
            {attachments.length ? (
              <div className="attachment-strip">
                {attachments.map((attachment) => (
                  <div
                    className="attachment"
                    key={attachment.path}
                    title={attachment.path}
                  >
                    <img src={attachment.dataUrl} alt="" />
                    <span>{attachment.name}</span>
                    <button
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter(
                            (item) => item.path !== attachment.path,
                          ),
                        )
                      }
                      aria-label={`Remove ${attachment.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="composer-input-row">
              <button
                className="attach-button"
                onClick={() => void chooseImages()}
                disabled={
                  !supportsImages || running || connection !== "connected"
                }
                title={
                  supportsImages
                    ? "Attach images"
                    : "Selected model does not support images"
                }
              >
                ＋
              </button>
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onPaste={(event) => {
                  if (event.clipboardData.files.length)
                    void attachFiles(event.clipboardData.files);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendPrompt();
                  }
                }}
                placeholder={
                  connection === "connected"
                    ? "Message Codex…"
                    : "Waiting for Codex…"
                }
                disabled={connection !== "connected" || running}
                rows={1}
              />
              {running ? (
                <button
                  className="send-button stop"
                  onClick={() => void stopTurn()}
                  aria-label="Stop response"
                >
                  ■
                </button>
              ) : (
                <button
                  className="send-button"
                  onClick={() => void sendPrompt()}
                  disabled={
                    (!prompt.trim() && !attachments.length) ||
                    connection !== "connected"
                  }
                  aria-label="Send prompt"
                >
                  ↑
                </button>
              )}
            </div>
          </div>
          <p className="composer-note">
            Enter to send · Shift+Enter for a new line · Drop or paste images ·
            Changes may require approval
          </p>
        </footer>
      </main>

      {dragging ? (
        <div className="drop-overlay">
          <div>
            <strong>Drop images to attach</strong>
            <span>PNG, JPEG, GIF, or WebP · up to 15 MB</span>
          </div>
        </div>
      ) : null}
      {interactions[0] ? (
        <InteractionDialog
          interaction={interactions[0]}
          onResolve={(result) => void resolveInteraction(result)}
        />
      ) : null}
      {threadMenu ? (
        <ThreadActionsDialog
          thread={threadMenu}
          archived={archived}
          pinned={pinnedThreads.has(threadMenu.id)}
          onClose={() => setThreadMenu(null)}
          onRename={renameThread}
          onPin={togglePin}
          onArchive={() =>
            void runThreadAction(() =>
              window.codex.archiveThread(threadMenu.id),
            )
          }
          onRestore={() =>
            void runThreadAction(() =>
              window.codex.unarchiveThread(threadMenu.id),
            )
          }
          onDelete={deleteThread}
        />
      ) : null}
      {diagnostics ? (
        <DiagnosticsDialog
          diagnostics={diagnostics}
          onClose={() => setDiagnostics(null)}
          onReconnect={() => void reconnect()}
        />
      ) : null}
    </div>
  );
}
