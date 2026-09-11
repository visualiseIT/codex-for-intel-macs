import { useState } from "react";
import type { FileChange } from "../../shared/types";

const MAX_RENDERED_LINES = 2_000;

export function summarizeDiff(diff: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

function DiffFile({ change }: { change: FileChange }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const lines = change.diff.split("\n");
  const truncated = lines.length > MAX_RENDERED_LINES;
  const visibleLines = lines.slice(0, MAX_RENDERED_LINES);
  const summary = summarizeDiff(change.diff);

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(
      change.diff || `${change.kind}: ${change.path}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  };

  return (
    <details className="diff-file" open>
      <summary>
        <span className="diff-kind">{change.kind}</span>
        <strong>{change.path}</strong>
        <span className="diff-count added">+{summary.additions}</span>
        <span className="diff-count removed">−{summary.deletions}</span>
      </summary>
      <div className="diff-toolbar">
        <button onClick={() => void copy()}>
          {copied ? "Copied" : "Copy patch"}
        </button>
      </div>
      {change.diff ? (
        <pre className="diff-lines">
          {visibleLines.map((line, index) => {
            const kind =
              line.startsWith("+") && !line.startsWith("+++")
                ? "added"
                : line.startsWith("-") && !line.startsWith("---")
                  ? "removed"
                  : line.startsWith("@@")
                    ? "hunk"
                    : line.startsWith("diff ") ||
                        line.startsWith("+++") ||
                        line.startsWith("---")
                      ? "header"
                      : "context";
            return (
              <span className={`diff-line ${kind}`} key={`${index}-${line}`}>
                {line || " "}
              </span>
            );
          })}
          {truncated ? (
            <span className="diff-truncated">
              Patch truncated after {MAX_RENDERED_LINES.toLocaleString()} lines.
            </span>
          ) : null}
        </pre>
      ) : (
        <p className="diff-empty">
          Patch details are not available for this change.
        </p>
      )}
    </details>
  );
}

export function DiffView({
  changes,
}: {
  changes: FileChange[];
}): React.JSX.Element {
  return (
    <div className="diff-view">
      {changes.map((change, index) => (
        <DiffFile change={change} key={`${change.path}-${index}`} />
      ))}
    </div>
  );
}
