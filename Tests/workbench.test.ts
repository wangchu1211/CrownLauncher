import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseProtocol, requestArguments, validateBuildRequest, WorkbenchService } from "../Source/Main/workbenchService";
import { BuildTaskDetails } from "../Source/Renderer/WorkbenchPage";
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
    expect(() => parseProtocol("CBT build ready: artifact=old.exe")).toThrow("structured");
    expect(() => parseProtocol('{"schemaVersion":2}')).toThrow("Unsupported");
  });
  it("validates all build controls against CBT capabilities", () => {
    expect(validateBuildRequest(request, capabilities)).toEqual(request);
    for (const bad of [{ target: "other" }, { configuration: "Release" }, { platform: "Linux" }, { jobs: 0 }, { jobs: 65 }, { jobs: NaN }, { operation: "clean" }, { workspace: "D:/Other" }, { features: { arbitrary: "true" } }, { features: { Tracy: "a; command" } }]) {
      expect(() => validateBuildRequest({ ...request, ...bad }, capabilities)).toThrow();
    }
    expect(() => validateBuildRequest({ ...request, operation: "run" }, { ...capabilities, targets: [{ ...capabilities.targets[0]!, canRun: false }] })).toThrow("cannot be run");
    expect(() => validateBuildRequest(request, { ...capabilities, targets: [{ ...capabilities.targets[0]!, requiredFeatures: ["Tracy"] }] })).toThrow("requires Feature");
  });
  it("passes options as argument elements, never a shell command", () => {
    expect(requestArguments(request)).toEqual(["--configuration", "Shipping", "--platform", "Win64", "--jobs", "4", "--feature", "Tracy=false"]);
  });
  it("keeps build verification distinct from tests and human acceptance", () => {
    const html = renderToStaticMarkup(createElement(BuildTaskDetails, { entry, onCancel: () => {}, onReveal: () => {} }));
    expect(html).toContain("Verified build"); expect(html).toContain("Not run"); expect(html).toContain("Pending"); expect(html).toContain("COMMAND LINE");
    expect(html).not.toContain("Cancel task");
    const running = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: { ...entry, job: { ...entry.job, state: "running" }, progress: { phase: "waiting-for-lock", target: request.target, plannedActions: null, invalidatedActions: null } }, onCancel: () => {}, onReveal: () => {} }));
    expect(running).toContain("Waiting for CBT build lock"); expect(running).toContain("Cancel task");
  });
  it("does not report an interrupted task as a successful build", () => {
    const html = renderToStaticMarkup(createElement(BuildTaskDetails, { entry: { ...entry, result: null, job: { ...entry.job, state: "interrupted", error: "Owner exited" } }, onCancel: () => {}, onReveal: () => {} }));
    expect(html).toContain("Not verified"); expect(html).toContain("Task interrupted"); expect(html).toContain("Owner exited");
  });
  it("rejects control requests before a trusted workspace is connected", async () => {
    const query = vi.fn(); const service = new WorkbenchService(tmpdir(), query);
    await expect(service.start(request)).rejects.toThrow("Connect");
    await expect(service.cancel(request.workspace, "../other")).rejects.toThrow("Invalid task ID");
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
});
