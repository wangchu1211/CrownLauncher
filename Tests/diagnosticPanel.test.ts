// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BuildDiagnostic } from "../Source/Renderer/BuildDiagnostic";
import type { BuildJobView } from "../Source/Shared/workbench";

it("copies only on an explicit click, preserves errors, and opens the original log", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const copyDiagnostics = vi.fn(async () => ({ ok: true })), onLog = vi.fn();
  vi.stubGlobal("crownHost", { workbench: { copyDiagnostics } });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const entry = { job: { id: "a".repeat(32), workspace: "D:/Engine", target: "Editor", command: "build", state: "failed", exitCode: 1 }, log: "file.cpp(2): error C2065: missing", progress: { phase: "building" } } as BuildJobView;
  const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(value => value.textContent === text)!;
  try {
    await act(() => root.render(createElement(BuildDiagnostic, { entry, onLog })));
    expect(host.textContent).toContain("C2065"); expect(copyDiagnostics).not.toHaveBeenCalled();
    await act(() => button("复制诊断信息").click());
    expect(copyDiagnostics).toHaveBeenCalledWith("D:/Engine", entry.job.id); expect(host.textContent).toContain("已复制诊断信息");
    await act(() => button("查看完整日志").click()); expect(onLog).toHaveBeenCalledTimes(1);
  } finally { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
