// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../Source/Renderer/App";
import { catalogText } from "../Source/Renderer/launcherLabels";
import type { LauncherSnapshot, ProjectView } from "../Source/Shared/contracts";

const project: ProjectView = { projectId: "identity", name: "Original English Name", path: "D:/项目/Original English Name", health: "ready", message: "", pinned: false, lastOpenedAt: "", lastOpenedLabel: "从未打开", scripting: false, manifest: "Project.crownproject", editorVersion: "Current" };
const snapshot: LauncherSnapshot = {
  projects: [project],
  templates: [{ id: "empty", displayName: "Empty", description: "An empty Crown project with no startup scene.", supportsScripting: true }],
  samples: [{ id: "lookdev-gallery", displayName: "LookDev Sample", description: "An interactive gallery for Crown rendering, animation, terrain and physics features.", category: "Engine Features", scripting: false }],
  editor: { ready: true, executable: "D:/Engine/crown_editor_qt.exe", version: "Current", error: "" },
  settings: { editorExecutable: "", defaultProjectDirectory: "D:/项目" },
};
afterEach(() => vi.unstubAllGlobals());

async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const ok = <T,>(value: T) => Promise.resolve({ ok: true, value });
  const createSample = vi.fn(() => ok(project)), createProject = vi.fn(() => ok(project)), deleteProject = vi.fn(), removeProject = vi.fn();
  vi.stubGlobal("crownHost", {
    launcher: { getSnapshot: () => ok(snapshot), createSample, createProject, deleteProject, removeProject },
    window: { isMaximized: async () => false, onMaximizedChanged: () => () => {} },
  });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(() => root.render(createElement(App)));
  return { host, createSample, createProject, deleteProject, removeProject,
    button: (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(value => value.textContent?.trim() === text)!,
    close: async () => { await act(() => root.unmount()); host.remove(); },
  };
}

it("localizes built-in catalog display text without replacing custom copy or persisted project names", () => {
  expect(catalogText("Empty")).toBe("空项目");
  expect(catalogText("Blank 3D")).toBe("基础 3D");
  expect(catalogText("LookDev Sample")).toBe("LookDev 示例");
  expect(catalogText("Engine Features")).toBe("引擎功能");
  expect(catalogText("Custom scene from another engine")).toBe("Custom scene from another engine");
  expect(catalogText("constructor")).toBe("constructor");
});

it("shows Chinese creation fields while preserving template IDs and original project names", async () => {
  const page = await mount();
  try {
    expect(page.host.textContent).toContain(project.name);
    expect(page.host.textContent).toContain("从未打开");
    await act(() => page.button("＋ 新建项目").click());
    expect(page.host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("新建 Crown 项目");
    expect(page.host.textContent).toContain("项目名称");
    expect(page.host.textContent).toContain("空项目");
    expect(page.host.textContent).toContain("不包含启动场景的空白 Crown 项目。");
    expect(page.host.querySelector<HTMLSelectElement>("#create-template")?.value).toBe("empty");
    expect(page.button("创建项目").disabled).toBe(true);
    await act(() => page.button("取消").click());
    expect(page.createProject).not.toHaveBeenCalled();
  } finally { await page.close(); }
});

it("localizes sample cards and copy dialogs without changing sample identity or the default folder name", async () => {
  const page = await mount();
  try {
    await act(() => page.host.querySelector<HTMLButtonElement>('[aria-label="示例"]')!.click());
    expect(page.host.textContent).toContain("LookDev 示例");
    expect(page.host.textContent).toContain("引擎功能");
    expect(page.host.textContent).toContain("交互式体验 Crown 的渲染、动画、地形和物理功能。");
    await act(() => page.button("创建副本 ↗").click());
    expect(page.host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("创建示例副本");
    expect(page.host.querySelector<HTMLInputElement>("#sample-name")?.value).toBe("LookDev Sample");
    await act(() => page.button("创建并打开").click());
    expect(page.createSample).toHaveBeenCalledWith({ displayName: "LookDev Sample", parentDirectory: "D:/项目", sampleId: "lookdev-gallery", openAfterCreate: true });
  } finally { await page.close(); }
});

it("keeps remove and permanent-delete warnings distinct and cancellation non-destructive", async () => {
  const page = await mount();
  try {
    await act(() => page.host.querySelector<HTMLButtonElement>('[aria-label="项目操作"]')!.click());
    await act(() => page.button("从列表移除").click());
    expect(page.host.textContent).toContain("不会删除磁盘上的项目文件");
    await act(() => page.button("取消").click());
    await act(() => page.host.querySelector<HTMLButtonElement>('[aria-label="项目操作"]')!.click());
    await act(() => page.button("删除项目…").click());
    expect(page.host.textContent).toContain("永久删除项目？");
    expect(page.host.textContent).toContain("此操作无法撤销，项目不会移入回收站。");
    expect(page.host.querySelector('[role="dialog"] code')?.textContent).toBe(project.path);
    await act(() => page.button("取消").click());
    expect(page.deleteProject).not.toHaveBeenCalled(); expect(page.removeProject).not.toHaveBeenCalled();
  } finally { await page.close(); }
});
