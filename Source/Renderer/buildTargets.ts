import type { BuildCapabilities } from "../Shared/workbench";

export type BuildTarget = BuildCapabilities["targets"][number];
export type TargetCategory = "products" | "libraries" | "tools" | "validation";
export type TargetFilter = TargetCategory | "all";

export const targetCategories: { id: TargetCategory; label: string }[] = [
  { id: "products", label: "常用产品" }, { id: "libraries", label: "模块库" },
  { id: "tools", label: "开发工具" }, { id: "validation", label: "测试与验证" },
];
const products = ["CrownEditor", "CrownProfiler", "CrownPlayer"];
const probes = new Set(["CrownBuildProbe", "CrownDiagnosticsCrashProbe"]);

// WHY: this catalog supplies presentation only; CBT remains authoritative for
// available targets, dependencies and CanRun. Unknown/new targets stay visible.
const descriptions = new Map<string, string>([
  ["CrownEditor", "完整的可视化编辑器，用于编辑场景、体验 Terrain 和 LookDev 等引擎功能。"],
  ["CrownProfiler", "独立的性能分析工具，构建时包含所需的 Profiler 后端。"],
  ["CrownPlayer", "脱离编辑器运行游戏的通用 Player；构建它不等于完成游戏项目打包。"],
  ["CrownEditorCLI", "编辑器命令行与轻量验证入口，不是完整编辑器窗口。"],
  ["CrownProfilerBackend", "Profiler 的后台分析与查询进程，通常由 Profiler 启动。"],
  ["CrownProfilerCLI", "通过命令行查询性能分析数据，面向自动化流程。"],
  ["CrownProjectCook", "处理项目资源的 Cook 工具，通常由项目构建流程调用。"],
  ["CrownBuiltinAssetCook", "处理引擎内置资源的 Cook 工具。"],
  ["CrownDiagnosticsHost", "Editor 和 Player 使用的进程外诊断工具，通常由宿主启动。"],
  ["CrownGenerationWorker", "生成工作流的后台执行程序，通常由编辑器调用。"],
  ["CrownFrameDebuggerCLI", "帧调试命令行工具，面向渲染诊断和自动化。"],
  ["CrownBuildProbe", "用于验证 CBT 编译、链接和运行流程的小程序，不是引擎产品。"],
  ["CrownDiagnosticsCrashProbe", "故意触发崩溃的诊断验证程序，用于检查崩溃处理流程。"],
  ["CrownProfilerLiveFixture", "为 Profiler 实时采集验证提供测试数据，由测试流程驱动。"],
  ["CrownDiagnosticsTargetFixture", "为诊断系统验证提供测试进程，由测试流程驱动。"],
  ["Terrain", "地形模块库，用于单独编译地形代码；查看实际效果仍需构建 CrownEditor。"],
  ["TerrainCoreTests", "地形核心自动测试程序；这里只编译，不会执行测试。"],
  ["Core", "引擎基础模块库，提供基础类型、任务和通用设施。"],
  ["Platform", "操作系统与平台适配模块库。"],
  ["AssetCore", "资源系统的核心模块库。"],
  ["WorldCore", "世界与场景数据的基础模块库。"],
  ["RenderCore", "渲染基础设施模块库。"],
  ["Renderer", "渲染器模块库，用于局部编译渲染实现。"],
  ["Rendering", "渲染领域模块库，不是可独立启动的渲染程序。"],
  ["Animation", "动画系统模块库。"],
  ["Physics", "物理系统模块库。"],
  ["AI", "运行时 AI 模块库。"],
  ["PCG", "程序化内容生成模块库。"],
  ["ScriptCore", "脚本系统的基础模块库。"],
  ["Scripting", "脚本集成模块库。"],
  ["Runtime", "引擎运行时模块库。"],
  ["CrownRuntime", "聚合运行时模块的静态库，不是可以直接启动的 Player。"],
  ["CrownEditorCore", "编辑器 C++ 核心库，不包含完整编辑器窗口。"],
  ["CrownEditorAssetPipeline", "编辑期资源导入与 Cook 流程库。"],
  ["CrownEditorAssetServices", "Editor 与项目 Cook 工具共用的资源服务库。"],
  ["CrownProfilerCore", "Profiler 的核心分析库，不包含用户界面。"],
  ["CrownProfilerService", "Profiler 的会话与查询服务库，不包含用户界面。"],
]);

export function targetCategory(target: BuildTarget): TargetCategory {
  if (products.includes(target.name)) return "products";
  if (target.kind === "Test" || probes.has(target.name)) return "validation";
  if (target.outputKind === "StaticLibrary") return "libraries";
  return "tools";
}

export function targetDescription(target: BuildTarget): string {
  const known = descriptions.get(target.name);
  if (known) return known;
  if (target.kind === "Test") return "自动测试或验证辅助目标；这里只编译，不会执行测试。";
  if (target.outputKind === "StaticLibrary") return "开发用模块库，单独编译该目标及依赖，不生成可启动的窗口。";
  return "开发与自动化使用的构建目标；具体用途请查看目标规则文件。";
}

export function targetHint(target: BuildTarget): string {
  if (target.kind === "Test") return "仅构建 · 不执行测试";
  if (target.outputKind === "StaticLibrary") return "静态库 · 不可独立运行";
  return target.canRun ? "可构建并运行" : "仅构建";
}

export function targetWarning(target: BuildTarget): string | undefined {
  if (target.name === "CrownDiagnosticsCrashProbe") return "运行此目标会故意触发崩溃，仅用于诊断验证。";
  return undefined;
}

export function defaultBuildTarget(targets: readonly BuildTarget[]): string {
  return products.find(name => targets.some(target => target.name === name)) ?? targets[0]?.name ?? "";
}

export function initialTargetFilter(targets: readonly BuildTarget[], selected: string): TargetFilter {
  const current = targets.find(target => target.name === selected);
  return current ? targetCategory(current) : targets.some(target => targetCategory(target) === "products") ? "products" : "all";
}

export function groupedTargets(targets: readonly BuildTarget[], filter: TargetFilter, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return targetCategories.filter(category => filter === "all" || filter === category.id).map(category => ({
    ...category,
    targets: targets.filter(target => {
      if (targetCategory(target) !== category.id) return false;
      const searchable = [target.name, target.kind, target.outputKind, target.ruleSource, category.label, targetDescription(target), targetHint(target)].join(" ").toLowerCase();
      return terms.every(term => searchable.includes(term));
    }).sort((a, b) => {
      if (category.id === "products") return products.indexOf(a.name) - products.indexOf(b.name);
      return a.name.localeCompare(b.name, "en");
    }),
  })).filter(category => category.targets.length > 0);
}
