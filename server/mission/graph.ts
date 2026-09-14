import type { MissionEdge, MissionTask, TaskPriority } from './types.js';

export interface TaskGraph {
  tasks: MissionTask[];
  edges: MissionEdge[];
}

export interface GraphValidation {
  ok: boolean;
  errors: string[];
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1
};

export function validateTaskGraph(graph: TaskGraph, siteId: string): GraphValidation {
  const errors: string[] = [];
  const byId = new Map<string, MissionTask>();

  for (const t of graph.tasks) {
    if (byId.has(t.id)) errors.push(`duplicate task id ${t.id}`);
    byId.set(t.id, t);
    if (t.siteId !== siteId) errors.push(`cross-site task ${t.id}`);
    if (t.dependsOn.includes(t.id)) errors.push(`self-dependency ${t.id}`);
  }

  const logical = new Map<string, string>();
  for (const t of graph.tasks) {
    if (t.status === 'CANCELLED' || t.status === 'SKIPPED' || t.status === 'STALE') continue;
    const prev = logical.get(t.logicalKey);
    if (prev && prev !== t.id) errors.push(`duplicate logical task ${t.logicalKey}`);
    logical.set(t.logicalKey, t.id);
  }

  for (const e of graph.edges) {
    if (!byId.has(e.from)) errors.push(`missing edge.from ${e.from}`);
    if (!byId.has(e.to)) errors.push(`missing edge.to ${e.to}`);
  }

  for (const t of graph.tasks) {
    for (const dep of t.dependsOn) {
      if (!byId.has(dep)) errors.push(`missing dependency ${dep} on ${t.id}`);
    }
  }

  // Cycle detection via DFS
  const adj = new Map<string, string[]>();
  for (const t of graph.tasks) adj.set(t.id, []);
  for (const e of graph.edges) {
    if (adj.has(e.from)) adj.get(e.from)!.push(e.to);
  }
  for (const t of graph.tasks) {
    for (const dep of t.dependsOn) {
      // dep → t (dep must finish before t)
      if (adj.has(dep)) adj.get(dep)!.push(t.id);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(id: string): boolean {
    if (visiting.has(id)) {
      errors.push(`cycle involving ${id}`);
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adj.get(id) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    stack.push(id);
    return false;
  }

  for (const t of graph.tasks) {
    if (!visited.has(t.id)) dfs(t.id);
  }

  return { ok: errors.length === 0, errors };
}

function impactRank(v?: string): number {
  if (v === 'HIGH') return 3;
  if (v === 'MEDIUM') return 2;
  if (v === 'LOW') return 1;
  return 0;
}

function confidenceRank(v?: string): number {
  if (v === 'HIGH') return 3;
  if (v === 'MEDIUM') return 2;
  if (v === 'LOW') return 1;
  return 0;
}

export function compareTasksDeterministic(a: MissionTask, b: MissionTask): number {
  const pr = (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
  if (pr) return pr;
  const cr = confidenceRank(b.confidence) - confidenceRank(a.confidence);
  if (cr) return cr;
  const ir = impactRank(b.expectedImpact) - impactRank(a.expectedImpact);
  if (ir) return ir;
  const er = (a.effort ?? 0.5) - (b.effort ?? 0.5);
  if (er) return er;
  const lk = (a.logicalKey || '').localeCompare(b.logicalKey || '');
  if (lk) return lk;
  return a.id.localeCompare(b.id);
}

/** Deterministic topological order. */
export function getExecutionOrder(graph: TaskGraph): MissionTask[] {
  const byId = new Map(graph.tasks.map((t) => [t.id, t]));
  const indeg = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const t of graph.tasks) {
    indeg.set(t.id, 0);
    children.set(t.id, []);
  }

  // Single edge source: dependsOn (edges[] mirrors it — do not double-count).
  const seen = new Set<string>();
  const addEdge = (from: string, to: string) => {
    if (!byId.has(from) || !byId.has(to)) return;
    const key = `${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    children.get(from)!.push(to);
    indeg.set(to, (indeg.get(to) || 0) + 1);
  };

  for (const t of graph.tasks) {
    for (const dep of t.dependsOn) addEdge(dep, t.id);
  }
  // Fallback edges for any edge not already represented in dependsOn
  for (const e of graph.edges) {
    const to = byId.get(e.to);
    if (to && to.dependsOn.includes(e.from)) continue;
    addEdge(e.from, e.to);
  }

  const ready = graph.tasks
    .filter((t) => (indeg.get(t.id) || 0) === 0)
    .sort(compareTasksDeterministic);

  const order: MissionTask[] = [];
  const queue = [...ready];

  while (queue.length) {
    queue.sort(compareTasksDeterministic);
    const next = queue.shift()!;
    order.push(next);
    for (const child of children.get(next.id) || []) {
      const n = (indeg.get(child) || 0) - 1;
      indeg.set(child, n);
      if (n === 0) {
        const task = byId.get(child);
        if (task) queue.push(task);
      }
    }
  }

  // Append any leftover (cycle survivors) sorted for stability
  if (order.length < graph.tasks.length) {
    const seen = new Set(order.map((t) => t.id));
    const rest = graph.tasks.filter((t) => !seen.has(t.id)).sort(compareTasksDeterministic);
    order.push(...rest);
  }

  return order;
}

export function dependenciesSatisfied(task: MissionTask, byId: Map<string, MissionTask>): boolean {
  return task.dependsOn.every((id) => {
    const dep = byId.get(id);
    return dep && (dep.status === 'COMPLETED' || dep.status === 'SKIPPED');
  });
}
