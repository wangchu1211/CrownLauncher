import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { BuildCapabilities, BuildDescription, BuildHistory, BuildJobView, BuildRequest } from "../Shared/workbench";
import { writeFileAtomically } from "./Core/atomicFile";

const executeFile = promisify(execFile);
type Query = (executable: string, args: string[], cwd: string, timeout: number) => Promise<string>;
const execute: Query = async (executable, args, cwd, timeout) => {
  try { return (await executeFile(executable, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" })).stdout; }
  catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error([failure.stderr, failure.stdout, failure.message].filter(Boolean).join("\n").slice(-16000));
  }
};

export function parseProtocol<T>(output: string): T {
  let value: unknown;
  try { value = JSON.parse(output.replace(/^\uFEFF/, "")); } catch { throw new Error("CBT 未返回结构化工作台数据。请更新此工作区的 CBT，然后重新连接。\n" + output.slice(-2000)); }
  if (!value || typeof value !== "object" || (value as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new Error("不支持此 CBT 工作台数据格式，请更新 Launcher 和 CBT 后重新连接。");
  }
  return value as T;
}

export function validateBuildRequest(input: unknown, capabilities: BuildCapabilities): BuildRequest {
  const request = input as Partial<BuildRequest> | null;
  if (!request || request.workspace !== capabilities.workspace || typeof request.target !== "string" ||
    !capabilities.targets.some(target => target.name === request.target) ||
    typeof request.configuration !== "string" || !capabilities.configurations.includes(request.configuration) ||
    typeof request.platform !== "string" || !capabilities.platforms.includes(request.platform) ||
    !Number.isInteger(request.jobs) || request.jobs! < 1 || request.jobs! > 64 ||
    (request.operation !== "build" && request.operation !== "run")) { throw new Error("请选择支持的工作区、构建目标、配置和平台，并将并行任务数设为 1–64。"); }
  if (request.operation === "run" && !capabilities.targets.find(target => target.name === request.target)?.canRun) { throw new Error("此构建目标不支持运行。"); }
  if (!request.features || typeof request.features !== "object" || Array.isArray(request.features)) { throw new Error("功能开关选项无效。"); }
  for (const [name, value] of Object.entries(request.features)) {
    if (!capabilities.features.some(feature => feature.name === name) || (value !== "true" && value !== "false")) { throw new Error("不支持的功能开关选项：" + name); }
  }
  for (const name of capabilities.targets.find(target => target.name === request.target)!.requiredFeatures) {
    const value = request.features[name] ?? capabilities.features.find(feature => feature.name === name)?.defaultValue;
    if (value !== "true") { throw new Error(request.target + " 需要启用功能开关 " + name + "。"); }
  }
  return request as BuildRequest;
}

export function requestArguments(request: BuildRequest): string[] {
  return ["--configuration", request.configuration, "--platform", request.platform, "--jobs", String(request.jobs),
    ...Object.entries(request.features).sort(([left], [right]) => left.localeCompare(right)).flatMap(([name, value]) => ["--feature", `${name}=${value}`])];
}

export class WorkbenchService {
  private connections = new Map<string, BuildCapabilities>();
  private connecting = new Map<string, Promise<BuildCapabilities>>();
  constructor(private readonly configDirectory: string, private readonly query: Query = execute) {}

  async workspaces(): Promise<string[]> {
    try {
      const value = JSON.parse(await readFile(path.join(this.configDirectory, "workbench.json"), "utf8")) as { schemaVersion?: number; workspaces?: unknown };
      return value.schemaVersion === 1 && Array.isArray(value.workspaces) ? value.workspaces.filter((item): item is string => typeof item === "string" && path.isAbsolute(item)).slice(0, 12) : [];
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }

  async connect(input: string): Promise<BuildCapabilities> {
    if (!path.isAbsolute(input)) throw new Error("请选择 CrownEngine 源码工作区的绝对路径。");
    const root = await realpath(input);
    const pending = this.connecting.get(root);
    if (pending) return pending;
    const connection = this.connectWorkspace(root);
    this.connecting.set(root, connection);
    try { return await connection; } finally { this.connecting.delete(root); }
  }

  private async connectWorkspace(root: string): Promise<BuildCapabilities> {
    for (const file of ["CrownBuild.ps1", "global.json", "Engine/Build/CBT/CrownBuild.Tool/CrownBuild.Tool.csproj"]) {
      if (!(await stat(path.join(root, file))).isFile()) throw new Error("此目录不是 CrownEngine 源码工作区：" + root);
    }
    const shell = path.join(process.env.SystemRoot || "C:/Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const response = await this.query(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(root, "CrownBuild.ps1"), "workbench", "capabilities"], root, 120000);
    const capabilities = parseProtocol<BuildCapabilities>(response);
    if (typeof capabilities.workspace !== "string" || await realpath(capabilities.workspace) !== root ||
      !Array.isArray(capabilities.targets) || !Array.isArray(capabilities.features) ||
      !Array.isArray(capabilities.configurations) || !Array.isArray(capabilities.platforms)) { throw new Error("CBT 返回的构建能力信息无效。"); }
    const runtime = capabilities.runtime?.assembly;
    if (typeof runtime !== "string" || !path.isAbsolute(runtime)) throw new Error("CBT 未提供固定版本的工具运行时。");
    const relative = path.relative(root, await realpath(runtime)).replaceAll("\\", "/");
    if (!/^Build\/CBT\/HostRuntime\/[a-f0-9]{64}\/CrownBuild\.Tool\.dll$/.test(relative)) throw new Error("CBT 运行时不在此工作区的固定版本工具存储目录内。");
    capabilities.workspace = root;
    this.connections.set(root, capabilities);
    const known = await this.workspaces();
    await writeFileAtomically(path.join(this.configDirectory, "workbench.json"), JSON.stringify({ schemaVersion: 1, workspaces: [root, ...known.filter(item => item !== root)].slice(0, 12) }, null, 2) + "\n");
    return capabilities;
  }

  private connection(workspace: string): BuildCapabilities {
    const value = this.connections.get(workspace);
    if (!value) throw new Error("请先连接此工作区，尚未启动任何命令。");
    return value;
  }

  private async command<T>(workspace: string, args: string[], timeout = 15000): Promise<T> {
    const capabilities = this.connection(workspace);
    return parseProtocol<T>(await this.query("dotnet", [capabilities.runtime.assembly, "workbench", ...args, "--root", workspace], workspace, timeout));
  }

  async describe(input: unknown): Promise<BuildDescription> {
    const request = this.request(input);
    return this.command(request.workspace, ["describe", request.target, ...requestArguments(request)], 45000);
  }
  async start(input: unknown): Promise<{ schemaVersion: 1; jobId: string }> {
    const request = this.request(input);
    // WHY: queries pin the connected runtime, but a build must bootstrap current
    // CBT/rules after source edits. Keep this public-entry boundary until CBT has
    // an equivalent validated runtime-refresh API; never build with stale rules.
    const shell = path.join(process.env.SystemRoot || "C:/Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return parseProtocol(await this.query(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(request.workspace, "CrownBuild.ps1"),
      "workbench", "start", request.target, "--origin", "launcher", "--operation", request.operation, ...requestArguments(request)], request.workspace, 120000));
  }
  private request(input: unknown): BuildRequest {
    const workspace = (input as Partial<BuildRequest> | null)?.workspace;
    if (typeof workspace !== "string") throw new Error("工作区无效。");
    return validateBuildRequest(input, this.connection(workspace));
  }
  async history(workspace: string): Promise<BuildHistory> {
    const history = await this.command<{ schemaVersion: 1; jobs: (BuildJobView | { id: string; state: "unreadable"; error: string })[] }>(workspace, ["history"]);
    const jobs: BuildJobView[] = []; const warnings: string[] = [];
    for (const item of history.jobs) { if ("job" in item) jobs.push(item); else warnings.push(`${item.id}: ${item.error}`); }
    return { schemaVersion: 1, jobs, warnings };
  }
  private jobId(id: string): string {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("任务 ID 无效。");
    return id;
  }
  async job(workspace: string, id: string): Promise<BuildJobView> { return this.command(workspace, ["job", "--job-id", this.jobId(id)]); }
  async cancel(workspace: string, id: string): Promise<void> { await this.command(workspace, ["cancel", "--job-id", this.jobId(id)]); }
  async revealPath(workspace: string, id: string, item: "log" | "artifact"): Promise<string> {
    const entry = await this.job(workspace, id);
    const target = item === "log" ? path.join(workspace, "Build/CBT/Workbench/Jobs", id, "output.log")
      : entry.result ? path.resolve(workspace, entry.result.artifact) : null;
    if (!target) throw new Error("此任务没有经过验证的构建产物。");
    const resolved = await realpath(target);
    const buildRoot = await realpath(path.join(workspace, "Build/CBT"));
    const relative = path.relative(buildRoot, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("任务输出不在 CBT 输出目录内。");
    return resolved;
  }
}
