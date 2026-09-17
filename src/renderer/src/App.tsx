import {
  memo,
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
  DesktopUpdateStatus,
  ImageAttachment,
  MicrophonePermissionStatus,
  ModelOption,
  NotificationPreferences,
  PendingInteraction,
  QueuedPrompt,
  SandboxMode,
  ThemeMode,
  ThreadGoal,
  ThreadGoalStatus,
  ThreadSummary,
  TranscriptionStatus,
  UiEvent,
  UsageInfo,
} from "../../shared/types";
import { ActivityOutput } from "./ActivityOutput";
import {
  DiagnosticsDialog,
  GoalDialog,
  InteractionDialog,
  RenameThreadDialog,
  SettingsDialog,
  ThreadActionsDialog,
} from "./Dialogs";
import { DiffView } from "./DiffView";
import { readableError } from "./errors";
import { firstForkPromptTurnId, prependHistoryItems } from "./history";
import {
  isReconnectNotice,
  nextPromptHistoryIndex,
  submittedPromptHistory,
} from "./prompt-history";
import { RichText } from "./RichText";
import { isNearBottom, nextPromptOffset, previousPromptOffset } from "./scroll";
import { ThreadSidebar } from "./ThreadSidebar";
import { adjacentMatchIndex, matchingMessageIds } from "./thread-search";
import { buildThreadProjects, mergeThreadSummaries } from "./thread-tree";

const LAST_WORKSPACE_KEY = "codex-desktop:last-workspace";
const THEME_KEY = "codex-desktop:theme";
const PINNED_THREADS_KEY = "codex-desktop:pinned-threads";
const SIDEBAR_WIDTH_KEY = "codex-desktop:sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "codex-desktop:sidebar-collapsed";
const COLLAPSED_PROJECTS_KEY = "codex-desktop:collapsed-projects";
const UNREAD_THREADS_KEY = "codex-desktop:unread-threads";
const DRAFT_PREFIX = "codex-desktop:draft:";
const DEFAULT_SIDEBAR_WIDTH = 286;

function initialThreadId(): string | null {
  return new URLSearchParams(window.location.search).get("thread");
}

function initialSidebarWidth(): number {
  const value = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  return Number.isFinite(value)
    ? Math.min(Math.max(value, 220), 480)
    : DEFAULT_SIDEBAR_WIDTH;
}

function initialStringSet(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function initialTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function draftKey(threadId: string | null, cwd: string): string {
  return threadId ?? `new:${cwd || "no-workspace"}`;
}

function readDraft(key: string): string {
  return localStorage.getItem(`${DRAFT_PREFIX}${key}`) ?? "";
}

function writeDraft(key: string, value: string): void {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  if (value) localStorage.setItem(storageKey, value);
  else localStorage.removeItem(storageKey);
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

function containsDraggedFiles(dataTransfer: DataTransfer): boolean {
  return (
    Array.from(dataTransfer.types).includes("Files") ||
    Array.from(dataTransfer.items).some((item) => item.kind === "file")
  );
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

const MessageContent = memo(function MessageContent({
  item,
}: {
  item: ChatItem;
}): React.JSX.Element | null {
  if (item.kind === "user")
    return item.text || item.images?.length ? (
      <>
        {item.text ? <pre className="plain-message">{item.text}</pre> : null}
        {item.images?.length ? (
          <div className="message-image-grid">
            {item.images.map((image, index) => (
              <img
                key={`${image.path}-${index}`}
                src={image.dataUrl}
                alt={image.name || `Attached image ${index + 1}`}
                title={image.name}
              />
            ))}
          </div>
        ) : null}
      </>
    ) : null;
  if (item.kind === "file")
    return item.changes?.length ? (
      <DiffView changes={item.changes} />
    ) : item.text ? (
      <ActivityOutput text={item.text} />
    ) : null;
  if (
    item.kind === "assistant" ||
    item.kind === "plan" ||
    item.kind === "reasoning"
  )
    return item.text ? <RichText text={item.text} /> : null;
  if (item.kind === "command")
    return (
      <ActivityOutput
        text={item.text}
        command={item.title}
        collapsedByDefault
      />
    );
  if (item.kind === "tool")
    return item.text ? <ActivityOutput text={item.text} /> : null;
  return item.text ? <pre className="plain-message">{item.text}</pre> : null;
});

const AttachmentStrip = memo(function AttachmentStrip({
  attachments,
  onRemove,
}: {
  attachments: ImageAttachment[];
  onRemove: (path: string) => void;
}): React.JSX.Element | null {
  if (!attachments.length) return null;
  return (
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
            onClick={() => onRemove(attachment.path)}
            aria-label={`Remove ${attachment.name}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
});

export function App(): React.JSX.Element {
  const dedicatedThreadWindow = initialThreadId() !== null;
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadContext, setThreadContext] = useState<ThreadSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [threadView, setThreadView] = useState<"active" | "archived">("active");
  const [pinnedThreads, setPinnedThreads] = useState<Set<string>>(initialPins);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      dedicatedThreadWindow ||
      localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
  );
  const [activeThreadIds, setActiveThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [unreadThreadIds, setUnreadThreadIds] = useState<Set<string>>(() =>
    initialStringSet(UNREAD_THREADS_KEY),
  );
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() =>
    initialStringSet(COLLAPSED_PROJECTS_KEY),
  );
  const [threadMenu, setThreadMenu] = useState<ThreadSummary | null>(null);
  const [renameTarget, setRenameTarget] = useState<ThreadSummary | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(
    null,
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [olderTurnsCursor, setOlderTurnsCursor] = useState<string | null>(null);
  const [loadingOlderTurns, setLoadingOlderTurns] = useState(false);
  const [settings, setSettings] = useState<CodexSettings>(defaultSettings);
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [search, setSearch] = useState("");
  const initialDraftKey = draftKey(null, defaultSettings.cwd);
  const [prompt, setPrompt] = useState(() => readDraft(initialDraftKey));
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<PendingInteraction[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [diagnostics, setDiagnostics] = useState<CodexDiagnostics | null>(null);
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [goal, setGoal] = useState<ThreadGoal | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>({
      turnCompleted: true,
      attentionRequired: true,
    });
  const [transcriptionStatus, setTranscriptionStatus] =
    useState<TranscriptionStatus>({
      configured: false,
      source: "none",
      model: "gpt-transcribe",
    });
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus>({
    phase: "disabled",
    version: null,
    percent: null,
    message: "Updates are unavailable in this build.",
  });
  const [dictationState, setDictationState] = useState<
    "idle" | "recording" | "transcribing"
  >("idle");
  const [microphonePermission, setMicrophonePermission] =
    useState<MicrophonePermissionStatus>("unknown");
  const [pendingThreadFocus, setPendingThreadFocus] = useState<string | null>(
    initialThreadId,
  );
  const [error, setError] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [threadSearchIndex, setThreadSearchIndex] = useState(-1);
  const [loadingSearchHistory, setLoadingSearchHistory] = useState(false);
  const [promptHistoryIndex, setPromptHistoryIndex] = useState<number | null>(
    null,
  );
  const activeThreadRef = useRef<string | null>(null);
  const draftContextRef = useRef(initialDraftKey);
  const promptValueRef = useRef(prompt);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationRef = useRef<HTMLElement | null>(null);
  const threadSearchInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const loadingOlderTurnsRef = useRef(false);
  const historyPagingEnabledRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const pendingTurnJumpRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const requestedParentIdsRef = useRef(new Set<string>());
  const pendingSidebarThreadsRef = useRef(new Map<string, ThreadSummary>());
  const promptHistoryDraftRef = useRef("");

  const selectedModel = models.find((model) => model.id === settings.model);
  const effortOptions = selectedModel?.efforts.length
    ? selectedModel.efforts
    : ["low", "medium", "high", "xhigh", "max", "ultra"];
  const supportsImages =
    !selectedModel || selectedModel.inputModalities.includes("image");
  const archived = threadView === "archived";

  const threadProjects = useMemo(
    () => buildThreadProjects(threads, threadContext, pinnedThreads),
    [pinnedThreads, threadContext, threads],
  );
  const threadById = useMemo(
    () => new Map(threadContext.map((thread) => [thread.id, thread])),
    [threadContext],
  );
  const parentThread = selectedThread?.forkedFromId
    ? (threadById.get(selectedThread.forkedFromId) ?? null)
    : null;
  const forkStartTurnId = useMemo(
    () => firstForkPromptTurnId(items, selectedThread?.forkedAtTurnId ?? null),
    [items, selectedThread?.forkedAtTurnId],
  );

  const rememberThreads = useCallback((incoming: ThreadSummary[]) => {
    setThreadContext((current) => {
      const merged = new Map(current.map((thread) => [thread.id, thread]));
      incoming.forEach((thread) => merged.set(thread.id, thread));
      return [...merged.values()];
    });
  }, []);

  const switchDraftContext = useCallback((nextKey: string) => {
    writeDraft(draftContextRef.current, promptValueRef.current);
    const nextPrompt = readDraft(nextKey);
    draftContextRef.current = nextKey;
    promptValueRef.current = nextPrompt;
    setPrompt(nextPrompt);
  }, []);

  const refreshThreads = useCallback(
    async (term = "", showArchived = false) => {
      try {
        const page = await window.codex.listThreads({
          ...(term ? { searchTerm: term } : {}),
          archived: showArchived,
        });
        for (const thread of page.threads)
          pendingSidebarThreadsRef.current.delete(thread.id);
        const pendingThreads =
          term || showArchived
            ? []
            : [...pendingSidebarThreadsRef.current.values()];
        const visibleThreads = mergeThreadSummaries(
          page.threads,
          pendingThreads,
        );
        setThreads(visibleThreads);
        rememberThreads(page.threads);
        rememberThreads(pendingThreads);
        setNextCursor(page.nextCursor);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [rememberThreads],
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
      rememberThreads(page.threads);
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

  const loadQueuedPrompts = useCallback(async (threadId: string) => {
    setQueuedPrompts(await window.codex.listQueuedPrompts(threadId));
  }, []);

  const loadGoal = useCallback(async (threadId: string) => {
    setGoal(await window.codex.getThreadGoal(threadId));
  }, []);

  const updateUnreadThreads = useCallback(
    (update: (current: Set<string>) => Set<string>): void => {
      setUnreadThreadIds((current) => {
        const next = update(current);
        localStorage.setItem(UNREAD_THREADS_KEY, JSON.stringify([...next]));
        return next;
      });
    },
    [],
  );

  const markThreadRead = useCallback(
    (threadId: string): void => {
      updateUnreadThreads((current) => {
        if (!current.has(threadId)) return current;
        const next = new Set(current);
        next.delete(threadId);
        return next;
      });
      void window.codex.markThreadRead(threadId);
    },
    [updateUnreadThreads],
  );

  const clearConversation = useCallback(() => {
    activeThreadRef.current = null;
    historyPagingEnabledRef.current = false;
    setSelectedThread(null);
    setItems([]);
    setOlderTurnsCursor(null);
    setActiveTurnId(null);
    setRunning(false);
    setQueuedPrompts([]);
    setGoal(null);
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setThreadSearchIndex(-1);
    setPromptHistoryIndex(null);
  }, []);

  const handleUiEvent = useCallback(
    (event: UiEvent) => {
      if (event.type === "connection") {
        setConnection(event.state);
        setConnectionMessage(event.message ?? "");
        if (event.state === "connected") {
          void window.codex
            .getActiveThreadIds()
            .then((ids) => setActiveThreadIds(new Set(ids)));
          void refreshThreads(search, archived);
          void loadModels();
          void loadUsage();
        } else {
          setActiveThreadIds(new Set());
        }
        return;
      }
      if (event.type === "usage") {
        setUsage(event.usage);
        return;
      }
      if (event.type === "update") {
        setUpdateStatus(event.status);
        return;
      }
      if (event.type === "focus-thread") {
        setPendingThreadFocus(event.threadId);
        return;
      }
      if (event.type === "thread-read") {
        updateUnreadThreads((current) => {
          if (!current.has(event.threadId)) return current;
          const next = new Set(current);
          next.delete(event.threadId);
          return next;
        });
        return;
      }
      if (event.type === "queue-changed") {
        if (event.threadId === activeThreadRef.current)
          void loadQueuedPrompts(event.threadId);
        return;
      }
      if (event.type === "goal") {
        if (event.threadId === activeThreadRef.current) setGoal(event.goal);
        return;
      }
      if (event.type === "compacted") {
        if (event.threadId === activeThreadRef.current)
          setItems((current) =>
            upsertItem(current, {
              id: `compacted-${event.turnId}`,
              kind: "status",
              title: "Context compacted",
              text: "Earlier conversation context was summarized to make room for continued work.",
              status: "completed",
              turnId: event.turnId,
            }),
          );
        return;
      }
      if (event.type === "interaction") {
        setInteractions((current) => [...current, event.interaction]);
        return;
      }
      if (event.type === "interaction-resolved") {
        setInteractions((current) =>
          current.filter(
            (interaction) => interaction.requestId !== event.requestId,
          ),
        );
        return;
      }
      if (event.type === "thread-changed") {
        if (
          event.threadId === activeThreadRef.current &&
          (event.action === "deleted" ||
            (event.action === "archived" && !archived))
        ) {
          clearConversation();
          switchDraftContext(
            draftKey(null, localStorage.getItem(LAST_WORKSPACE_KEY) ?? ""),
          );
        }
        void refreshThreads(search, archived);
        return;
      }
      if (event.type === "error") {
        if (event.threadId && event.threadId !== activeThreadRef.current)
          return;
        setError(event.message);
        return;
      }
      if (event.type === "turn") {
        setActiveThreadIds((current) => {
          const next = new Set(current);
          if (event.phase === "started") next.add(event.threadId);
          else next.delete(event.threadId);
          return next;
        });
        if (event.phase === "started") {
          updateUnreadThreads((current) => {
            if (!current.has(event.threadId)) return current;
            const next = new Set(current);
            next.delete(event.threadId);
            return next;
          });
        } else if (
          !event.error &&
          !/(interrupt|cancel|fail)/i.test(event.status)
        ) {
          if (
            event.threadId === activeThreadRef.current &&
            document.hasFocus()
          ) {
            markThreadRead(event.threadId);
          } else {
            updateUnreadThreads((current) => {
              const next = new Set(current);
              next.add(event.threadId);
              return next;
            });
          }
        }
      }
      if (event.type === "turn" && event.threadId !== activeThreadRef.current)
        return;
      if (event.threadId !== activeThreadRef.current) return;
      setError((current) => (isReconnectNotice(current) ? "" : current));
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
          void loadQueuedPrompts(event.threadId);
        }
      }
    },
    [
      archived,
      clearConversation,
      loadModels,
      loadQueuedPrompts,
      loadUsage,
      markThreadRead,
      refreshThreads,
      search,
      switchDraftContext,
      updateUnreadThreads,
    ],
  );

  useEffect(() => {
    promptValueRef.current = prompt;
    writeDraft(draftContextRef.current, prompt);
  }, [prompt]);

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
        void window.codex
          .getActiveThreadIds()
          .then((ids) => setActiveThreadIds(new Set(ids)));
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

  useEffect(() => {
    void window.codex
      .getNotificationPreferences()
      .then(setNotificationPreferences);
    void window.codex.getTranscriptionStatus().then(setTranscriptionStatus);
    void window.codex.getUpdateStatus().then(setUpdateStatus);
    void window.codex
      .getMicrophonePermissionStatus()
      .then(setMicrophonePermission);
    return () => {
      recorderRef.current?.stop();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const known = new Set(threadContext.map((thread) => thread.id));
    const missing = threadContext
      .map((thread) => thread.forkedFromId)
      .filter(
        (id): id is string =>
          Boolean(id) &&
          !known.has(id as string) &&
          !requestedParentIdsRef.current.has(id as string),
      )
      .slice(0, 50);
    if (!missing.length || connection !== "connected") return;
    missing.forEach((id) => requestedParentIdsRef.current.add(id));
    void window.codex
      .getThreadSummaries(missing)
      .then(rememberThreads)
      .catch(() => undefined);
  }, [connection, rememberThreads, threadContext]);

  useEffect(() => {
    if (stickToBottomRef.current)
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [items]);

  useLayoutEffect(() => {
    const pendingTurnId = pendingTurnJumpRef.current;
    const conversation = conversationRef.current;
    if (pendingTurnId && conversation) {
      const target = Array.from(
        conversation.querySelectorAll<HTMLElement>("[data-turn-id]"),
      ).find((element) => element.dataset.turnId === pendingTurnId);
      if (target) {
        conversation.scrollTop = Math.max(0, target.offsetTop - 14);
        pendingTurnJumpRef.current = null;
        pendingScrollRestoreRef.current = null;
        setShowJumpToLatest(true);
        return;
      }
    }
    const pending = pendingScrollRestoreRef.current;
    if (!pending || !conversation) return;
    conversation.scrollTop =
      pending.scrollTop + conversation.scrollHeight - pending.scrollHeight;
    pendingScrollRestoreRef.current = null;
  }, [items]);

  const enableHistoryPaging = useCallback((threadId: string): void => {
    window.requestAnimationFrame(() => {
      if (activeThreadRef.current !== threadId) return;
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      historyPagingEnabledRef.current = true;
    });
  }, []);

  const loadEarlierTurns = async (): Promise<void> => {
    const threadId = activeThreadRef.current;
    const cursor = olderTurnsCursor;
    if (!threadId || !cursor || loadingOlderTurnsRef.current) return;
    loadingOlderTurnsRef.current = true;
    setLoadingOlderTurns(true);
    try {
      const page = await window.codex.loadEarlierThreadTurns(threadId, cursor);
      if (activeThreadRef.current !== threadId) return;
      const conversation = conversationRef.current;
      if (conversation)
        pendingScrollRestoreRef.current = {
          scrollHeight: conversation.scrollHeight,
          scrollTop: conversation.scrollTop,
        };
      setItems((current) => prependHistoryItems(current, page.items));
      setOlderTurnsCursor(page.nextCursor);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      loadingOlderTurnsRef.current = false;
      setLoadingOlderTurns(false);
    }
  };

  const jumpToForkPoint = async (): Promise<void> => {
    const threadId = activeThreadRef.current;
    const parentBoundaryTurnId = selectedThread?.forkedAtTurnId;
    const conversation = conversationRef.current;
    if (!threadId || !parentBoundaryTurnId || !conversation) return;
    const turnId = firstForkPromptTurnId(items, parentBoundaryTurnId);
    const visibleTarget = Array.from(
      conversation.querySelectorAll<HTMLElement>("[data-turn-id]"),
    ).find((element) => turnId && element.dataset.turnId === turnId);
    if (visibleTarget) {
      conversation.scrollTo({
        top: Math.max(0, visibleTarget.offsetTop - 14),
        behavior: "smooth",
      });
      return;
    }

    if (loadingOlderTurnsRef.current) return;
    loadingOlderTurnsRef.current = true;
    setLoadingOlderTurns(true);
    try {
      let collected = items;
      let cursor = olderTurnsCursor;
      let forkTurnId = firstForkPromptTurnId(collected, parentBoundaryTurnId);
      while (cursor && !forkTurnId) {
        const page = await window.codex.loadEarlierThreadTurns(
          threadId,
          cursor,
        );
        if (activeThreadRef.current !== threadId) return;
        collected = prependHistoryItems(collected, page.items);
        cursor = page.nextCursor;
        forkTurnId = firstForkPromptTurnId(collected, parentBoundaryTurnId);
      }
      if (!forkTurnId) {
        setError("The first prompt in this fork could not be found.");
        return;
      }
      pendingTurnJumpRef.current = forkTurnId;
      pendingScrollRestoreRef.current = null;
      setOlderTurnsCursor(cursor);
      setItems(collected);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      loadingOlderTurnsRef.current = false;
      setLoadingOlderTurns(false);
    }
  };

  const openThread = async (thread: ThreadSummary): Promise<void> => {
    if (archived) {
      setThreadMenu(thread);
      return;
    }
    markThreadRead(thread.id);
    setLoadingThread(true);
    setError("");
    activeThreadRef.current = null;
    historyPagingEnabledRef.current = false;
    setOlderTurnsCursor(null);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setShowNextPrompt(false);
    setRunning(false);
    setActiveTurnId(null);
    setPromptHistoryIndex(null);
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setThreadSearchIndex(-1);
    try {
      const result = await window.codex.openThread(thread.id);
      switchDraftContext(draftKey(result.thread.id, result.thread.cwd));
      activeThreadRef.current = result.thread.id;
      const activeTurn = await window.codex.getActiveTurnId(result.thread.id);
      if (activeThreadRef.current !== result.thread.id) return;
      setSelectedThread(result.thread);
      setActiveTurnId(activeTurn);
      setRunning(Boolean(activeTurn));
      rememberThreads([result.thread]);
      setItems(result.items);
      setOlderTurnsCursor(result.nextCursor);
      enableHistoryPaging(result.thread.id);
      void loadQueuedPrompts(result.thread.id);
      void loadGoal(result.thread.id);
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

  useEffect(() => {
    if (!pendingThreadFocus || connection !== "connected") return;
    void window.codex
      .openThread(pendingThreadFocus)
      .then(async (result) => {
        stickToBottomRef.current = true;
        setShowJumpToLatest(false);
        setShowNextPrompt(false);
        setThreadSearchOpen(false);
        setThreadSearchQuery("");
        setThreadSearchIndex(-1);
        setRunning(false);
        setActiveTurnId(null);
        setPromptHistoryIndex(null);
        historyPagingEnabledRef.current = false;
        switchDraftContext(draftKey(result.thread.id, result.thread.cwd));
        activeThreadRef.current = result.thread.id;
        const activeTurn = await window.codex.getActiveTurnId(result.thread.id);
        if (activeThreadRef.current !== result.thread.id) return;
        setSelectedThread(result.thread);
        markThreadRead(result.thread.id);
        setActiveTurnId(activeTurn);
        setRunning(Boolean(activeTurn));
        rememberThreads([result.thread]);
        setItems(result.items);
        setOlderTurnsCursor(result.nextCursor);
        enableHistoryPaging(result.thread.id);
        setThreadView("active");
        setSettings((current) => ({
          ...current,
          cwd: result.thread.cwd || current.cwd,
          model: result.thread.model || current.model,
        }));
        void loadQueuedPrompts(result.thread.id);
        void loadGoal(result.thread.id);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setPendingThreadFocus(null));
  }, [
    connection,
    enableHistoryPaging,
    loadGoal,
    loadQueuedPrompts,
    markThreadRead,
    pendingThreadFocus,
    rememberThreads,
    switchDraftContext,
  ]);

  const toggleProject = (key: string): void => {
    setCollapsedProjects((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(COLLAPSED_PROJECTS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const beginSidebarResize = (event: React.PointerEvent): void => {
    if (sidebarCollapsed) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const move = (moveEvent: PointerEvent): void => {
      const maximum = Math.min(480, Math.max(220, window.innerWidth - 520));
      const width = Math.min(
        Math.max(startWidth + moveEvent.clientX - startX, 220),
        maximum,
      );
      setSidebarWidth(width);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    };
    const stop = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      handle.removeEventListener("lostpointercapture", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("lostpointercapture", stop);
  };

  const toggleSidebar = (): void => {
    setSidebarCollapsed((current) => {
      if (!dedicatedThreadWindow)
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!current));
      return !current;
    });
  };

  const newChat = (): void => {
    clearConversation();
    switchDraftContext(draftKey(null, settings.cwd));
    setAttachments([]);
    setError("");
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setShowNextPrompt(false);
    setPromptHistoryIndex(null);
    promptRef.current?.focus();
  };

  const chooseWorkspace = async (): Promise<void> => {
    const cwd = await window.codex.chooseWorkspace();
    if (!cwd) return;
    localStorage.setItem(LAST_WORKSPACE_KEY, cwd);
    if (!selectedThread) switchDraftContext(draftKey(null, cwd));
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

  const removeAttachment = useCallback((path: string): void => {
    setAttachments((current) =>
      current.filter((attachment) => attachment.path !== path),
    );
  }, []);

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

  const pasteClipboardImages = async (files: File[]): Promise<void> => {
    try {
      const pathBacked: string[] = [];
      const pathless: File[] = [];
      for (const file of files) {
        const path = window.codex.getDroppedFilePath(file);
        if (path) pathBacked.push(path);
        else pathless.push(file);
      }
      if (pathBacked.length)
        addAttachments(await window.codex.prepareImages(pathBacked));
      if (pathless.length) {
        const clipboardImages = await Promise.all(
          pathless.map(async (file, index) => ({
            bytes: new Uint8Array(await file.arrayBuffer()),
            mimeType: file.type,
            name: `Screenshot${pathless.length > 1 ? ` ${index + 1}` : ""}`,
          })),
        );
        addAttachments(
          await window.codex.prepareClipboardImages(clipboardImages),
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
    setPromptHistoryIndex(null);
    setError("");
    setRunning(true);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setShowNextPrompt(false);
    try {
      let thread = selectedThread;
      if (!thread) {
        thread = await window.codex.createThread(settings);
        switchDraftContext(draftKey(thread.id, thread.cwd));
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
      const threadId = activeThreadRef.current;
      const activeTurn = threadId
        ? await window.codex.getActiveTurnId(threadId).catch(() => null)
        : null;
      setActiveTurnId(activeTurn);
      setRunning(Boolean(activeTurn));
      setError(cause instanceof Error ? cause.message : String(cause));
      setPrompt(text);
      setAttachments(pendingAttachments);
    }
  };

  const steerPrompt = async (): Promise<void> => {
    const text = prompt.trim();
    if (
      (!text && !attachments.length) ||
      !running ||
      !selectedThread ||
      !activeTurnId
    )
      return;
    const pendingAttachments = attachments;
    setPrompt("");
    setAttachments([]);
    setPromptHistoryIndex(null);
    setError("");
    try {
      await window.codex.steerTurn({
        ...settings,
        threadId: selectedThread.id,
        expectedTurnId: activeTurnId,
        prompt: text,
        imagePaths: pendingAttachments.map((attachment) => attachment.path),
      });
    } catch (cause) {
      setPrompt(text);
      setAttachments(pendingAttachments);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const queuePrompt = async (): Promise<void> => {
    const text = prompt.trim();
    if ((!text && !attachments.length) || !selectedThread) return;
    const pendingAttachments = attachments;
    setPrompt("");
    setAttachments([]);
    setPromptHistoryIndex(null);
    setError("");
    try {
      const queued = await window.codex.queuePrompt({
        ...settings,
        threadId: selectedThread.id,
        prompt: text,
        imagePaths: pendingAttachments.map((attachment) => attachment.path),
      });
      setQueuedPrompts((current) =>
        current.some((item) => item.id === queued.id)
          ? current
          : [...current, queued],
      );
    } catch (cause) {
      setPrompt(text);
      setAttachments(pendingAttachments);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const deleteQueuedPrompt = async (queuedPromptId: string): Promise<void> => {
    if (!selectedThread) return;
    try {
      await window.codex.deleteQueuedPrompt(selectedThread.id, queuedPromptId);
      setQueuedPrompts((current) =>
        current.filter((queued) => queued.id !== queuedPromptId),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const recallQueuedPrompt = async (queued: QueuedPrompt): Promise<void> => {
    if (!selectedThread || (!queued.text && !queued.imagePaths.length)) return;
    if (
      (prompt.trim() || attachments.length) &&
      (prompt !== queued.text || attachments.length) &&
      !window.confirm("Replace the current draft with this queued prompt?")
    )
      return;
    try {
      const recalledAttachments = queued.imagePaths.length
        ? await window.codex.prepareImages(queued.imagePaths)
        : [];
      await window.codex.deleteQueuedPrompt(selectedThread.id, queued.id);
      setQueuedPrompts((current) =>
        current.filter((item) => item.id !== queued.id),
      );
      setPrompt(queued.text);
      setAttachments(recalledAttachments);
      window.requestAnimationFrame(() => {
        promptRef.current?.focus();
        promptRef.current?.setSelectionRange(
          queued.text.length,
          queued.text.length,
        );
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const editSubmittedPrompt = (item: ChatItem): void => {
    if (item.kind !== "user") return;
    const restoredAttachments = item.images ?? [];
    if (
      (prompt.trim() || attachments.length) &&
      (prompt !== item.text || attachments.length) &&
      !window.confirm(
        "Replace the current draft with this previously submitted prompt?",
      )
    )
      return;
    setPrompt(item.text);
    setAttachments(restoredAttachments);
    setPromptHistoryIndex(null);
    setError("");
    window.requestAnimationFrame(() => {
      const input = promptRef.current;
      input?.focus();
      input?.setSelectionRange(item.text.length, item.text.length);
    });
  };

  const forkConversation = async (
    thread: ThreadSummary,
    lastTurnId?: string,
  ): Promise<void> => {
    setLoadingThread(true);
    setThreadMenu(null);
    setError("");
    try {
      const forked = await window.codex.forkThread(thread.id, lastTurnId);
      pendingSidebarThreadsRef.current.set(forked.id, forked);
      setThreads((current) => mergeThreadSummaries(current, [forked]));
      rememberThreads([thread, forked]);
      setThreadView("active");
      setSearch("");
      await openThread(forked);
      void refreshThreads("", false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingThread(false);
    }
  };

  const compactConversation = async (thread: ThreadSummary): Promise<void> => {
    if (
      !window.confirm(
        "Compact this conversation? Codex will summarize older context before continuing.",
      )
    )
      return;
    setThreadMenu(null);
    setError("");
    try {
      await window.codex.compactThread(thread.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const openGoal = async (threadId: string): Promise<void> => {
    try {
      await loadGoal(threadId);
      setThreadMenu(null);
      setGoalOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const saveGoal = async (
    objective: string,
    status: ThreadGoalStatus,
    tokenBudget: number | null,
  ): Promise<void> => {
    if (!selectedThread) return;
    if (
      tokenBudget !== null &&
      (!Number.isInteger(tokenBudget) || tokenBudget < 1)
    )
      throw new Error("Token budget must be a positive whole number.");
    setGoal(
      await window.codex.setThreadGoal(
        selectedThread.id,
        objective,
        status,
        tokenBudget,
      ),
    );
    setGoalOpen(false);
  };

  const clearGoal = async (): Promise<void> => {
    if (!selectedThread) return;
    await window.codex.clearThreadGoal(selectedThread.id);
    setGoal(null);
    setGoalOpen(false);
  };

  const startDictation = async (): Promise<void> => {
    if (dictationState === "recording") {
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.stop();
      }
      return;
    }
    if (!transcriptionStatus.configured) {
      setSettingsOpen(true);
      setError("Add an OpenAI API key in Settings before dictating.");
      return;
    }
    try {
      setError("");
      const permission = await window.codex.requestMicrophonePermission();
      setMicrophonePermission(permission);
      if (permission !== "granted") {
        throw new Error(
          permission === "denied"
            ? "Microphone access is denied. Enable Codex Desktop Intel in System Settings → Privacy & Security → Microphone, then restart the app."
            : permission === "restricted"
              ? "Microphone access is restricted by macOS or device policy."
              : "macOS did not grant microphone access. Try again from Desktop Settings.",
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("The microphone recording failed.");
        setDictationState("idle");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || preferred || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const durationMs = Math.max(
          0,
          performance.now() - recordingStartedAtRef.current,
        );
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        recordingStreamRef.current = null;
        setDictationState("transcribing");
        void blob
          .arrayBuffer()
          .then((buffer) =>
            window.codex.transcribeAudio({
              bytes: new Uint8Array(buffer),
              mimeType,
              durationMs,
            }),
          )
          .then((text) => {
            setPrompt(
              (current) =>
                `${current}${current && !current.endsWith(" ") ? " " : ""}${text}`,
            );
            promptRef.current?.focus();
          })
          .catch((cause: unknown) => setError(readableError(cause)))
          .finally(() => setDictationState("idle"));
      };
      recordingStartedAtRef.current = performance.now();
      recorder.start(250);
      setDictationState("recording");
    } catch (cause) {
      setDictationState("idle");
      setError(cause instanceof Error ? cause.message : String(cause));
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
      setInteractions((current) =>
        current.filter((item) => item.requestId !== interaction.requestId),
      );
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

  const openRenameDialog = (): void => {
    if (!threadMenu) return;
    setRenameTarget(threadMenu);
    setThreadMenu(null);
  };

  const renameThread = async (name: string): Promise<void> => {
    if (!renameTarget) return;
    const threadId = renameTarget.id;
    await window.codex.renameThread(threadId, name);
    const applyName = (thread: ThreadSummary): ThreadSummary =>
      thread.id === threadId ? { ...thread, title: name } : thread;
    setThreads((current) => current.map(applyName));
    setThreadContext((current) => current.map(applyName));
    setSelectedThread((current) => (current ? applyName(current) : null));
    setRenameTarget(null);
    void refreshThreads(search, archived);
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

  const toggleStar = (thread: ThreadSummary): void => {
    const next = new Set(pinnedThreads);
    if (next.has(thread.id)) next.delete(thread.id);
    else next.add(thread.id);
    setPinnedThreads(next);
    localStorage.setItem(PINNED_THREADS_KEY, JSON.stringify([...next]));
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
      if (activeThreadRef.current === threadId) {
        clearConversation();
        switchDraftContext(draftKey(null, settings.cwd));
      }
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
  const submittedPrompts = useMemo(
    () => submittedPromptHistory(visibleItems),
    [visibleItems],
  );

  const movePromptHistory = (direction: 1 | -1): void => {
    if (attachments.length) return;
    if (promptHistoryIndex === null) {
      if (direction === 1 || prompt) return;
      promptHistoryDraftRef.current = prompt;
    }
    const next = nextPromptHistoryIndex(
      submittedPrompts.length,
      promptHistoryIndex,
      direction,
    );
    setPromptHistoryIndex(next);
    const nextPrompt =
      next === null ? promptHistoryDraftRef.current : submittedPrompts[next];
    setPrompt(nextPrompt);
    window.requestAnimationFrame(() => {
      const input = promptRef.current;
      input?.setSelectionRange(nextPrompt.length, nextPrompt.length);
    });
  };
  const threadSearchMatches = useMemo(
    () => matchingMessageIds(visibleItems, threadSearchQuery),
    [threadSearchQuery, visibleItems],
  );
  const activeSearchMessageId =
    threadSearchIndex >= 0
      ? (threadSearchMatches[threadSearchIndex] ?? null)
      : null;

  const closeThreadSearch = useCallback((): void => {
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setThreadSearchIndex(-1);
  }, []);

  const openThreadSearch = useCallback((): void => {
    if (!activeThreadRef.current) return;
    setThreadSearchOpen(true);
    window.requestAnimationFrame(() => {
      threadSearchInputRef.current?.focus();
      threadSearchInputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        if (!activeThreadRef.current) return;
        event.preventDefault();
        openThreadSearch();
      } else if (event.key === "Escape" && threadSearchOpen) {
        event.preventDefault();
        closeThreadSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeThreadSearch, openThreadSearch, threadSearchOpen]);

  const scrollToSearchMatch = useCallback((messageId: string): void => {
    window.requestAnimationFrame(() => {
      const conversation = conversationRef.current;
      const target = conversation?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      if (!conversation || !target) return;
      stickToBottomRef.current = false;
      conversation.scrollTo({
        top: Math.max(0, target.offsetTop - 60),
        behavior: "smooth",
      });
    });
  }, []);

  const moveThreadSearch = async (direction: 1 | -1): Promise<void> => {
    const threadId = activeThreadRef.current;
    if (!threadId || !threadSearchQuery.trim()) return;
    let searchedItems = items;
    let cursor = olderTurnsCursor;
    if (cursor && !loadingOlderTurnsRef.current) {
      loadingOlderTurnsRef.current = true;
      setLoadingOlderTurns(true);
      setLoadingSearchHistory(true);
      try {
        while (cursor) {
          const page = await window.codex.loadEarlierThreadTurns(
            threadId,
            cursor,
          );
          if (activeThreadRef.current !== threadId) return;
          searchedItems = prependHistoryItems(searchedItems, page.items);
          cursor = page.nextCursor;
        }
        setItems(searchedItems);
        setOlderTurnsCursor(null);
      } catch (cause) {
        setError(readableError(cause));
      } finally {
        loadingOlderTurnsRef.current = false;
        setLoadingOlderTurns(false);
        setLoadingSearchHistory(false);
      }
    }
    const matches = matchingMessageIds(searchedItems, threadSearchQuery);
    const current = activeSearchMessageId
      ? matches.indexOf(activeSearchMessageId)
      : -1;
    const next = adjacentMatchIndex(matches.length, current, direction);
    setThreadSearchIndex(next);
    if (next >= 0) scrollToSearchMatch(matches[next]);
  };

  return (
    <div
      className={`app-shell ${dragging ? "is-dragging" : ""}`}
      style={{
        gridTemplateColumns: `${sidebarCollapsed ? 58 : sidebarWidth}px minmax(0, 1fr)`,
      }}
      onDragEnter={(event) => {
        if (!containsDraggedFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (containsDraggedFiles(event.dataTransfer)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (dragging && event.currentTarget === event.target)
          setDragging(false);
      }}
      onDrop={(event) => {
        if (!containsDraggedFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDragging(false);
        void attachFiles(event.dataTransfer.files);
      }}
    >
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="traffic-space" />
        <div className="brand-row">
          <div className="brand-mark">C</div>
          <div className="brand-copy">
            <strong>Codex</strong>
            <small>Desktop Intel</small>
          </div>
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>
        <button
          className="new-chat-button"
          onClick={newChat}
          title="New conversation"
        >
          <span>＋</span>{" "}
          <span className="new-chat-label">New conversation</span>
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
          <ThreadSidebar
            groups={threadProjects}
            collapsedProjects={collapsedProjects}
            selectedThreadId={selectedThread?.id ?? null}
            pinnedThreads={pinnedThreads}
            activeThreadIds={activeThreadIds}
            unreadThreadIds={unreadThreadIds}
            onToggleProject={toggleProject}
            onOpen={(thread) => void openThread(thread)}
            onToggleStar={toggleStar}
            onManage={setThreadMenu}
          />
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
          <span className="connection-copy">
            {connection === "connected"
              ? "Codex connected"
              : connectionMessage || connection}
          </span>
          <span className="connection-help">ⓘ</span>
        </button>
        <div
          className="sidebar-resizer"
          onPointerDown={beginSidebarResize}
          onDoubleClick={() => {
            setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
            localStorage.setItem(
              SIDEBAR_WIDTH_KEY,
              String(DEFAULT_SIDEBAR_WIDTH),
            );
          }}
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
        />
      </aside>

      <main className="main-panel">
        <header className="toolbar">
          <div className="toolbar-context">
            <button
              className="workspace-button"
              onClick={() => void chooseWorkspace()}
              title={settings.cwd}
            >
              <span className="folder-icon">▱</span>
              <span>{shortPath(settings.cwd)}</span>
            </button>
            {selectedThread ? (
              <button
                className="conversation-title"
                title="Rename conversation"
                aria-label={`Rename ${selectedThread.title}`}
                onClick={() => setRenameTarget(selectedThread)}
              >
                <span>{selectedThread.title}</span>
                <span className="conversation-title-edit" aria-hidden="true">
                  ✎
                </span>
              </button>
            ) : null}
            {selectedThread?.forkedFromId ? (
              <button
                className="fork-badge"
                title={`Open parent conversation: ${parentThread?.title ?? selectedThread.forkedFromId}`}
                onClick={() =>
                  setPendingThreadFocus(selectedThread.forkedFromId)
                }
              >
                ↳ Fork of{" "}
                {parentThread?.title ??
                  `${selectedThread.forkedFromId.slice(0, 8)}…`}
              </button>
            ) : null}
          </div>
          <div className="toolbar-controls">
            {selectedThread ? (
              <button
                className="thread-search-button"
                onClick={openThreadSearch}
                aria-label="Search this conversation"
                title="Search this conversation (⌘F)"
              >
                ⌕
              </button>
            ) : null}
            {usage?.primary ? (
              <button
                className={`usage-pill ${usage.reached ? "reached" : ""}`}
                onClick={() => void showDiagnostics()}
                title={`${usage.label}: ${usage.primary.usedPercent}% used · ${formatReset(usage.primary.resetsAt)}`}
              >
                {Math.round(usage.primary.usedPercent)}% used
              </button>
            ) : null}
            {selectedThread ? (
              <button
                className={`goal-button ${goal ? "active" : ""}`}
                onClick={() => void openGoal(selectedThread.id)}
                title={goal?.objective ?? "Set a conversation goal"}
              >
                ◎ {goal ? goal.status : "Goal"}
              </button>
            ) : null}
            <button
              className="settings-button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Desktop settings"
              title="Notifications and dictation settings"
            >
              ⚙
            </button>
          </div>
        </header>

        {threadSearchOpen ? (
          <div className="thread-search-bar" role="search">
            <span className="thread-search-icon">⌕</span>
            <input
              ref={threadSearchInputRef}
              value={threadSearchQuery}
              onChange={(event) => {
                setThreadSearchQuery(event.target.value);
                setThreadSearchIndex(-1);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void moveThreadSearch(event.shiftKey ? -1 : 1);
              }}
              placeholder="Search this conversation"
              aria-label="Search this conversation"
            />
            <span className="thread-search-count" aria-live="polite">
              {loadingSearchHistory
                ? "Loading history…"
                : threadSearchQuery.trim()
                  ? `${threadSearchIndex >= 0 ? threadSearchIndex + 1 : 0} of ${threadSearchMatches.length}`
                  : ""}
            </span>
            <button
              onClick={() => void moveThreadSearch(-1)}
              disabled={!threadSearchQuery.trim() || loadingSearchHistory}
              aria-label="Previous match"
              title="Previous match (Shift+Enter)"
            >
              ↑
            </button>
            <button
              onClick={() => void moveThreadSearch(1)}
              disabled={!threadSearchQuery.trim() || loadingSearchHistory}
              aria-label="Next match"
              title="Next match (Enter)"
            >
              ↓
            </button>
            <button onClick={closeThreadSearch} aria-label="Close search">
              ×
            </button>
          </div>
        ) : null}

        <section
          ref={conversationRef}
          className="conversation"
          onScroll={(event) => {
            const element = event.currentTarget;
            const nearBottom = isNearBottom(
              element.scrollHeight,
              element.scrollTop,
              element.clientHeight,
            );
            stickToBottomRef.current = nearBottom;
            setShowJumpToLatest(!nearBottom);
            const promptOffsets = Array.from(
              element.querySelectorAll<HTMLElement>(
                '[data-user-prompt="true"]',
              ),
            ).map((promptElement) => promptElement.offsetTop);
            setShowNextPrompt(
              nextPromptOffset(promptOffsets, element.scrollTop) !== null,
            );
            if (historyPagingEnabledRef.current && element.scrollTop <= 80)
              void loadEarlierTurns();
          }}
        >
          {!loadingThread && selectedThread && olderTurnsCursor ? (
            <div className="history-loader">
              <button
                disabled={loadingOlderTurns}
                onClick={() => void loadEarlierTurns()}
              >
                {loadingOlderTurns
                  ? "Loading earlier messages…"
                  : "Load earlier messages"}
              </button>
            </div>
          ) : null}
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
                <article
                  key={item.id}
                  className={`message ${item.kind} ${threadSearchMatches.includes(item.id) ? "thread-search-match" : ""} ${activeSearchMessageId === item.id ? "thread-search-active" : ""} ${item.kind === "user" && item.turnId === forkStartTurnId ? "fork-point" : ""}`}
                  data-message-id={item.id}
                  data-user-prompt={item.kind === "user" ? "true" : undefined}
                  data-turn-id={item.turnId}
                >
                  {item.kind === "user" && item.turnId === forkStartTurnId ? (
                    <div className="fork-point-marker">
                      <span>Fork starts here</span>
                    </div>
                  ) : null}
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
                      {item.kind === "user" ? (
                        <div className="user-message-actions">
                          <button
                            onClick={() => editSubmittedPrompt(item)}
                            title="Return this prompt to the composer for editing"
                            aria-label="Edit and resend this prompt"
                          >
                            ✎ Edit and resend
                          </button>
                          {item.turnId && selectedThread ? (
                            <button
                              disabled={running}
                              onClick={() =>
                                void forkConversation(
                                  selectedThread,
                                  item.turnId as string,
                                )
                              }
                              title="Fork this conversation through this prompt"
                            >
                              Fork here
                            </button>
                          ) : null}
                        </div>
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
          {showJumpToLatest ? (
            <div className="jump-controls">
              {selectedThread?.forkedAtTurnId ? (
                <button
                  onClick={() => void jumpToForkPoint()}
                  disabled={loadingOlderTurns}
                >
                  {loadingOlderTurns ? "Finding fork point…" : "—○— Fork point"}
                </button>
              ) : null}
              <button
                onClick={() => {
                  const conversation = conversationRef.current;
                  if (!conversation) return;
                  const offsets = Array.from(
                    conversation.querySelectorAll<HTMLElement>(
                      '[data-user-prompt="true"]',
                    ),
                  ).map((element) => element.offsetTop);
                  const target = previousPromptOffset(
                    offsets,
                    conversation.scrollTop,
                  );
                  if (target !== null)
                    conversation.scrollTo({
                      top: Math.max(0, target - 14),
                      behavior: "smooth",
                    });
                }}
              >
                ↑ Previous prompt
              </button>
              {showNextPrompt ? (
                <button
                  onClick={() => {
                    const conversation = conversationRef.current;
                    if (!conversation) return;
                    const offsets = Array.from(
                      conversation.querySelectorAll<HTMLElement>(
                        '[data-user-prompt="true"]',
                      ),
                    ).map((element) => element.offsetTop);
                    const target = nextPromptOffset(
                      offsets,
                      conversation.scrollTop,
                    );
                    if (target !== null)
                      conversation.scrollTo({
                        top: Math.max(0, target - 14),
                        behavior: "smooth",
                      });
                  }}
                >
                  ↓ Next prompt
                </button>
              ) : null}
              <button
                onClick={() => {
                  stickToBottomRef.current = true;
                  setShowJumpToLatest(false);
                  setShowNextPrompt(false);
                  endRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "end",
                  });
                }}
              >
                ↓ Jump to latest
              </button>
            </div>
          ) : null}
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
            {queuedPrompts.length ? (
              <div className="queued-prompts">
                {queuedPrompts.map((queued, index) => (
                  <div className="queued-prompt" key={queued.id}>
                    <span className="queued-number">{index + 1}</span>
                    <span>
                      {queued.text || `${queued.imageCount} queued image(s)`}
                    </span>
                    <button
                      className="recall-queued"
                      onClick={() => void recallQueuedPrompt(queued)}
                      disabled={!queued.text && !queued.imagePaths.length}
                      aria-label="Return queued prompt to composer"
                      title={
                        queued.text || queued.imagePaths.length
                          ? "Return to composer for editing"
                          : "This queued prompt cannot be restored"
                      }
                    >
                      ↶
                    </button>
                    <button
                      onClick={() => void deleteQueuedPrompt(queued.id)}
                      aria-label="Remove queued prompt"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <AttachmentStrip
              attachments={attachments}
              onRemove={removeAttachment}
            />
            <div className="composer-input-row">
              <button
                className="attach-button"
                onClick={() => void chooseImages()}
                disabled={!supportsImages || connection !== "connected"}
                title={
                  supportsImages
                    ? "Attach images"
                    : "Selected model does not support images"
                }
              >
                ＋
              </button>
              <button
                className={`mic-button ${dictationState}`}
                onClick={() => void startDictation()}
                disabled={dictationState === "transcribing"}
                aria-label={
                  dictationState === "recording"
                    ? "Stop dictation"
                    : "Start dictation"
                }
                title={
                  dictationState === "recording"
                    ? "Stop and transcribe"
                    : dictationState === "transcribing"
                      ? "Transcribing…"
                      : "Dictate prompt"
                }
              >
                {dictationState === "recording"
                  ? "■"
                  : dictationState === "transcribing"
                    ? "…"
                    : "🎙"}
              </button>
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setPromptHistoryIndex(null);
                }}
                onPaste={(event) => {
                  const images = Array.from(event.clipboardData.items)
                    .filter(
                      (item) =>
                        item.kind === "file" && item.type.startsWith("image/"),
                    )
                    .map((item) => item.getAsFile())
                    .filter((file): file is File => file !== null);
                  if (images.length) {
                    event.preventDefault();
                    void pasteClipboardImages(images);
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.altKey &&
                    !event.shiftKey &&
                    (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                    (promptHistoryIndex !== null || !prompt)
                  ) {
                    event.preventDefault();
                    movePromptHistory(event.key === "ArrowUp" ? -1 : 1);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey && !running) {
                    event.preventDefault();
                    void sendPrompt();
                  }
                }}
                placeholder={
                  connection === "connected"
                    ? running
                      ? "Draft your next message…"
                      : "Message Codex…"
                    : "Waiting for Codex…"
                }
                disabled={connection !== "connected"}
                rows={1}
              />
              {running ? (
                <div className="active-turn-actions">
                  <button
                    className="queue-button"
                    onClick={() => void queuePrompt()}
                    disabled={!prompt.trim() && !attachments.length}
                    aria-label="Queue prompt after current turn"
                    title="Queue after the current turn"
                  >
                    ⇥
                  </button>
                  <button
                    className="send-button"
                    onClick={() => void steerPrompt()}
                    disabled={!prompt.trim() && !attachments.length}
                    aria-label="Steer active turn now"
                    title="Send as steering instruction now"
                  >
                    ↑
                  </button>
                  <button
                    className="send-button stop"
                    onClick={() => void stopTurn()}
                    aria-label="Stop response"
                    title="Stop current turn"
                  >
                    ■
                  </button>
                </div>
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
            <div className="composer-settings" aria-label="Turn settings">
              <label title="Model">
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
                  {!models.length ? (
                    <option value="">Default model</option>
                  ) : null}
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true">⌄</span>
              </label>
              <label title="Reasoning effort">
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
                <span aria-hidden="true">⌄</span>
              </label>
              <label title="Workspace access">
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
                <span aria-hidden="true">⌄</span>
              </label>
            </div>
          </div>
          <p className="composer-note">
            {running
              ? "While working: ↑ steer now · ⇥ queue next · Enter drafts a new line"
              : "Enter to send · Shift+Enter for a new line · Drop or paste images"}
            {" · Changes may require approval"}
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
          onRename={openRenameDialog}
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
          busy={running}
          onFork={() => void forkConversation(threadMenu)}
          onCompact={() => void compactConversation(threadMenu)}
          onGoal={() => void openGoal(threadMenu.id)}
          onOpenInNewWindow={() => {
            void window.codex
              .openThreadInNewWindow(threadMenu.id)
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error ? cause.message : String(cause),
                ),
              );
            setThreadMenu(null);
          }}
        />
      ) : null}
      {renameTarget ? (
        <RenameThreadDialog
          key={renameTarget.id}
          thread={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSave={renameThread}
        />
      ) : null}
      {goalOpen ? (
        <GoalDialog
          goal={goal}
          onClose={() => setGoalOpen(false)}
          onSave={saveGoal}
          onClear={clearGoal}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsDialog
          notifications={notificationPreferences}
          transcription={transcriptionStatus}
          updateStatus={updateStatus}
          updateBlocked={running}
          theme={theme}
          microphonePermission={microphonePermission}
          onClose={() => setSettingsOpen(false)}
          onThemeChange={setTheme}
          onRequestMicrophonePermission={async () => {
            const status = await window.codex.requestMicrophonePermission();
            setMicrophonePermission(status);
            return status;
          }}
          onOpenMicrophoneSettings={() => window.codex.openMicrophoneSettings()}
          onTestNotification={() => window.codex.showTestNotification()}
          onNotificationsChange={async (preferences) => {
            await window.codex.setNotificationPreferences(preferences);
            setNotificationPreferences(preferences);
          }}
          onApiKeyChange={async (apiKey) => {
            const status = await window.codex.setTranscriptionApiKey(apiKey);
            setTranscriptionStatus(status);
            return status;
          }}
          onCheckForUpdates={() => window.codex.checkForUpdates()}
          onDownloadUpdate={() => window.codex.downloadUpdate()}
          onInstallUpdate={() => window.codex.installUpdate()}
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
