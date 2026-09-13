import { useState } from "react";
import type {
  CodexDiagnostics,
  MicrophonePermissionStatus,
  NotificationPreferences,
  PendingInteraction,
  ThemeMode,
  ThreadGoal,
  ThreadGoalStatus,
  ThreadSummary,
  TranscriptionStatus,
} from "../../shared/types";
import { readableError } from "./errors";

export function InteractionDialog({
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

export function ThreadActionsDialog({
  thread,
  archived,
  pinned,
  onClose,
  onRename,
  onPin,
  onArchive,
  onRestore,
  onDelete,
  onFork,
  onCompact,
  onGoal,
  onOpenInNewWindow,
  busy,
}: {
  thread: ThreadSummary;
  archived: boolean;
  pinned: boolean;
  onClose: () => void;
  onRename: () => void;
  onPin: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onFork: () => void;
  onCompact: () => void;
  onGoal: () => void;
  onOpenInNewWindow: () => void;
  busy: boolean;
}): React.JSX.Element {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal thread-actions-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="eyebrow">Conversation</span>
        <h2>{thread.title}</h2>
        <p className="modal-detail">{thread.cwd || "No workspace recorded"}</p>
        <div className="thread-action-list">
          <button onClick={onOpenInNewWindow}>Open in new window</button>
          {!archived ? <button onClick={onRename}>Rename</button> : null}
          {!archived ? (
            <button onClick={onPin}>{pinned ? "Unpin" : "Pin to top"}</button>
          ) : null}
          {archived ? (
            <button onClick={onRestore}>Restore conversation</button>
          ) : (
            <button onClick={onArchive}>Archive conversation</button>
          )}
          {!archived ? (
            <button onClick={onFork} disabled={busy}>
              Fork conversation
            </button>
          ) : null}
          {!archived ? (
            <button onClick={onCompact} disabled={busy}>
              Compact context…
            </button>
          ) : null}
          {!archived ? <button onClick={onGoal}>Manage goal…</button> : null}
          <button className="danger" onClick={onDelete}>
            Delete permanently…
          </button>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

export function GoalDialog({
  goal,
  onClose,
  onSave,
  onClear,
}: {
  goal: ThreadGoal | null;
  onClose: () => void;
  onSave: (
    objective: string,
    status: ThreadGoalStatus,
    tokenBudget: number | null,
  ) => Promise<void>;
  onClear: () => Promise<void>;
}): React.JSX.Element {
  const [objective, setObjective] = useState(goal?.objective ?? "");
  const [status, setStatus] = useState<ThreadGoalStatus>(
    goal?.status ?? "active",
  );
  const [tokenBudget, setTokenBudget] = useState(
    goal?.tokenBudget?.toString() ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="eyebrow">Conversation goal</span>
        <h2>{goal ? "Manage goal" : "Set a goal"}</h2>
        <label className="settings-field">
          <span>Objective</span>
          <textarea
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            rows={4}
            autoFocus
          />
        </label>
        <div className="settings-grid">
          <label className="settings-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ThreadGoalStatus)
              }
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="blocked">Blocked</option>
              <option value="usageLimited">Usage limited</option>
              <option value="budgetLimited">Budget limited</option>
              <option value="complete">Complete</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Token budget (optional)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={tokenBudget}
              onChange={(event) => setTokenBudget(event.target.value)}
            />
          </label>
        </div>
        {goal ? (
          <p className="modal-detail">
            {goal.tokensUsed.toLocaleString()} tokens · {goal.timeUsedSeconds}s
            elapsed
          </p>
        ) : null}
        {error ? <p className="settings-error">{error}</p> : null}
        <div className="modal-actions split-actions">
          <button className="ghost-button" onClick={onClose} disabled={busy}>
            Close
          </button>
          <div>
            {goal ? (
              <button
                className="ghost-button danger"
                disabled={busy}
                onClick={() => void run(onClear)}
              >
                Clear goal
              </button>
            ) : null}
            <button
              className="primary-button"
              disabled={busy || !objective.trim()}
              onClick={() =>
                void run(() =>
                  onSave(
                    objective.trim(),
                    status,
                    tokenBudget ? Number(tokenBudget) : null,
                  ),
                )
              }
            >
              Save goal
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function SettingsDialog({
  notifications,
  transcription,
  theme,
  microphonePermission,
  onClose,
  onThemeChange,
  onRequestMicrophonePermission,
  onOpenMicrophoneSettings,
  onTestNotification,
  onNotificationsChange,
  onApiKeyChange,
}: {
  notifications: NotificationPreferences;
  transcription: TranscriptionStatus;
  theme: ThemeMode;
  microphonePermission: MicrophonePermissionStatus;
  onClose: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onRequestMicrophonePermission: () => Promise<MicrophonePermissionStatus>;
  onOpenMicrophoneSettings: () => Promise<void>;
  onTestNotification: () => Promise<void>;
  onNotificationsChange: (
    preferences: NotificationPreferences,
  ) => Promise<void>;
  onApiKeyChange: (apiKey: string) => Promise<TranscriptionStatus>;
}): React.JSX.Element {
  const [preferences, setPreferences] = useState(notifications);
  const [status, setStatus] = useState(transcription);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [permission, setPermission] = useState(microphonePermission);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationBusy, setNotificationBusy] = useState(false);

  const savePreferences = async (
    next: NotificationPreferences,
  ): Promise<void> => {
    setPreferences(next);
    await onNotificationsChange(next);
  };

  const saveKey = async (): Promise<void> => {
    setBusy(true);
    setMessage("");
    try {
      setStatus(await onApiKeyChange(apiKey));
      setApiKey("");
      setMessage(
        apiKey.trim() ? "API key saved securely." : "Saved key removed.",
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const requestMicrophone = async (): Promise<void> => {
    setPermissionBusy(true);
    setMessage("");
    try {
      const next = await onRequestMicrophonePermission();
      setPermission(next);
      setMessage(
        next === "granted"
          ? "Microphone access granted."
          : next === "denied"
            ? "Microphone access is denied. Enable it in macOS Settings, then restart the app."
            : `Microphone access is ${next}.`,
      );
    } catch (cause) {
      setMessage(readableError(cause));
    } finally {
      setPermissionBusy(false);
    }
  };

  const testNotification = async (): Promise<void> => {
    setNotificationBusy(true);
    setNotificationMessage("");
    try {
      await onTestNotification();
      setNotificationMessage("Test notification sent.");
    } catch (cause) {
      setNotificationMessage(readableError(cause));
    } finally {
      setNotificationBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="eyebrow">Desktop settings</span>
        <h2>Preferences</h2>
        <div className="settings-section">
          <strong>Appearance</strong>
          <label className="settings-field">
            <span>Theme</span>
            <select
              value={theme}
              onChange={(event) =>
                onThemeChange(event.target.value as ThemeMode)
              }
            >
              <option value="system">Use system setting</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
        <div className="settings-section">
          <strong>Notifications</strong>
          <p className="modal-detail">
            System alerts are sent while the app is not focused. Test delivery
            here before relying on them.
          </p>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={preferences.turnCompleted}
              onChange={(event) =>
                void savePreferences({
                  ...preferences,
                  turnCompleted: event.target.checked,
                })
              }
            />
            Notify when a background turn finishes
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={preferences.attentionRequired}
              onChange={(event) =>
                void savePreferences({
                  ...preferences,
                  attentionRequired: event.target.checked,
                })
              }
            />
            Notify when Codex needs approval or input
          </label>
          <div className="settings-inline-actions">
            <button
              className="ghost-button"
              disabled={notificationBusy}
              onClick={() => void testNotification()}
            >
              {notificationBusy ? "Testing…" : "Send test notification"}
            </button>
          </div>
          {notificationMessage ? (
            <p className="settings-status">{notificationMessage}</p>
          ) : null}
        </div>
        <div className="settings-section">
          <strong>Microphone dictation</strong>
          <p className="modal-detail">
            Recordings are sent to the OpenAI Audio API using {status.model}.
            API usage is billed separately from your Codex subscription.
          </p>
          <p className="settings-status">
            Microphone permission: {permission.replace("-", " ")}.
          </p>
          <div className="settings-inline-actions">
            {permission === "denied" || permission === "restricted" ? (
              <button
                className="ghost-button"
                onClick={() => void onOpenMicrophoneSettings()}
              >
                Open Microphone Settings
              </button>
            ) : (
              <button
                className="ghost-button"
                disabled={permissionBusy || permission === "granted"}
                onClick={() => void requestMicrophone()}
              >
                {permissionBusy
                  ? "Requesting…"
                  : permission === "granted"
                    ? "Microphone allowed"
                    : "Allow microphone"}
              </button>
            )}
          </div>
          <p className="settings-status">
            {status.configured
              ? `Configured via ${status.source === "environment" ? "OPENAI_API_KEY" : "macOS Keychain"}.`
              : "No transcription API key configured."}
          </p>
          {status.source !== "environment" ? (
            <div className="settings-key-row">
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  status.configured
                    ? "Enter a replacement key"
                    : "OpenAI API key"
                }
              />
              <button
                className="primary-button"
                disabled={busy || (!apiKey.trim() && !status.configured)}
                onClick={() => void saveKey()}
              >
                {apiKey.trim() ? "Save key" : "Remove key"}
              </button>
            </div>
          ) : null}
          {message ? <p className="settings-status">{message}</p> : null}
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

export function DiagnosticsDialog({
  diagnostics,
  onClose,
  onReconnect,
}: {
  diagnostics: CodexDiagnostics;
  onClose: () => void;
  onReconnect: () => void;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const report = [
    `Connection: ${diagnostics.connection}`,
    diagnostics.message ? `Message: ${diagnostics.message}` : "",
    `CLI: ${diagnostics.cliVersion || "Unknown"}`,
    `Binary: ${diagnostics.binary || "Not detected"}`,
    `PID: ${diagnostics.processId ?? "Not running"}`,
    `Started: ${diagnostics.startedAt ? new Date(diagnostics.startedAt).toLocaleString() : "Not running"}`,
    diagnostics.stderrTail ? `\nRecent stderr:\n${diagnostics.stderrTail}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal diagnostics-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="eyebrow">Codex diagnostics</span>
        <h2>
          {diagnostics.connection === "connected"
            ? "Connected"
            : "Connection help"}
        </h2>
        <pre className="diagnostics-report">{report}</pre>
        <p className="modal-detail">
          Authentication tokens are not included. Recent stderr is bounded and
          likely token patterns are redacted.
        </p>
        <div className="modal-actions split-actions">
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
          <div>
            <button className="ghost-button" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy diagnostics"}
            </button>
            <button className="primary-button" onClick={onReconnect}>
              Restart Codex
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
