import { useMemo, useState } from "react";

const COLLAPSE_AFTER_LINES = 18;
const COLLAPSE_AFTER_CHARACTERS = 3_000;

export function ActivityOutput({
  text,
  command,
  collapsedByDefault = false,
}: {
  text: string;
  command?: string;
  collapsedByDefault?: boolean;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => text.split("\n"), [text]);
  const collapsible =
    collapsedByDefault ||
    lines.length > COLLAPSE_AFTER_LINES ||
    text.length > COLLAPSE_AFTER_CHARACTERS;
  const visible =
    collapsedByDefault && !expanded
      ? ""
      : expanded || !collapsible
        ? text
        : `${lines.slice(0, COLLAPSE_AFTER_LINES).join("\n")}\n…`;

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(command ? `${command}\n${text}` : text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  };

  return (
    <div className="activity-output">
      {expanded && command ? (
        <pre className="activity-command">{command}</pre>
      ) : null}
      {visible ? <pre>{visible}</pre> : null}
      <div className="activity-actions">
        {collapsible ? (
          <button onClick={() => setExpanded((current) => !current)}>
            {expanded
              ? "Collapse"
              : collapsedByDefault
                ? `Show command and output · ${lines.length} ${lines.length === 1 ? "line" : "lines"}`
                : `Show all ${lines.length} lines`}
          </button>
        ) : null}
        <button onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
