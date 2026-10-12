import type { BuildJobView } from "../Shared/workbench";

export const buildStates: Record<BuildJobView["job"]["state"], string> = {
  queued: "排队中", running: "进行中", succeeded: "已完成",
  failed: "失败", cancelled: "已取消", interrupted: "已中断",
};

export const buildOrigins: Record<BuildJobView["job"]["origin"], string> = { cli: "命令行", launcher: "Launcher" };

export const buildPhases: Record<string, string> = {
  planning: "正在解析构建图", "waiting-for-lock": "等待 CBT 构建锁",
  preparing: "正在准备依赖和工具", validating: "正在校验输入与缓存",
  building: "正在编译和链接", publishing: "正在校验并发布产物", "running-product": "程序运行中",
};

// Translate known presentation text only. New CBT descriptions and diagnostics
// remain intact, as do protocol values, target names and raw compiler output.
const descriptions: Record<string, string> = {
  "Managed C# scripting and runtime deployment": "C# 脚本与运行时部署",
  "FidelityFX rendering integration and runtime payload": "FidelityFX 渲染集成与运行时文件",
  "Qt Editor targets and UI integration": "Qt Editor 构建目标与界面集成",
  "Native profiling instrumentation": "原生代码性能分析埋点",
};

const diagnostics: Record<string, string> = {
  "Cancelled by request.": "已按请求取消任务。",
  "CBT failed. See the task log for diagnostics.": "CBT 执行失败，请查看任务日志了解详情。",
  "Task owner is no longer running; no successful completion was recorded.": "任务进程已退出，未记录到成功完成的结果。",
};

export function featureDescription(value: string): string { return descriptions[value] ?? value; }
export function taskDiagnostic(value: string): string { return diagnostics[value] ?? value; }
