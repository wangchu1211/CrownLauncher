import { expect, it } from "vitest";
import { buildDiagnostic, formatBuildDiagnostic } from "../Source/Shared/buildDiagnostics";
import type { BuildJobView, ExecutionAction } from "../Source/Shared/workbench";

function fixture(): BuildJobView {
  return { schemaVersion: 1, job: { id: "a".repeat(32), workspace: "D:/源码", target: "Editor", platform: "Win64", configuration: "Shipping", features: {}, jobs: 4,
    command: "build", state: "failed", origin: "launcher", source: { branch: "main", commit: "abc", dirty: true, workingTree: "M file.cpp" }, createdAt: "", startedAt: null, finishedAt: null, heartbeatAt: null, exitCode: 1, error: "CBT failed. See the task log for diagnostics." }, cancellationRequested: false,
    progress: { phase: "building", target: "Editor", plannedActions: null, invalidatedActions: null }, result: null, validation: "not-run", manualAcceptance: "pending", log: "a long log without its beginning", logPath: "D:/源码/Build/log" };
}
it("uses persistent first errors and the earliest failed action, not blocked descendants", () => {
  const entry = fixture();
  entry.diagnostics = { schemaVersion: 1, firstErrors: ["源.cpp(2): error C2065: unknown symbol"], productExitCode: null };
  const action = (id: string, state: string, kind = "Compile") => ({ id, state, kind, module: "Core", label: "源.cpp", finishedAt: "2026-10-13T00:00:00Z", exitCode: 2 }) as ExecutionAction;
  entry.execution = { schemaVersion: 1, warnings: [], graphs: [{ id: "g", target: "Worker", fingerprint: "", createdAt: "", modules: [], actions: [action("blocked", "blocked", "Link"), action("compile", "failed")] }] };
  const value = buildDiagnostic(entry)!;
  expect(value.title).toBe("编译失败"); expect(value.action?.id).toBe("compile"); expect(value.target).toBe("Worker"); expect(value.errors[0]).toContain("C2065");
  const text = formatBuildDiagnostic(entry);
  for (const part of ["D:/源码", "有未提交修改", "C2065", "动作退出码：2", "完整日志"]) expect(text).toContain(part);
  expect(text).not.toContain("编译与产物校验已通过");
});
it("keeps runtime access violations, unknown launch failures and cancellations distinct", () => {
  const entry = fixture(); entry.job.command = "run"; entry.progress!.phase = "running-product";
  entry.result = { outcome: "build-passed", artifact: "editor.exe", buildGraphFingerprint: "g", actionGraphFingerprint: "a" };
  entry.log = "CBT error: Target 'Editor' exited with code -1073741819.";
  const value = buildDiagnostic(entry)!;
  expect(value.title).toBe("程序异常退出"); expect(value.code).toBe("-1073741819 (0xC0000005)"); expect(value.note).toContain("这不是编译失败");
  entry.log = "process start failed"; expect(buildDiagnostic(entry)!.title).toBe("程序启动或运行失败");
  entry.job.state = "cancelled"; expect(buildDiagnostic(entry)!.title).toBe("任务已取消");
  entry.job.state = "interrupted"; expect(buildDiagnostic(entry)!.title).toBe("任务执行被中断");
  entry.job.state = "succeeded"; expect(buildDiagnostic(entry)).toBeNull();
});
it("labels the legacy tail fallback honestly and never turns text into success/failure state", () => {
  const entry = fixture(); entry.log = "0 errors\nfile.cpp: error: actual failure\nwarning: harmless";
  expect(buildDiagnostic(entry)!.errors).toEqual(["file.cpp: error: actual failure"]);
  expect(buildDiagnostic(entry)!.errorSource).toContain("最近 64 KiB");
  entry.job.state = "running"; expect(buildDiagnostic(entry)).toBeNull();
  entry.job.state = "succeeded"; expect(() => formatBuildDiagnostic(entry)).toThrow();
});
