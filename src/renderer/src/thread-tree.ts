import type { ThreadSummary } from "../../shared/types";

export interface ThreadTreeNode {
  thread: ThreadSummary;
  parent: ThreadSummary | null;
  children: ThreadTreeNode[];
  contextOnly: boolean;
  missingParentId: string | null;
}

export interface ThreadProjectGroup {
  key: string;
  label: string;
  path: string;
  count: number;
  roots: ThreadTreeNode[];
}

function normalizedPath(path: string): string {
  return path.replace(/\/+$/, "") || path;
}

function projectKey(thread: ThreadSummary): string {
  if (thread.projectId) return `project:${thread.projectId}`;
  if (thread.cwd) return `cwd:${normalizedPath(thread.cwd)}`;
  return "other";
}

function projectLabel(thread: ThreadSummary): string {
  if (!thread.cwd) return "Other conversations";
  const path = normalizedPath(thread.cwd);
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function compareThreads(
  a: ThreadTreeNode,
  b: ThreadTreeNode,
  pins: Set<string>,
) {
  const pinned = Number(pins.has(b.thread.id)) - Number(pins.has(a.thread.id));
  return pinned || b.thread.updatedAt - a.thread.updatedAt;
}

export function buildThreadProjects(
  visibleThreads: ThreadSummary[],
  contextThreads: ThreadSummary[],
  pins: Set<string>,
): ThreadProjectGroup[] {
  const visibleIds = new Set(visibleThreads.map((thread) => thread.id));
  const all = new Map<string, ThreadSummary>();
  for (const thread of [...contextThreads, ...visibleThreads])
    all.set(thread.id, thread);

  const included = new Set(visibleIds);
  for (const visible of visibleThreads) {
    const visited = new Set<string>([visible.id]);
    let parentId = visible.forkedFromId;
    while (parentId && !visited.has(parentId)) {
      const parent = all.get(parentId);
      if (!parent) break;
      included.add(parent.id);
      visited.add(parent.id);
      parentId = parent.forkedFromId;
    }
  }

  const nodes = new Map<string, ThreadTreeNode>();
  for (const id of included) {
    const thread = all.get(id);
    if (!thread) continue;
    nodes.set(id, {
      thread,
      parent: null,
      children: [],
      contextOnly: !visibleIds.has(id),
      missingParentId: null,
    });
  }

  const roots: ThreadTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.thread.forkedFromId;
    const parent = parentId ? nodes.get(parentId) : undefined;
    let cursor = parent;
    const ancestry = new Set<string>();
    let cyclic = false;
    while (cursor && !ancestry.has(cursor.thread.id)) {
      if (cursor.thread.id === node.thread.id) {
        cyclic = true;
        break;
      }
      ancestry.add(cursor.thread.id);
      cursor = cursor.thread.forkedFromId
        ? nodes.get(cursor.thread.forkedFromId)
        : undefined;
    }
    if (parent && !cyclic) {
      node.parent = parent.thread;
      parent.children.push(node);
    } else {
      node.missingParentId = parentId;
      roots.push(node);
    }
  }

  const sortTree = (node: ThreadTreeNode): void => {
    node.children.sort((a, b) => compareThreads(a, b, pins));
    node.children.forEach(sortTree);
  };
  roots.sort((a, b) => compareThreads(a, b, pins));
  roots.forEach(sortTree);

  const groups = new Map<string, ThreadProjectGroup>();
  for (const root of roots) {
    const key = projectKey(root.thread);
    const existing = groups.get(key);
    if (existing) {
      existing.roots.push(root);
      continue;
    }
    groups.set(key, {
      key,
      label: projectLabel(root.thread),
      path: root.thread.cwd,
      count: 0,
      roots: [root],
    });
  }

  for (const group of groups.values()) {
    const countVisible = (node: ThreadTreeNode): number =>
      Number(!node.contextOnly) +
      node.children.reduce((total, child) => total + countVisible(child), 0);
    group.count = group.roots.reduce(
      (total, root) => total + countVisible(root),
      0,
    );
  }

  return [...groups.values()].sort((a, b) => {
    if (a.key === "other") return 1;
    if (b.key === "other") return -1;
    const aLatest = Math.max(...a.roots.map((root) => root.thread.updatedAt));
    const bLatest = Math.max(...b.roots.map((root) => root.thread.updatedAt));
    return bLatest - aLatest;
  });
}
