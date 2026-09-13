import type { ThreadSummary } from "../../shared/types";
import type { ThreadProjectGroup, ThreadTreeNode } from "./thread-tree";

function shortPath(value: string): string {
  if (!value) return "No workspace";
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

function TreeRow({
  node,
  depth,
  selectedThreadId,
  pinnedThreads,
  onOpen,
  onToggleStar,
  onManage,
}: {
  node: ThreadTreeNode;
  depth: number;
  selectedThreadId: string | null;
  pinnedThreads: Set<string>;
  onOpen: (thread: ThreadSummary) => void;
  onToggleStar: (thread: ThreadSummary) => void;
  onManage: (thread: ThreadSummary) => void;
}): React.JSX.Element {
  const forkDescription = node.parent
    ? `Forked from ${node.parent.title}`
    : node.missingParentId
      ? `Forked from ${node.missingParentId}`
      : node.children.length
        ? `${node.children.length} direct fork${node.children.length === 1 ? "" : "s"}`
        : node.thread.title;
  return (
    <>
      <div
        className={`thread-row-wrap ${selectedThreadId === node.thread.id ? "selected" : ""} ${pinnedThreads.has(node.thread.id) ? "starred" : ""} ${node.contextOnly ? "context-only" : ""}`}
        style={{ "--thread-depth": Math.min(depth, 4) } as React.CSSProperties}
        title={forkDescription}
      >
        <button className="thread-row" onClick={() => onOpen(node.thread)}>
          <span className="thread-title">
            {depth ? <span className="fork-branch">↳</span> : null}
            {node.thread.title}
            {node.children.length ? (
              <span className="fork-count">{node.children.length}</span>
            ) : null}
          </span>
          <span className="thread-meta">
            <span>
              {node.contextOnly ? "Parent context" : shortPath(node.thread.cwd)}
            </span>
            <time>{formatDate(node.thread.updatedAt)}</time>
          </span>
        </button>
        <button
          className="thread-star"
          onClick={() => onToggleStar(node.thread)}
          aria-label={`${pinnedThreads.has(node.thread.id) ? "Remove star from" : "Star"} ${node.thread.title}`}
          title={
            pinnedThreads.has(node.thread.id)
              ? "Remove star"
              : "Star conversation"
          }
        >
          {pinnedThreads.has(node.thread.id) ? "★" : "☆"}
        </button>
        <button
          className="thread-more"
          onClick={() => onManage(node.thread)}
          aria-label={`Manage ${node.thread.title}`}
        >
          •••
        </button>
      </div>
      {node.children.map((child) => (
        <TreeRow
          key={child.thread.id}
          node={child}
          depth={depth + 1}
          selectedThreadId={selectedThreadId}
          pinnedThreads={pinnedThreads}
          onOpen={onOpen}
          onToggleStar={onToggleStar}
          onManage={onManage}
        />
      ))}
    </>
  );
}

export function ThreadSidebar({
  groups,
  collapsedProjects,
  selectedThreadId,
  pinnedThreads,
  onToggleProject,
  onOpen,
  onToggleStar,
  onManage,
}: {
  groups: ThreadProjectGroup[];
  collapsedProjects: Set<string>;
  selectedThreadId: string | null;
  pinnedThreads: Set<string>;
  onToggleProject: (key: string) => void;
  onOpen: (thread: ThreadSummary) => void;
  onToggleStar: (thread: ThreadSummary) => void;
  onManage: (thread: ThreadSummary) => void;
}): React.JSX.Element {
  return (
    <>
      {groups.map((group) => {
        const collapsed = collapsedProjects.has(group.key);
        return (
          <section className="thread-project" key={group.key}>
            <button
              className="project-header"
              onClick={() => onToggleProject(group.key)}
              title={group.path || group.label}
              aria-expanded={!collapsed}
            >
              <span className="project-chevron">{collapsed ? "›" : "⌄"}</span>
              <span className="project-name">{group.label}</span>
              <span className="project-count">{group.count}</span>
            </button>
            {!collapsed
              ? group.roots.map((node) => (
                  <TreeRow
                    key={node.thread.id}
                    node={node}
                    depth={0}
                    selectedThreadId={selectedThreadId}
                    pinnedThreads={pinnedThreads}
                    onOpen={onOpen}
                    onToggleStar={onToggleStar}
                    onManage={onManage}
                  />
                ))
              : null}
          </section>
        );
      })}
    </>
  );
}
