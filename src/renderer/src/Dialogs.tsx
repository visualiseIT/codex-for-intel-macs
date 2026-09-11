import { useState } from "react";
import type {
  CodexDiagnostics,
  PendingInteraction,
  ThreadSummary,
} from "../../shared/types";

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
          {!archived ? <button onClick={onRename}>Rename</button> : null}
          {!archived ? (
            <button onClick={onPin}>{pinned ? "Unpin" : "Pin to top"}</button>
          ) : null}
          {archived ? (
            <button onClick={onRestore}>Restore conversation</button>
          ) : (
            <button onClick={onArchive}>Archive conversation</button>
          )}
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
