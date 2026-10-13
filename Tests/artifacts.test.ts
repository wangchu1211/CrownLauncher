import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { WorkbenchService } from "../Source/Main/workbenchService";
import { artifactBytes, buildDuration } from "../Source/Renderer/BuildArtifacts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "crown-artifact-"))); roots.push(root);
  const assembly = path.join(root, "Build/CBT/HostRuntime", "a".repeat(64), "CrownBuild.Tool.dll");
  const artifact = "Build/CBT/Artifacts/Ninja/Win64/Shipping/Editor/editor.exe";
  for (const file of ["CrownBuild.ps1", "global.json", "Engine/Build/CBT/CrownBuild.Tool/CrownBuild.Tool.csproj", path.relative(root, assembly), artifact]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), "test");
  }
  const project = path.join(root, "项目 with spaces");
  await mkdir(path.join(project, "Assets"), { recursive: true });
  await writeFile(path.join(project, "Sample.crownproject"), JSON.stringify({ schemaVersion: 1, projectId: "8513eac9-1f78-45a9-a1db-8740cd7b3044", displayName: "Sample" }));
  const capabilities = { schemaVersion: 1, workspace: root, targets: [{ name: "Editor", canRun: true, runRequiresProject: true, runWorkingDirectory: "RepositoryRoot" }], features: [], configurations: [], platforms: [], runtime: { assembly } };
  const entry = { schemaVersion: 1, job: { id: "b".repeat(32), target: "Editor", state: "failed" }, result: { outcome: "build-passed", artifact }, timing: { buildCompletedAt: "2026-10-13T00:00:00Z", buildDurationMs: 12500 } };
  const query = vi.fn(async (_exe: string, args: string[]) => JSON.stringify(args.includes("capabilities") ? capabilities : entry));
  const launch = vi.fn(async () => 12345);
  const service = new WorkbenchService(path.join(root, "settings"), query, launch);
  await service.connect(root);
  return { root, service, entry, query, launch, capabilities, project, executable: path.join(root, artifact) };
}
it("measures current artifact directory on demand without including build caches or following junctions", async () => {
  const f = await fixture();
  await writeFile(path.join(path.dirname(f.executable), "runtime.dll"), "123456");
  const cache = path.join(f.root, "Build/CBT/Cache"); await mkdir(cache); await writeFile(path.join(cache, "large.obj"), "x".repeat(10000));
  await symlink(cache, path.join(path.dirname(f.executable), "linked-cache"), "junction");
  const info = await f.service.artifact(f.root, f.entry.job.id);
  expect(info.bytes).toBe(10); expect(info.executableBytes).toBe(4);
  expect(info.buildDurationMs).toBe(12500); expect(info.buildCompletedAt).toBe(f.entry.timing.buildCompletedAt);
  expect(info.canRun).toBe(true);
  expect(f.launch).not.toHaveBeenCalled();
});
it("direct run uses the recorded artifact and typed project, never starts a build or rewrites its failed run record", async () => {
  const f = await fixture();
  await expect(f.service.launchArtifact(f.root, f.entry.job.id)).rejects.toThrow("选择运行项目");
  await expect(f.service.launchArtifact(f.root, f.entry.job.id, path.join(f.root, "missing"))).rejects.toThrow("运行项目不可用");
  expect(f.launch).not.toHaveBeenCalled();
  expect(await f.service.launchArtifact(f.root, f.entry.job.id, f.project)).toEqual({ processId: 12345 });
  expect(f.launch).toHaveBeenCalledWith(f.executable, ["--project", f.project], f.root);
  expect(f.query.mock.calls.every(([, args]) => !args.includes("start"))).toBe(true);
  expect(f.entry.job.state).toBe("failed");
});
it("rejects missing/unverified/out-of-root artifacts, active tasks, tests and unknown launch contracts", async () => {
  const f = await fixture();
  f.entry.result.artifact = "CrownBuild.ps1";
  await expect(f.service.artifact(f.root, f.entry.job.id)).rejects.toThrow("CBT 产物目录");
  f.entry.result.artifact = path.relative(f.root, f.executable);
  f.entry.result.outcome = "failed";
  await expect(f.service.launchArtifact(f.root, f.entry.job.id, f.project)).rejects.toThrow("经过验证");
  f.entry.result.outcome = "build-passed"; f.entry.job.state = "running";
  await expect(f.service.launchArtifact(f.root, f.entry.job.id, f.project)).rejects.toThrow("任务结束");
  f.entry.job.state = "succeeded"; f.capabilities.targets[0]!.canRun = false; await f.service.connect(f.root);
  await expect(f.service.launchArtifact(f.root, f.entry.job.id, f.project)).rejects.toThrow("不支持直接运行");
  f.capabilities.targets[0]!.canRun = true; f.capabilities.targets[0]!.runWorkingDirectory = "unknown"; await f.service.connect(f.root);
  await expect(f.service.launchArtifact(f.root, f.entry.job.id, f.project)).rejects.toThrow("更新 CBT");
  expect(f.launch).not.toHaveBeenCalled();
  await rm(f.executable);
  await expect(f.service.artifact(f.root, f.entry.job.id)).rejects.toThrow();
});
it("formats logical bytes and honest historic build timing", () => {
  expect(artifactBytes(1024 ** 3)).toBe("1.00 GiB"); expect(artifactBytes(42)).toBe("42 B");
  expect(buildDuration(125000)).toBe("2 分 5 秒"); expect(buildDuration(null)).toBe("历史任务未记录");
});
