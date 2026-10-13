// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BuildTaskDetails } from "../Source/Renderer/WorkbenchPage";
import type { BuildJobView } from "../Source/Shared/workbench";

it("loads artifact sizes only on its tab, requires a project and launches without build", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const ok = <T,>(value: T) => Promise.resolve({ ok: true, value });
  const project = "D:/项目/LookDev Sample";
  const info = { path: "D:/Build/Editor/editor.exe", directory: "D:/Build/Editor", bytes: 1024 ** 3, executableBytes: 1024 ** 2, measuredAt: "2026-10-13T00:00:00Z", modifiedAt: "2026-10-13T00:00:00Z", buildCompletedAt: "2026-10-13T00:00:02Z", buildDurationMs: 2000, canRun: true, runRequiresProject: true, identity: { state: "replaced", detail: "Current file is different.", fingerprint: "f".repeat(64), verifiedFiles: 1 } };
  const artifact = vi.fn(() => ok(info)), launchArtifact = vi.fn(() => ok({ processId: 123 })), start = vi.fn(), reveal = vi.fn();
  vi.stubGlobal("crownHost", { workbench: { artifact, launchArtifact, start }, launcher: { getSnapshot: () => ok({ projects: [{ name: "LookDev Sample", path: project, health: "ready" }] }) } });
  const entry = { schemaVersion: 1, job: { id: "a".repeat(32), workspace: "D:/Engine", target: "CrownEditor", state: "succeeded", command: "build", origin: "launcher", source: { branch: "main", commit: "abcdef", dirty: false }, features: {}, createdAt: "2026-10-13T00:00:00Z", finishedAt: "2026-10-13T01:00:00Z" }, result: { outcome: "build-passed", artifact: info.path }, log: "done" } as BuildJobView;
  const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(value => value.textContent === text)!;
  try {
    await act(() => root.render(createElement(BuildTaskDetails, { entry, onReveal: reveal, onCancel: () => {} })));
    expect(artifact).not.toHaveBeenCalled();
    await act(() => button("产物").click());
    expect(artifact).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("1.00 GiB"); expect(host.textContent).toContain("本次构建耗时2 秒");
    expect(host.textContent).toContain("已被其他发布替换"); expect(host.textContent).toContain("选中任务 · 构建记录");
    expect(button("直接运行").compareDocumentPosition(host.querySelector(".artifact-provenance")!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(host.textContent).toContain("任务总时长 60 分 0 秒");
    await act(() => button("直接运行").click()); expect(button("启动产物").disabled).toBe(true);
    const select = host.querySelector<HTMLSelectElement>('[aria-label="产物运行项目"]')!;
    await act(() => { select.value = project; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(() => button("启动产物").click());
    expect(launchArtifact).toHaveBeenCalledWith("D:/Engine", entry.job.id, project, info.identity.fingerprint); expect(start).not.toHaveBeenCalled();
    expect(host.textContent).toContain("已启动（PID 123）"); expect(host.textContent).toContain("不代表运行验收通过");
    await act(() => button("刷新产物").click()); expect(artifact).toHaveBeenCalledTimes(2);
  } finally { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
