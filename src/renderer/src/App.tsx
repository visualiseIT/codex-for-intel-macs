import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatItem,
  CodexSettings,
  ConnectionState,
  ModelOption,
  PendingInteraction,
  SandboxMode,
  ThreadSummary,
  UiEvent,
} from "../../shared/types";

const LAST_WORKSPACE_KEY = "codex-desktop:last-workspace";

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
  const date = new Date(timestamp * 1000);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
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

function InteractionDialog({
  interaction,
  onResolve,
}: {
  interaction: PendingInteraction;
  onResolve: (result: unknown) => void;
}): React.JSX.Element {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});

  if (interaction.kind === "user-input") {
    const questions = interaction.questions ?? [];
    return (
      <div className="modal-backdrop">
        <section
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="interaction-title"
        >
          <span className="eyebrow">Input requested</span>
          <h2 id="interaction-title">{interaction.title}</h2>
          <p className="modal-detail">{interaction.detail}</p>
          <div className="question-list">
            {questions.map((question) => (
              <label className="question" key={question.id}>
                <span className="question-header">{question.header}</span>
                <span>{question.question}</span>
                {question.options?.length ? (
                  <>
                    <select
                      value={answers[question.id] ?? ""}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select an answer…</option>
                      {question.options.map((option) => (
                        <option value={option.label} key={option.label}>
                          {option.label} — {option.description}
                        </option>
                      ))}
                    </select>
                    {question.isOther ? (
                      <input
                        type={question.isSecret ? "password" : "text"}
                        placeholder="Or enter another answer…"
                        value={otherAnswers[question.id] ?? ""}
                        onChange={(event) =>
                          setOtherAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                      />
                    ) : null}
                  </>
                ) : (
                  <input
                    type={question.isSecret ? "password" : "text"}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                    autoFocus
                  />
                )}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="primary-button"
              disabled={questions.some(
                (question) =>
                  !(
                    otherAnswers[question.id] ??
                    answers[question.id] ??
                    ""
                  ).trim(),
              )}
              onClick={() =>
                onResolve({
                  answers: Object.fromEntries(
                    questions.map((question) => [
                      question.id,
                      {
                        answers: [
                          otherAnswers[question.id] ??
                            answers[question.id] ??
                            "",
                        ],
                      },
                    ]),
                  ),
                })
              }
            >
              Continue
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interaction-title"
      >
        <span className="eyebrow">Approval required</span>
        <h2 id="interaction-title">{interaction.title}</h2>
        <p className="modal-detail">{interaction.detail}</p>
        {interaction.command ? (
          <pre className="approval-command">{interaction.command}</pre>
        ) : null}
        {interaction.cwd ? (
          <p className="approval-path">In {interaction.cwd}</p>
        ) : null}
        <div className="modal-actions split-actions">
          <button
            className="ghost-button danger"
            onClick={() => onResolve({ decision: "decline" })}
          >
            Deny
          </button>
          <div>
            <button
              className="ghost-button"
              onClick={() => onResolve({ decision: "acceptForSession" })}
            >
              Allow for session
            </button>
            <button
              className="primary-button"
              onClick={() => onResolve({ decision: "accept" })}
            >
              Allow once
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function App(): React.JSX.Element {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadSummary | null>(
    null,
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [settings, setSettings] = useState<CodexSettings>(defaultSettings);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loadingThread, setLoadingThread] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<PendingInteraction[]>([]);
  const [error, setError] = useState("");
  const activeThreadRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedModel = models.find((model) => model.id === settings.model);
  const effortOptions = selectedModel?.efforts.length
    ? selectedModel.efforts
    : ["low", "medium", "high", "xhigh", "max", "ultra"];

  const refreshThreads = useCallback(async (term = "") => {
    try {
      setThreads(await window.codex.listThreads(term || undefined));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

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

  const handleUiEvent = useCallback(
    (event: UiEvent) => {
      if (event.type === "connection") {
        setConnection(event.state);
        setConnectionMessage(event.message ?? "");
        if (event.state === "connected") {
          void refreshThreads();
          void loadModels();
        }
        return;
      }
      if (event.type === "interaction") {
        setInteractions((current) => [...current, event.interaction]);
        return;
      }
      if (event.type === "thread-changed") {
        void refreshThreads(search);
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
          void refreshThreads(search);
        }
      }
    },
    [loadModels, refreshThreads, search],
  );

  useEffect(() => {
    const unsubscribe = window.codex.onEvent(handleUiEvent);
    void window.codex.getConnectionState().then((result) => {
      setConnection(result.state);
      setConnectionMessage(result.message ?? "");
      if (result.state === "connected") {
        void refreshThreads();
        void loadModels();
      }
    });
    return unsubscribe;
  }, [handleUiEvent, loadModels, refreshThreads]);

  useEffect(() => {
    if (connection !== "connected") return;
    const timer = setTimeout(() => void refreshThreads(search), 180);
    return () => clearTimeout(timer);
  }, [connection, refreshThreads, search]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  const openThread = async (thread: ThreadSummary): Promise<void> => {
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
    activeThreadRef.current = null;
    setSelectedThread(null);
    setItems([]);
    setActiveTurnId(null);
    setRunning(false);
    setError("");
  };

  const chooseWorkspace = async (): Promise<void> => {
    const cwd = await window.codex.chooseWorkspace();
    if (!cwd) return;
    localStorage.setItem(LAST_WORKSPACE_KEY, cwd);
    setSettings((current) => ({ ...current, cwd }));
  };

  const sendPrompt = async (): Promise<void> => {
    const text = prompt.trim();
    if (!text || running) return;
    if (!settings.cwd) {
      setError("Choose a workspace before starting a conversation.");
      return;
    }

    setPrompt("");
    setError("");
    setRunning(true);
    try {
      let thread = selectedThread;
      if (!thread) {
        thread = await window.codex.createThread(settings);
        activeThreadRef.current = thread.id;
        setSelectedThread(thread);
        await refreshThreads(search);
      }
      const result = await window.codex.startTurn({
        ...settings,
        threadId: thread.id,
        prompt: text,
      });
      setActiveTurnId(result.turnId);
    } catch (cause) {
      setRunning(false);
      setError(cause instanceof Error ? cause.message : String(cause));
      setPrompt(text);
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

  const visibleItems = useMemo(
    () =>
      items.filter((item) => item.kind !== "status" || item.text || item.title),
    [items],
  );

  return (
    <div className="app-shell">
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
        <div className="thread-label">Recent</div>
        <nav className="thread-list" aria-label="Conversation history">
          {threads.map((thread) => (
            <button
              key={thread.id}
              className={`thread-row ${selectedThread?.id === thread.id ? "selected" : ""}`}
              onClick={() => void openThread(thread)}
            >
              <span className="thread-title">{thread.title}</span>
              <span className="thread-meta">
                <span>{shortPath(thread.cwd)}</span>
                <time>{formatDate(thread.updatedAt)}</time>
              </span>
            </button>
          ))}
          {!threads.length && connection === "connected" ? (
            <p className="empty-sidebar">No matching conversations.</p>
          ) : null}
        </nav>
        <div className="connection-row">
          <span className={`connection-dot ${connection}`} />
          <span>
            {connection === "connected"
              ? "Codex connected"
              : connectionMessage || connection}
          </span>
        </div>
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
                    {item.text ? (
                      <pre>{item.text}</pre>
                    ) : item.status === "inProgress" ? (
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
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
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
                disabled={!prompt.trim() || connection !== "connected"}
                aria-label="Send prompt"
              >
                ↑
              </button>
            )}
          </div>
          <p className="composer-note">
            Enter to send · Shift+Enter for a new line · Changes may require
            approval
          </p>
        </footer>
      </main>

      {interactions[0] ? (
        <InteractionDialog
          interaction={interactions[0]}
          onResolve={(result) => void resolveInteraction(result)}
        />
      ) : null}
    </div>
  );
}
