import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BuildJobView, ExecutionAction, ExecutionGraph, ExecutionModule } from "../Source/Shared/workbench";
import { actionDuration, layoutGraph, matchesFilter, moduleViews, nodeHeight, nodeWidth, relatedNodes } from "../Source/Renderer/executionGraph";
import { BuildExecutionGraph, ModuleDetails } from "../Source/Renderer/BuildExecutionGraph";

const action = (id: string, module: string, state: ExecutionAction["state"]): ExecutionAction => ({
  id, module, state, kind: "Compile", label: "Engine/" + id + ".cpp", dependencies: [], needsBuild: true,
  startedAt: null, finishedAt: null, exitCode: null,
});
const modules: ExecutionModule[] = [
  { id: "Core", name: "Core", kind: "module", dependencies: [] },
  { id: "AssetCore", name: "AssetCore", kind: "module", dependencies: ["Core"] },
  { id: "Probe", name: "Probe", kind: "module", dependencies: ["AssetCore"] },
  { id: "$link", name: "链接", kind: "stage", dependencies: ["Probe", "Core"] },
];
const graph: ExecutionGraph = { id: "one", target: "Probe", fingerprint: "fixed", createdAt: "", modules, actions: [
  action("a", "Core", "running"), action("b", "Core", "running"), action("c", "Core", "succeeded"),
  action("d", "AssetCore", "running"), action("e", "Probe", "reused"), action("link", "$link", "pending"),
] };

describe("single-build execution graph", () => {
  it("aggregates parallel modules without inventing serial execution", () => {
    const nodes = moduleViews(graph);
    expect(nodes[0]).toMatchObject({ state: "running", running: 2, completed: 1 });
    expect(nodes[1]).toMatchObject({ state: "running", running: 1 });
    expect(nodes[2]).toMatchObject({ state: "reused", reused: 1 });
    expect(nodes[3]).toMatchObject({ state: "pending" });
    expect(matchesFilter(nodes[0]!, "running")).toBe(true);
    expect(matchesFilter(nodes[2]!, "running")).toBe(false);
  });
  it("keeps failure distinct from blocked, cancellation and unknown", () => {
    for (const state of ["failed", "blocked", "cancelled", "interrupted", "unknown", "prepared"] as const) {
      expect(moduleViews({ ...graph, actions: [action("x", "Core", state)] })[0]!.state).toBe(state);
    }
    expect(moduleViews({ ...graph, actions: [] })[0]!.state).toBe("unknown");
  });
  it("does not rearrange nodes as progress changes", () => {
    const first = layoutGraph(graph.modules);
    const second = layoutGraph([...graph.modules].reverse());
    expect([...first.positions].sort()).toEqual([...second.positions].sort());
    for (const module of graph.modules) {
      for (const dependency of module.dependencies) expect(first.positions.get(dependency)!.x).toBeLessThan(first.positions.get(module.id)!.x);
    }
    const points = [...first.positions.values()];
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      expect(Math.abs(points[i]!.x - points[j]!.x) >= nodeWidth || Math.abs(points[i]!.y - points[j]!.y) >= nodeHeight).toBe(true);
    }
  });
  it("handles grouped cycles, disconnected nodes and unknown edges", () => {
    const layout = layoutGraph([{ ...modules[0]!, dependencies: ["AssetCore", "missing"] }, modules[1]!, { ...modules[2]!, dependencies: [] }]);
    expect(layout.positions.size).toBe(3);
    expect([...layout.positions.values()].every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(layoutGraph([]).height).toBeGreaterThan(0);
  });
  it("lays out a large module snapshot and keeps every action accessible", () => {
    const largeModules = Array.from({ length: 120 }, (_, i) => ({ id: "M" + i, name: "M" + i, kind: "module", dependencies: i ? ["M" + Math.floor((i - 1) / 3)] : [] }));
    const largeActions = Array.from({ length: 5000 }, (_, i) => action("source" + i, "M" + (i % 120), "pending"));
    const large = { ...graph, modules: largeModules, actions: largeActions };
    expect(layoutGraph(largeModules).positions.size).toBe(120);
    expect(moduleViews(large).reduce((sum, node) => sum + node.actions.length, 0)).toBe(5000);
  });
  it("highlights upstream and downstream, not unrelated branches", () => {
    const related = relatedNodes([...modules, { id: "other", name: "other", kind: "module", dependencies: [] }], "AssetCore");
    expect([...related].sort()).toEqual(["$link", "AssetCore", "Core", "Probe"]);
  });
  it("uses observed times and does not keep cancelled durations ticking", () => {
    const a = { ...action("x", "Core", "running"), startedAt: "2026-10-12T00:00:00Z" };
    expect(actionDuration(a, Date.parse("2026-10-12T00:00:03Z"))).toBe("3.0 秒");
    expect(actionDuration({ ...a, state: "cancelled" }, Date.now())).toBe("结束时间未记录");
    expect(actionDuration({ ...a, finishedAt: "2026-10-12T00:00:02Z", state: "succeeded" }, Date.now())).toBe("2.0 秒");
  });
  it("renders real module nodes, graph controls and execution count", () => {
    const entry = { job: { state: "running", target: graph.target }, execution: { schemaVersion: 1, graphs: [graph], warnings: [] } } as unknown as BuildJobView;
    const html = renderToStaticMarkup(createElement(BuildExecutionGraph, { entry }));
    for (const text of ["单次构建内部进展", "适应全图", "定位执行中", "Core · 执行中 · 2 个执行中", "3 个子任务执行中", "不是时间进度", "markerEnd"]) {
      expect(html).toContain(text === "markerEnd" ? "marker-end" : text);
    }
  });
  it("shows old jobs and preparation honestly without synthetic graphs", () => {
    const render = (state: string) => renderToStaticMarkup(createElement(BuildExecutionGraph, { entry: { job: { state, target: "Probe" } } as BuildJobView }));
    expect(render("succeeded")).toContain("此目标没有构建图记录");
    expect(render("running")).toContain("等待主目标构建图");
    expect(render("succeeded")).not.toContain("execution-node");
  });
  it("provides searchable action details and precise dependencies", () => {
    const html = renderToStaticMarkup(createElement(ModuleDetails, { node: moduleViews(graph)[0]!, graph, onClose: () => {} }));
    for (const label of ["搜索模块子任务", "a.cpp", "b.cpp", "c.cpp", "模块连线不代表源文件必须串行编译"]) expect(html).toContain(label);
  });
});
