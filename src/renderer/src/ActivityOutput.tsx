import { useMemo, useState } from "react";

const COLLAPSE_AFTER_LINES = 18;
const COLLAPSE_AFTER_CHARACTERS = 3_000;

export function ActivityOutput({ text }: { text: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => text.split("\n"), [text]);
  const collapsible =
    lines.length > COLLAPSE_AFTER_LINES ||
    text.length > COLLAPSE_AFTER_CHARACTERS;
  const visible =
    expanded || !collapsible
      ? text
      : `${lines.slice(0, COLLAPSE_AFTER_LINES).join("\n")}\n…`;

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  };

  return (
    <div className="activity-output">
      <pre>{visible}</pre>
      <div className="activity-actions">
        {collapsible ? (
          <button onClick={() => setExpanded((current) => !current)}>
            {expanded ? "Collapse" : `Show all ${lines.length} lines`}
          </button>
        ) : null}
        <button onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
