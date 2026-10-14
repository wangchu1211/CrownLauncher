// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { App } from "../Source/Renderer/App";
import type { LauncherSnapshot, Result } from "../Source/Shared/contracts";
import type { BuildCapabilities, BuildHistory, BuildJobView, BuildRequest } from "../Source/Shared/workbench";

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const workspace = "D:/CrownEngine";
const capabilities: BuildCapabilities = {
  schemaVersion: 1, workspace, configurations: ["Shipping", "Development"], platforms: ["Win64"],
  features: [{ name: "WithTerrain", description: "Terrain", defaultValue: "true" }],
  targets: [{ name: "CrownEditor", kind: "Editor", outputKind: "Executable", ruleSource: "", canRun: true, requiredFeatures: [] }],
  source: { branch: "main", commit: "abc", dirty: false, workingTree: workspace },
  runtime: { dotnet: "dotnet", assembly: "CBT.dll" },
};
function job(id: string): BuildJobView {
  return {
    schemaVersion: 1,
    job: { id, workspace, target: "CrownEditor", command: "build", configuration: "Shipping", platform: "Win64", features: {}, jobs: 4, origin: "launcher", source: capabilities.source,
      state: "running", createdAt: "2026-10-14T10:00:00Z", startedAt: "2026-10-14T10:00:00Z", finishedAt: null, heartbeatAt: null, exitCode: null, error: null },
    cancellationRequested: false, progress: null, result: null, validation: "not-run", manualAcceptance: "pending", log: "cached log", logPath: "build.log",
    execution: { schemaVersion: 1, warnings: [], graphs: [{ id: `graph-${id}`, target: "CrownEditor", fingerprint: "fixed", createdAt: "",
      modules: [{ id: "Core", name: "Core", kind: "module", dependencies: [] }],
      actions: [{ id: "compile:Core", module: "Core", kind: "Compile", label: "Core.cpp", dependencies: [], state: "running", needsBuild: true, startedAt: null, finishedAt: null, exitCode: null }],
    }] },
  };
}
const snapshot: LauncherSnapshot = {
  projects: [], templates: [], samples: [],
  editor: { ready: true, executable: "Editor.exe", version: "Current", error: "" },
  settings: { defaultProjectDirectory: "D:/Projects", editorExecutable: "" },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
let host: HTMLDivElement, root: Root, style: HTMLStyleElement;
let entries: BuildJobView[];
let api: ReturnType<typeof mockWorkbench>;
function mockWorkbench() {
  return {
    getWorkspaces: vi.fn(async () => ok([workspace])),
    connect: vi.fn(async (root: string) => ok({ ...capabilities, workspace: root })),
    describe: vi.fn(async (_request: BuildRequest) => ok({ modules: [] })),
    history: vi.fn(async (): Promise<Result<BuildHistory>> => ok({ schemaVersion: 1, jobs: entries, warnings: [] })),
    job: vi.fn(async (_workspace: string, id: string) => ok(entries.find(entry => entry.job.id === id)!)),
    chooseWorkspace: vi.fn(async () => ok("D:/SecondEngine")),
    start: vi.fn(), cancel: vi.fn(),
  };
}
const query = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
const navigate = async (label: string) => { await act(() => query<HTMLButtonElement>(`.nav-top [aria-label="${label}"]`).click()); };
const click = async (selector: string) => { await act(() => query<HTMLButtonElement>(selector).click()); };
const advance = async (ms: number) => { await act(() => vi.advanceTimersByTimeAsync(ms)); };
async function change(selector: string, value: string) {
  await act(() => {
    const element = query<HTMLInputElement | HTMLSelectElement>(selector);
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
  });
}
const transform = () => query(".execution-surface").style.transform;

beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  entries = [job("newest"), job("older")]; api = mockWorkbench();
  vi.stubGlobal("crownHost", { workbench: api,
    launcher: { getSnapshot: vi.fn(async () => ok(snapshot)) },
    window: { isMaximized: async () => false, onMaximizedChanged: () => () => {} },
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  style = document.createElement("style"); style.textContent = readFileSync("Source/Renderer/styles.css", "utf8"); document.head.append(style);
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove(); style.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it("mounts Build on first visit and retains form, task, tab, canvas and scroll state across navigation", async () => {
  await act(() => root.render(createElement(App)));
  const projects = query(".projects-layout"), list = query(".project-list");
  list.scrollTop = 63;
  expect(query("#page-build")).toBeNull();
  await navigate("示例");
  const samples = query(".samples-page");
  expect(api.getWorkspaces).not.toHaveBeenCalled();
  await navigate("构建"); await advance(300);
  expect(api.connect).toHaveBeenCalledTimes(1);
  await click(".build-history-item:nth-of-type(2)");
  await change("#build-configuration", "Development");
  await change("#build-jobs", "7");
  await click(".build-feature input");
  await advance(300);
  expect(api.describe.mock.calls.at(-1)?.[0]).toMatchObject({ configuration: "Development", jobs: 7, features: { WithTerrain: "false" } });
  await click('[aria-label="放大构建图"]');
  const viewport = query(".execution-viewport");
  await act(() => viewport.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })));
  await click(".execution-node");
  await change('[aria-label="搜索模块子任务"]', "Core");
  await click(".execution-panel-heading button");
  const priorTransform = transform(), canvas = query(".execution-surface");
  const describes = api.describe.mock.calls.length;
  await navigate("项目");
  expect(query(".projects-layout")).toBe(projects);
  expect(list.scrollTop).toBe(63);
  expect(query("#page-build").hidden).toBe(true);
  expect(query("#page-build").hasAttribute("inert")).toBe(true);
  expect(getComputedStyle(query("#page-build")).display).toBe("none");
  const polls = api.history.mock.calls.length;
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  await advance(5000);
  expect(api.history).toHaveBeenCalledTimes(polls);
  expect(api.cancel).not.toHaveBeenCalled();
  await navigate("示例"); expect(query(".samples-page")).toBe(samples);
  await navigate("构建");
  expect(api.getWorkspaces).toHaveBeenCalledTimes(1);
  expect(api.connect).toHaveBeenCalledTimes(1);
  expect(api.describe).toHaveBeenCalledTimes(describes);
  expect(api.history.mock.calls.length).toBeGreaterThan(polls);
  expect(query<HTMLSelectElement>("#build-configuration").value).toBe("Development");
  expect(query<HTMLInputElement>("#build-jobs").value).toBe("7");
  expect(query<HTMLInputElement>(".build-feature input").checked).toBe(false);
  expect(query(".build-history-item.selected")).toBe(query(".build-history-item:nth-of-type(2)"));
  expect(query(".execution-surface")).toBe(canvas);
  expect(transform()).toBe(priorTransform);
  expect(query<HTMLInputElement>('[aria-label="搜索模块子任务"]').value).toBe("Core");
  expect(query(".execution-panel").classList.contains("expanded")).toBe(true);
  await click("#build-tab-log");
  const log = query(".build-log"); log.scrollTop = 24;
  await navigate("项目"); await navigate("构建");
  expect(query("#build-tab-log").getAttribute("aria-selected")).toBe("true");
  expect(query(".build-log")).toBe(log); expect(log.scrollTop).toBe(24);
  expect(api.start).not.toHaveBeenCalled();
});

it("ignores late hidden-page polls and shows the cached view while refreshing on return", async () => {
  await act(() => root.render(createElement(App)));
  await navigate("构建"); await advance(300);
  const lateHistory = deferred<Result<BuildHistory>>();
  api.history.mockReturnValueOnce(lateHistory.promise);
  await advance(1500);
  const details = api.job.mock.calls.length;
  await navigate("项目");
  await act(async () => lateHistory.resolve(ok({ schemaVersion: 1, jobs: entries, warnings: ["stale warning"] })));
  expect(api.job).toHaveBeenCalledTimes(details);
  expect(host.textContent).not.toContain("stale warning");
  const freshDetail = deferred<Result<BuildJobView>>();
  api.job.mockReturnValueOnce(freshDetail.promise);
  await navigate("构建");
  expect(query(".build-log").textContent).toBe("cached log");
  expect(query(".build-welcome")).toBeNull();
  const current = entries[0]!;
  await act(async () => freshDetail.resolve(ok({ ...current, log: "new live log", job: { ...current.job, state: "succeeded" } })));
  expect(query(".build-log").textContent).toBe("new live log");
  expect(query(".build-phase").textContent).toContain("任务已完成");
  const lateDetail = deferred<Result<BuildJobView>>();
  api.job.mockReturnValueOnce(lateDetail.promise); await advance(1500); await navigate("项目");
  await act(async () => lateDetail.resolve(ok({ ...current, log: "obsolete detail" })));
  expect(query(".build-log").textContent).toBe("new live log");
  expect(api.connect).toHaveBeenCalledTimes(1);
});

it("preserves an in-flight first connection but still reinitializes on explicit reconnect or workspace change", async () => {
  const connection = deferred<Result<BuildCapabilities>>();
  api.connect.mockReturnValueOnce(connection.promise);
  await act(() => root.render(createElement(App)));
  await navigate("构建"); await navigate("项目");
  await act(async () => connection.resolve(ok(capabilities)));
  expect(api.history).not.toHaveBeenCalled();
  await navigate("构建"); await advance(300);
  expect(api.connect).toHaveBeenCalledTimes(1);
  await change("#build-configuration", "Development"); await advance(300);
  await click(".build-workspace button:last-child"); await advance(300);
  expect(api.connect).toHaveBeenCalledTimes(2);
  expect(query<HTMLSelectElement>("#build-configuration").value).toBe("Shipping");
  await click(".build-workspace button:first-of-type"); await advance(300);
  expect(api.connect).toHaveBeenLastCalledWith("D:/SecondEngine");
  expect(query<HTMLInputElement>('[aria-label="源码工作区"]').value).toBe("D:/SecondEngine");
  expect(api.history).toHaveBeenLastCalledWith("D:/SecondEngine");
});
