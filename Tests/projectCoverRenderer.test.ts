// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { App, ProjectCover, SampleCover } from "../Source/Renderer/App";
import type { ProjectView } from "../Source/Shared/contracts";

const project: ProjectView = { projectId: "cover-project", name: "项目", path: "D:/项目", health: "ready", message: "", pinned: false, lastOpenedAt: "", lastOpenedLabel: "从未打开", scripting: false, manifest: "项目.crownproject", editorVersion: "Current" };
afterEach(() => vi.unstubAllGlobals());

it("keeps a sample card usable when its preview is missing or broken and recovers on refresh", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  const sample = { id: "lookdev", displayName: "LookDev Sample", description: "", category: "", scripting: false };
  try {
    await act(() => root.render(createElement(SampleCover, { sample })));
    expect(host.textContent).toContain("暂无预览图");
    await act(() => root.render(createElement(SampleCover, { sample: { ...sample, coverDataUrl: "data:image/jpeg;base64,broken" } })));
    await act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.textContent).toContain("暂无预览图");
    await act(() => root.render(createElement(SampleCover, { sample: { ...sample, coverDataUrl: "data:image/jpeg;base64,new" } })));
    expect(host.querySelector("img")?.alt).toBe("LookDev 示例 的示例预览");
  } finally { await act(() => root.unmount()); }
});

it("shows a placeholder on load failure and recovers when the cover changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(() => root.render(createElement(ProjectCover, { project, large: true })));
    expect(host.textContent).toContain("等待 Editor 生成封面");
    await act(() => root.render(createElement(ProjectCover, { project: { ...project, coverDataUrl: "data:image/jpeg;base64,broken" }, large: true })));
    await act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.textContent).toContain("等待 Editor 生成封面");
    await act(() => root.render(createElement(ProjectCover, { project: { ...project, coverDataUrl: "data:image/jpeg;base64,new" }, large: true })));
    expect(host.querySelector("img")?.alt).toBe("项目 的项目封面");
  } finally { await act(() => root.unmount()); }
});

it("refreshes an automatic cover on focus without offering a manual picker", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const snapshot = { projects: [project], samples: [], templates: [], editor: { ready: false, error: "", version: "", executable: "" }, settings: { editorExecutable: "", defaultProjectDirectory: "" } };
  const getSnapshot = vi.fn(async () => ({ ok: true, value: { ...snapshot, projects: [...snapshot.projects] } }));
  vi.stubGlobal("crownHost", { launcher: { getSnapshot }, window: { isMaximized: async () => false, onMaximizedChanged: () => () => {} } });
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => { root.render(createElement(App)); });
    expect(host.textContent).not.toMatch(/选择截图|更换截图/);
    expect(host.textContent).toContain("由 Editor 自动更新");
    snapshot.projects = [{ ...project, coverDataUrl: "data:image/jpeg;base64,updated" }];
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".project-cover img")?.getAttribute("src")).toBe("data:image/jpeg;base64,updated");
  } finally { await act(() => root.unmount()); }
  window.dispatchEvent(new Event("focus"));
  expect(getSnapshot).toHaveBeenCalledTimes(2);
});
