// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkbenchPage } from "../Source/Renderer/WorkbenchPage";

it("requires project selection before submitting Editor Build & Run", async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const workspace = "D:/CrownEngine", projectPath = "D:/项目/LookDev Sample";
  const ok = <T,>(value: T) => Promise.resolve({ ok: true, value });
  const start = vi.fn(() => ok({ schemaVersion: 1, jobId: "a".repeat(32) }));
  const capabilities = { schemaVersion: 1, workspace, configurations: ["Shipping"], platforms: ["Win64"], features: [], source: { branch: "main", commit: "abc", dirty: false }, targets: [{ name: "CrownEditor", kind: "Editor", outputKind: "Executable", canRun: true, requiredFeatures: [], runRequiresProject: true }] };
  vi.stubGlobal("crownHost", {
    workbench: { getWorkspaces: () => ok([workspace]), connect: () => ok(capabilities), describe: () => ok({ modules: [] }), history: () => ok({ jobs: [], warnings: [] }), job: () => ok(null), start },
    launcher: { getSnapshot: () => ok({ projects: [{ name: "LookDev Sample", path: projectPath, health: "ready" }, { name: "Missing", path: "D:/missing", health: "missing" }] }) },
  });
  const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text)!;
  try {
    await act(() => root.render(createElement(WorkbenchPage)));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(button("构建并运行").disabled).toBe(false);
    await act(() => button("构建并运行").click());
    expect(button("开始").disabled).toBe(true);
    expect(start).not.toHaveBeenCalled();
    const projects = host.querySelector<HTMLSelectElement>('[aria-label="选择已有项目"]')!;
    expect(projects.textContent).toContain("LookDev Sample");
    expect(projects.textContent).not.toContain("Missing");
    await act(() => { projects.value = projectPath; projects.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(button("开始").disabled).toBe(false);
    await act(() => button("开始").click());
    expect(start).toHaveBeenCalledExactlyOnceWith({ workspace, target: "CrownEditor", configuration: "Shipping", platform: "Win64", jobs: 4, features: {}, operation: "run", runProject: projectPath });
    await act(() => button("构建").click());
    expect(start.mock.calls.at(-1)?.[0]).not.toHaveProperty("runProject");
  } finally {
    await act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
  }
});
