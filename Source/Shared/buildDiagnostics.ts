import type { BuildJobView, ExecutionAction } from "./workbench";

const errorLine = /(?:\bfatal error\b|\berror\s+[A-Z]+\d+\b|\berror:\s|^CBT error:)/i;
const stages: Record<string, string> = { planning: "配置与构建图", "waiting-for-lock": "等待构建锁", preparing: "依赖与工具准备", validating: "输入与缓存校验", building: "编译与链接", publishing: "产物发布", "running-product": "程序运行" };
const kinds: Record<string, string> = { Compile: "编译", Link: "链接", Archive: "归档", Stage: "发布", ResourceCompile: "资源编译" };
export function buildDiagnostic(entry: BuildJobView) {
  if (!["failed", "interrupted", "cancelled"].includes(entry.job.state)) return null;
  const failed = (entry.execution?.graphs ?? []).flatMap(graph => graph.actions.filter(action => action.state === "failed").map(action => ({ target: graph.target, action })))
    .sort((a, b) => (a.action.finishedAt ?? "~").localeCompare(b.action.finishedAt ?? "~"));
  const first = failed[0];
  const runtime = entry.job.command === "run" && entry.result?.outcome === "build-passed" && entry.progress?.phase === "running-product";
  const original = entry.diagnostics?.schemaVersion === 1 ? entry.diagnostics.firstErrors : (entry.log || "").split(/\r?\n/).filter(line => errorLine.test(line));
  const errors = [...new Set(original)].slice(0, 8).map(value => value.slice(0, 2048));
  const match = (entry.log || "").match(/^CBT error: Target '[^']+' exited with code (-?\d+)\./m);
  const productExitCode = runtime ? entry.diagnostics?.productExitCode ?? (match ? Number(match[1]) : null) : null;
  const code = productExitCode ?? entry.job.exitCode;
  const codeText = code == null ? "未记录" : `${code}${code < 0 || code > 65535 ? ` (0x${(code >>> 0).toString(16).toUpperCase().padStart(8, "0")})` : ""}`;
  const kind = first?.action.kind;
  const title = entry.job.state === "cancelled" ? "任务已取消" : entry.job.state === "interrupted" ? "任务执行被中断" : runtime ? productExitCode != null ? "程序异常退出" : "程序启动或运行失败" : kind === "Compile" ? "编译失败" : kind === "Link" ? "链接失败" : "构建流程失败";
  return { title, stage: kind ? kinds[kind] || kind : stages[entry.progress?.phase || ""] || "尚未记录阶段",
    target: first?.target ?? entry.progress?.target ?? entry.job.target, action: first?.action as ExecutionAction | undefined,
    errors, errorSource: entry.diagnostics ? "任务中最早记录的诊断" : "最近 64 KiB 日志中的诊断（历史任务可能缺少开头）",
    code: codeText, codeSource: productExitCode != null ? "程序退出码" : "CBT 退出码", failedCount: failed.length,
    note: runtime ? "编译与产物校验已通过；这不是编译失败。" : entry.job.state === "cancelled" ? "取消不等于编译失败，未完成的动作不视为通过。" : "以下是已观测事实与原始错误摘录，不是自动推断的根因。" };
}

export function formatBuildDiagnostic(entry: BuildJobView): string {
  const diagnosis = buildDiagnostic(entry);
  if (!diagnosis) throw new Error("此任务没有失败、取消或中断诊断。");
  const action = diagnosis.action;
  return ["Crown 构建诊断", `任务：${entry.job.id}`, `目标：${entry.job.target} / ${entry.job.platform} / ${entry.job.configuration}`,
    `工作区：${entry.job.workspace}`, `源码（请求时）：${entry.job.source.branch} · ${entry.job.source.commit} · ${entry.job.source.dirty ? "有未提交修改" : "干净"}`,
    `状态：${diagnosis.title}`, `阶段：${diagnosis.stage}；目标：${diagnosis.target}`, `${diagnosis.codeSource}：${diagnosis.code}`,
    action ? `最早失败动作：${action.module} / ${action.label} (${action.id})；动作退出码：${action.exitCode ?? "未记录"}` : "未记录失败动作。",
    diagnosis.note, `原始诊断（${diagnosis.errorSource}）：`, ...diagnosis.errors,
    entry.job.error || "", `完整日志：${entry.logPath}`, "自动测试与人工验收状态需另行确认。"].join("\n");
}
