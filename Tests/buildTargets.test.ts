import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BuildTargetDialog, BuildTargetPicker, TargetResults } from "../Source/Renderer/BuildTargetPicker";
import { defaultBuildTarget, groupedTargets, initialTargetFilter, targetCategory, targetDescription, targetHint, targetWarning, type BuildTarget, type TargetFilter } from "../Source/Renderer/buildTargets";

const makeTarget = (name: string, kind = "Program", outputKind = "Executable", canRun = true): BuildTarget => ({
  name, kind, outputKind, canRun, ruleSource: `Engine/规则/${name}.Target.cs`, requiredFeatures: [],
});
const editor = makeTarget("CrownEditor", "Editor");
const terrain = makeTarget("Terrain", "RuntimeProduct", "StaticLibrary", false);
const terrainTests = makeTarget("TerrainCoreTests", "Test", "Executable", false);
const crashProbe = makeTarget("CrownDiagnosticsCrashProbe");
const targets = [terrainTests, makeTarget("FutureTool"), makeTarget("CrownPlayer", "Game"), terrain,
  makeTarget("CrownEditorCLI", "Editor"), makeTarget("CrownProfiler"), editor, crashProbe,
  makeTarget("CrownBuildProbe"), makeTarget("CrownProfilerLiveFixture", "Test", "Executable", false)];

describe("build target presentation", () => {
  it("defaults to available everyday products and never invents targets", () => {
    expect(defaultBuildTarget(targets)).toBe("CrownEditor");
    expect(defaultBuildTarget(targets.filter(target => target !== editor))).toBe("CrownProfiler");
    expect(defaultBuildTarget([terrain])).toBe("Terrain");
    expect(defaultBuildTarget([])).toBe("");
    expect(groupedTargets([terrain], "products", "")).toEqual([]);
    expect(initialTargetFilter(targets, editor.name)).toBe("products");
    expect(initialTargetFilter(targets, terrain.name)).toBe("libraries");
    expect(initialTargetFilter([terrain], "")).toBe("all");
  });

  it("shows only three ordered products in the everyday view", () => {
    expect(groupedTargets(targets, "products", "").flatMap(group => group.targets.map(target => target.name)))
      .toEqual(["CrownEditor", "CrownProfiler", "CrownPlayer"]);
    expect(targetCategory(makeTarget("CrownEditorCLI", "Editor"))).toBe("tools");
    expect(targetCategory(terrain)).toBe("libraries");
    expect(targetCategory(terrainTests)).toBe("validation");
    expect(targetCategory(crashProbe)).toBe("validation");
    expect(targetCategory(makeTarget("CrownBuildProbe"))).toBe("validation");
  });

  it("keeps every CBT target exactly once, without modifying capabilities", () => {
    const snapshot = JSON.stringify(targets);
    const names = groupedTargets(targets, "all", "").flatMap(group => group.targets.map(target => target.name));
    expect(names.sort()).toEqual(targets.map(target => target.name).sort());
    expect(new Set(names).size).toBe(targets.length);
    expect(JSON.stringify(targets)).toBe(snapshot);
    expect(targetDescription(makeTarget("FutureTool"))).toContain("目标规则文件");
  });

  it("searches names case-insensitively, Chinese descriptions and rule paths", () => {
    const names = (query: string, filter: TargetFilter = "all") => groupedTargets(targets, filter, query).flatMap(group => group.targets.map(target => target.name));
    expect(names("  tErRaIn ")).toContain("Terrain");
    expect(names("地形")).toEqual(["Terrain", "TerrainCoreTests"]);
    expect(names("地形", "validation")).toEqual(["TerrainCoreTests"]);
    expect(names("地形 测试")).toEqual(["TerrainCoreTests"]);
    expect(names("Engine/规则/FutureTool")).toEqual(["FutureTool"]);
    expect(names("missing-target")).toEqual([]);
  });

  it("explains libraries, tests, fixtures and intentional crashes without overriding CanRun", () => {
    expect(targetHint(terrain)).toContain("不可独立运行");
    expect(targetHint(terrainTests)).toContain("不执行测试");
    expect(targetDescription(targets.at(-1)!)).toContain("测试数据");
    expect(targetWarning(crashProbe)).toContain("故意触发崩溃");
    expect(crashProbe.canRun).toBe(true);
    expect(targetWarning(editor)).toBeUndefined();
    expect(targetHint({ ...editor, canRun: false })).toBe("仅构建");
  });

  it("keeps the default form compact and gives the selected target a description", () => {
    const html = renderToStaticMarkup(createElement(BuildTargetPicker, { targets, selected: editor.name, onSelect: vi.fn() }));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("完整的可视化编辑器");
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("FutureTool");
  });

  it("renders accessible categories, search and safe selection guidance", () => {
    const onSelect = vi.fn();
    const html = renderToStaticMarkup(createElement(BuildTargetDialog, { targets, selected: editor.name, onSelect, onDismiss: vi.fn() }));
    for (const label of ["常用产品", "模块库", "开发工具", "测试与验证", "全部", 'aria-label="搜索构建目标"', "不会开始构建", "当前选中"]) expect(html).toContain(label);
    expect(html).toContain('aria-labelledby="target-dialog-title"');
    expect(html).not.toContain("FutureTool");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps selection unchanged while filtering or when no results match", () => {
    const onSelect = vi.fn();
    const html = renderToStaticMarkup(createElement(TargetResults, { targets, selected: editor.name, onSelect, filter: "validation", query: "地形" }));
    expect(html).toContain("TerrainCoreTests");
    expect(html).not.toContain('aria-current="true"');
    expect(onSelect).not.toHaveBeenCalled();
    const empty = renderToStaticMarkup(createElement(TargetResults, { targets, selected: editor.name, onSelect, filter: "all", query: "unknown-target" }));
    expect(empty).toContain("没有匹配的构建目标");
    expect(empty).not.toContain('class="target-option');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects only the exact target clicked, with no build side effects", () => {
    const onSelect = vi.fn();
    const tree = TargetResults({ targets, selected: editor.name, onSelect, filter: "libraries", query: "" });
    type Props = { children?: ReactNode; onClick?: () => void };
    const buttons: ReactElement<Props>[] = [];
    const visit = (children: ReactNode) => Children.forEach(children, child => {
      if (!isValidElement<Props>(child)) return;
      if (child.type === "button") buttons.push(child);
      visit(child.props.children);
    });
    visit(tree);
    expect(buttons).toHaveLength(1);
    buttons[0]!.props.onClick!();
    expect(onSelect.mock.calls).toEqual([["Terrain"]]);
  });
});
