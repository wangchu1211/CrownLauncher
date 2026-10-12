import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseProtocol, requestArguments, validateBuildRequest, WorkbenchService } from "../Source/Main/workbenchService";
import { BuildTaskDetails, WorkbenchPage } from "../Source/Renderer/WorkbenchPage";
import { buildPhases, buildStates, featureDescription, taskDiagnostic } from "../Source/Renderer/workbenchLabels";
import type { BuildCapabilities, BuildJobView, BuildRequest } from "../Source/Shared/workbench";

const capabilities: BuildCapabilities = {
  schemaVersion: 1, workspace: "D:/CrownEngine", configurations: ["Debug", "Development", "Shipping"], platforms: ["Win64"],
  features: [{ name: "Tracy", description: "Profiling", defaultValue: "true" }],
  targets: [{ name: "CrownBuildProbe", kind: "Program", outputKind: "Executable", ruleSource: "Probe.Target.cs", canRun: true, requiredFeatures: [] }],
  source: { branch: "main", commit: "abcdef00", dirty: false, workingTree: "" }, runtime: { dotnet: "dotnet", assembly: "" },
};
const request: BuildRequest = { workspace: capabilities.workspace, target: "CrownBuildProbe", configuration: "Shipping", platform: "Win64", features: { Tracy: "false" }, jobs: 4, operation: "build" };
const entry: BuildJobView = {
  schemaVersion: 1, job: { id: "a".repeat(32), workspace: request.workspace, target: request.target, command: "build", configuration: "Shipping", platform: "Win64", features: request.features, jobs: 4, origin: "cli", source: capabilities.source,
    state: "succeeded", createdAt: "2026-10-12T00:00:00Z", startedAt: "2026-10-12T00:00:00Z", finishedAt: "2026-10-12T00:00:01Z", heartbeatAt: null, exitCode: 0, error: null },
  cancellationRequested: false, progress: null, result: { outcome: "build-passed", artifact: "Build/CBT/probe.exe", buildGraphFingerprint: "graph", actionGraphFingerprint: "actions" }, validation: "not-run", manualAcceptance: "pending", log: "Done", logPath: "Build/CBT/log",
};
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("workbench contracts", () => {
  it("requires versioned JSON instead of interpreting a successful-looking log", () => {
    expect(parseProtocol('{"schemaVersion":1,"ok":true}')).toEqual({ schemaVersion: 1, ok: true });
    expect(() => parseProtocol("CBT build ready: artifact=old.exe")).toThrow("结构化");
    expect(() => parseProtocol('{"schemaVersion":2}')).toThrow("不支持");
  });
  it("validates all build controls against CBT capabilities", () => {
    expect(validateBuildRequest(request, capabilities)).toEqual(request);
    for (const bad of [{ target: "other" }, { configuration: "Release" }, { platform: "Linux" }, { jobs: 0 }, { jobs: 65 }, { jobs: NaN }, { operation: "clean" }, { workspace: "D:/Other" }, { features: { arbitrary: "true" } }, { features: { Tracy: "a; command" } }]) {
      expect(() => validateBuildRequest({ ...request, ...bad }, capabilities)).toThrow();
    }
    expect(() => validateBuildRequest({ ...request, operation: "run" }, { ...capabilities, targets: [{ ...capabilities.targets[0]!, canRun: false }] })).toThrow("不支持运行");
    expect(() => validateBuildRequest(request, { ...capabilities, targets: [{ ...capabilities.targets[0]!, requiredFeatures: ["Tracy"] }] })).toThrow("需要启用功能开关 Tracy");
  });
  it("passes options as argument elements, never a shell command", () => {
    expect(requestArguments(request)).toEqual(["--configuration", "Shipping", "--platform", "Win64", "--jobs", "4", "--feature", "Tracy=false"]);
  });
  it("keeps build verification distinct from tests and human acceptance", () => {
    const html = renderToStaticMarkup(createElement(BuildTaskDetails, { entry, onCancel: () => {}, onReveal: () => {} }));
    expect(html).toContain("构建已验证"); expect(html).toContain("未运行"); expect(html).toContain("待验收"); expect(html).toContain("命令行");
    expect(html).not.toContain("取消任务");
    const running = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: { ...entry, job: { ...entry.job, state: "running" }, progress: { phase: "waiting-for-lock", target: request.target, plannedActions: null, invalidatedActions: null } }, onCancel: () => {}, onReveal: () => {} }));
    expect(running).toContain("等待 CBT 构建锁"); expect(running).toContain("取消任务");
  });
  it("does not report an interrupted task as a successful build", () => {
    const html = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: { ...entry, result: null, job: { ...entry.job, state: "interrupted", error: "Owner exited" } }, onCancel: () => {}, onReveal: () => {} }));
    expect(html).toContain("未验证"); expect(html).toContain("任务已中断"); expect(html).toContain("Owner exited");
  });
  it("rejects control requests before a trusted workspace is connected", async () => {
    const query = vi.fn(); const service = new WorkbenchService(tmpdir(), query);
    await expect(service.start(request)).rejects.toThrow("请先连接");
    await expect(service.cancel(request.workspace, "../other")).rejects.toThrow("任务 ID 无效");
    expect(query).not.toHaveBeenCalled();
  });
  it("connects through the public bootstrap and uses only its immutable runtime for queries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "crown-workbench-")); roots.push(root);
    const assembly = path.join(root, "Build/CBT/HostRuntime", "a".repeat(64), "CrownBuild.Tool.dll");
    for (const file of ["CrownBuild.ps1", "global.json", "Engine/Build/CBT/CrownBuild.Tool/CrownBuild.Tool.csproj", path.relative(root, assembly)]) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), "fixture");
    }
    const query = vi.fn(async (_executable: string, args: string[]) => args.includes("capabilities")
      ? JSON.stringify({ ...capabilities, workspace: root, runtime: { dotnet: "dotnet", assembly } })
      : JSON.stringify({ schemaVersion: 1, jobs: [] }));
    const service = new WorkbenchService(path.join(root, "settings"), query);
    await service.connect(root); expect(await service.workspaces()).toEqual([root]);
    expect(await service.history(root)).toEqual({ schemaVersion: 1, jobs: [], warnings: [] });
    expect(query.mock.calls[1]![0]).toBe("dotnet");
    expect(query.mock.calls[1]![1][0]).toBe(assembly);
    await service.start({ ...request, workspace: root });
    expect(query.mock.calls[2]![0]).toContain("powershell.exe");
    expect(query.mock.calls[2]![1]).toContain(path.join(root, "CrownBuild.ps1"));
    expect(query.mock.calls[2]![1]).toContain("start");
  });

  it("renders Chinese workspace guidance and an accessible source path without starting a build", () => {
    const html = renderToStaticMarkup(createElement(WorkbenchPage));
    expect(html).toContain('lang="zh-CN"');
    for (const text of ["构建工作台", 'aria-label="源码工作区"', "连接源码工作区", "CrownBuild.ps1", "不会构建引擎或运行 Standard", "浏览", "连接"]) expect(html).toContain(text);
    const empty = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: null, onCancel: () => {}, onReveal: () => {} }));
    expect(empty).toContain("尚未选择构建任务");
    expect(empty).toContain("CLI");
  });

  it.each(Object.entries(buildStates))("localizes the %s status without changing its protocol or CSS value", (state, label) => {
    const html = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: { ...entry, job: { ...entry.job, state: state as BuildJobView["job"]["state"] } }, onCancel: () => {}, onReveal: () => {} }));
    expect(html).toContain(`class="build-status ${state}">${label}`);
    expect(html).toContain("CrownBuildProbe"); expect(html).toContain("Win64 / Shipping"); expect(html).toContain("Tracy=false");
  });

  it.each(Object.entries(buildPhases))("localizes the %s build phase", (phase, label) => {
    const html = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: { ...entry, job: { ...entry.job, state: "running" }, progress: { phase, target: request.target, plannedActions: 10, invalidatedActions: 2 } }, onCancel: () => {}, onReveal: () => {} }));
    expect(html).toContain(label);
    expect(html).toContain("计划执行 10 项操作"); expect(html).toContain("2 项缓存凭据失效"); expect(html).toContain("不代表完成百分比");
    if (phase === "running-product") expect(html).toContain("取消任务也会停止本任务启动的程序");
  });

  it("translates known help and diagnostics while preserving unknown messages and raw output", () => {
    expect(featureDescription("Managed C# scripting and runtime deployment")).toBe("C# 脚本与运行时部署");
    expect(featureDescription("Future feature description")).toBe("Future feature description");
    expect(taskDiagnostic("New compiler error: file.cpp:42")).toBe("New compiler error: file.cpp:42");
    const log = "Cancelled by request.\nerror C1234: D:/源码/Test.cpp";
    const html = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: { ...entry, result: null, log, job: { ...entry.job, state: "cancelled", error: "Cancelled by request." } }, onCancel: () => {}, onReveal: () => {} }));
    expect(html).toContain("已按请求取消任务。"); expect(html).toContain(log);
    expect(html).toContain('title="Cancelled by request."');
  });

  it("renders cancellation and Build & Run provenance in Chinese", () => {
    const html = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: { ...entry, cancellationRequested: true, log: null, job: { ...entry.job, state: "running", command: "run", source: { ...entry.job.source, dirty: true } } }, onCancel: () => {}, onReveal: () => {} }));
    for (const text of ["构建并运行", "正在取消…", "有未提交的修改", "任务记录与来源", "等待 CBT 输出…", "未保存为可复现的固定快照"]) expect(html).toContain(text);
    expect(html).toMatch(/disabled=""[^>]*>正在取消…/);
  });
});
