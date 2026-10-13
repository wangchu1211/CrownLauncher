import type { ActionState, ExecutionAction, ExecutionGraph, ExecutionModule } from "../Shared/workbench";

export const actionLabels: Record<ActionState, string> = {
  pending: "等待执行", running: "执行中", succeeded: "已完成", reused: "已复用", prepared: "已准备",
  failed: "失败", blocked: "受阻", cancelled: "已取消", interrupted: "已中断", unknown: "未确认",
};
export const kindLabels: Record<string, string> = { Compile: "编译", Generate: "生成", Archive: "归档", Link: "链接", ResourceCompile: "资源编译", Stage: "校验 / 部署", Build: "依赖构建", Configure: "配置" };
export type GraphFilter = "all" | "running" | "problems" | "changed";
export const nodeWidth = 212, nodeHeight = 104;
export interface ModuleView extends ExecutionModule {
  actions: ExecutionAction[];
  state: ActionState;
  completed: number;
  reused: number;
  running: number;
}
export function moduleViews(graph: ExecutionGraph): ModuleView[] {
  const grouped = new Map<string, ExecutionAction[]>();
  for (const action of graph.actions) {
    const list = grouped.get(action.module) ?? [];
    list.push(action); grouped.set(action.module, list);
  }
  return graph.modules.map(module => {
    const actions = grouped.get(module.id) ?? [];
    const has = (state: ActionState) => actions.some(action => action.state === state);
    const state: ActionState = has("failed") ? "failed" : has("running") ? "running" : has("blocked") ? "blocked"
      : has("interrupted") ? "interrupted" : has("cancelled") ? "cancelled" : has("unknown") ? "unknown"
      : has("pending") ? "pending" : actions.length === 0 ? "unknown"
      : actions.every(action => action.state === "prepared") ? "prepared"
      : actions.every(action => action.state === "reused") ? "reused" : "succeeded";
    return { ...module, actions, state, completed: actions.filter(action => action.state === "succeeded").length,
      reused: actions.filter(action => action.state === "reused").length, running: actions.filter(action => action.state === "running").length };
  });
}
export function matchesFilter(node: ModuleView, filter: GraphFilter) {
  return filter === "all" || filter === "running" && node.running > 0
    || filter === "problems" && node.actions.some(action => ["failed", "blocked", "interrupted", "unknown"].includes(action.state))
    || filter === "changed" && node.actions.some(action => action.needsBuild || ["running", "succeeded", "failed"].includes(action.state));
}
export function relatedNodes(nodes: readonly ExecutionModule[], selected: string): Set<string> {
  const related = new Set<string>([selected]);
  const walk = (upstream: boolean) => {
    const visited = new Set<string>(), queue = [selected];
    while (queue.length) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id); related.add(id);
      queue.push(...(upstream ? nodes.find(node => node.id === id)?.dependencies ?? [] : nodes.filter(node => node.dependencies.includes(id)).map(node => node.id)));
    }
  };
  walk(true); walk(false); return related;
}

// Layout depends only on the snapshot, not on live state. Grouped generators
// can form apparent module cycles although actions are a DAG. Condense them
// rather than inventing an execution order.
export function layoutGraph(nodes: readonly ExecutionModule[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const indices = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], onStack = new Set<string>();
  const components: string[][] = [];
  let index = 0;
  const visit = (id: string) => {
    indices.set(id, index); low.set(id, index++); stack.push(id); onStack.add(id);
    for (const dependency of byId.get(id)!.dependencies.filter(dep => byId.has(dep))) {
      if (!indices.has(dependency)) { visit(dependency); low.set(id, Math.min(low.get(id)!, low.get(dependency)!)); }
      else if (onStack.has(dependency)) low.set(id, Math.min(low.get(id)!, indices.get(dependency)!));
    }
    if (low.get(id) === indices.get(id)) {
      const group: string[] = []; let member: string;
      do { member = stack.pop()!; onStack.delete(member); group.push(member); } while (member !== id);
      components.push(group.sort());
    }
  };
  [...byId.keys()].sort().forEach(id => { if (!indices.has(id)) visit(id); });
  const componentOf = new Map(components.flatMap((group, i) => group.map(id => [id, i] as const)));
  const ranks = new Map<number, number>();
  const rank = (i: number): number => {
    if (ranks.has(i)) return ranks.get(i)!;
    const dependencies = components[i]!.flatMap(id => byId.get(id)!.dependencies.map(dep => componentOf.get(dep))).filter((dep): dep is number => dep !== undefined && dep !== i);
    const result = dependencies.length ? Math.max(...dependencies.map(rank)) + 1 : 0;
    ranks.set(i, result); return result;
  };
  const columns = new Map<number, string[]>();
  components.forEach((group, i) => { const r = rank(i); columns.set(r, [...columns.get(r) ?? [], ...group]); });
  const rows = Math.max(1, ...[...columns.values()].map(column => column.length));
  const height = rows * (nodeHeight + 24) + 40, width = columns.size * (nodeWidth + 64) + 16;
  const positions = new Map<string, { x: number; y: number }>();
  for (const [column, ids] of columns) ids.sort().forEach((id, row) => positions.set(id, { x: 24 + column * (nodeWidth + 64), y: (height - ids.length * (nodeHeight + 24)) / 2 + row * (nodeHeight + 24) }));
  return { positions, width, height };
}
export function actionDuration(action: ExecutionAction, now: number): string {
  if (!action.startedAt) return "—";
  const end = action.finishedAt ? Date.parse(action.finishedAt) : action.state === "running" ? now : NaN;
  const seconds = (end - Date.parse(action.startedAt)) / 1000;
  if (!Number.isFinite(seconds)) return "结束时间未记录";
  return seconds < 60 ? Math.max(0, seconds).toFixed(1) + " 秒" : Math.floor(seconds / 60) + " 分 " + Math.floor(seconds % 60) + " 秒";
}
