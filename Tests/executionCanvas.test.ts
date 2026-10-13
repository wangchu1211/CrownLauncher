// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildExecutionGraph } from "../Source/Renderer/BuildExecutionGraph";
import type { BuildJobView, ExecutionGraph } from "../Source/Shared/workbench";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const graph: ExecutionGraph = {
  id: "interaction", target: "Probe", fingerprint: "fixed", createdAt: "",
  modules: [{ id: "Core", name: "Core", kind: "module", dependencies: [] }],
  actions: [{ id: "compile:Core:test", module: "Core", kind: "Compile", label: "test.cpp", dependencies: [], state: "succeeded", needsBuild: true, startedAt: null, finishedAt: null, exitCode: 0 }],
};
const entry = (value = graph) => ({ job: { state: "succeeded", target: value.target }, execution: { schemaVersion: 1, graphs: [value], warnings: [] } }) as unknown as BuildJobView;
const canvasStyles = readFileSync(resolve("Source/Renderer/build-execution-graph.css"), "utf8");
let host: HTMLDivElement, root: Root, notifyResize: () => void, stylesheet: HTMLStyleElement;
function viewport() { return host.querySelector<HTMLDivElement>(".execution-viewport")!; }
function transform() { return host.querySelector<HTMLElement>(".execution-surface")!.style.transform; }
function view() {
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(transform())!;
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}
async function wheel(deltaY: number, ctrlKey = false, target: Element = viewport(), deltaMode = 0) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey, deltaY, deltaMode, clientX: 270, clientY: 210 });
  await act(() => { target.dispatchEvent(event); });
  return event;
}
function pointer(type: string, x: number, y: number, pointerId = 1, options: { button?: number; buttons?: number; target?: Element } = {}) {
  const button = options.button ?? 0;
  const buttons = options.buttons ?? (["pointerup", "pointercancel", "lostpointercapture"].includes(type) ? 0 : button === 1 ? 4 : button === 2 ? 2 : 1);
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, buttons });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  (options.target ?? viewport()).dispatchEvent(event);
  return event;
}
async function render(value = graph) {
  await act(() => root.render(createElement(StrictMode, null, createElement(BuildExecutionGraph, { entry: entry(value) }))));
}
async function resize(width: number, height: number) {
  Object.defineProperties(viewport(), { clientWidth: { configurable: true, value: width }, clientHeight: { configurable: true, value: height } });
  await act(() => notifyResize());
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { notifyResize = callback; } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 20, top: 30, width: 700, height: 380, right: 720, bottom: 410, x: 20, y: 30, toJSON() {} });
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  stylesheet = document.createElement("style"); stylesheet.textContent = canvasStyles; document.head.append(stylesheet);
  await render();
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove(); stylesheet.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("execution canvas interactions", () => {
  it("waits for the main Target and keeps a manually selected dependency stable during polling", async () => {
    const hostGraph = { ...graph, id: "host", target: "DiagnosticsHost" };
    const workerGraph = { ...graph, id: "worker", target: "GenerationWorker" };
    const editorGraph = { ...graph, id: "editor", target: "CrownEditor" };
    const update = async (graphs: ExecutionGraph[]) => {
      const value = { ...entry(), job: { ...entry().job, target: "CrownEditor", state: "running" as const }, execution: { schemaVersion: 1 as const, graphs, warnings: [] } };
      await act(() => root.render(createElement(StrictMode, null, createElement(BuildExecutionGraph, { entry: value }))));
    };
    await update([hostGraph]);
    expect(host.textContent).toContain("等待主目标构建图");
    expect(viewport()).toBeNull();
    const selector = host.querySelector<HTMLSelectElement>('[aria-label="查看构建目标图"]')!;
    expect(selector.value).toBe("");
    expect(getComputedStyle(selector).minWidth).toBe("0px");
    expect(getComputedStyle(selector.previousElementSibling!).whiteSpace).toBe("nowrap");
    await update([hostGraph, workerGraph]);
    expect(viewport()).toBeNull();
    await act(() => { selector.value = "host"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.querySelector(".execution-panel-heading")?.textContent).toContain("DiagnosticsHost");
    await wheel(-100);
    const priorViewport = viewport(), priorView = transform();
    await update([hostGraph, workerGraph, editorGraph]);
    expect(selector.value).toBe("host");
    expect(viewport()).toBe(priorViewport);
    expect(transform()).toBe(priorView);
    await act(() => { selector.value = ""; selector.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.querySelector(".execution-panel-heading")?.textContent).toContain("CrownEditor");
    await update([hostGraph, workerGraph, editorGraph, { ...graph, id: "late", target: "OtherDependency" }]);
    expect(selector.value).toBe("");
    expect(host.querySelector(".execution-panel-heading")?.textContent).toContain("CrownEditor");
  });
  it.each([0, 1].flatMap(button => ["pointerup", "pointercancel", "lostpointercapture"].map(end => ({ button, end }))))("keeps queued moves safe after $end (button=$button)", async ({ end, button }) => {
    const initial = transform();
    // Continuous moves may remain queued when the discrete release clears the
    // drag ref. Exercise real React batching, not just a pure layout function.
    await act(() => {
      pointer("pointerdown", 100, 100, 1, { button });
      pointer("pointermove", 120, 130, 1, { button });
      pointer("pointermove", 150, 160, 1, { button });
      pointer(end, 150, 160, 1, { button });
    });
    expect(viewport()).not.toBeNull();
    expect(transform()).not.toBe(initial);
    expect(viewport().classList.contains("panning")).toBe(false);
    const ended = transform();
    await act(() => pointer("pointermove", 200, 210));
    expect(transform()).toBe(ended);
    await act(() => { pointer("pointerdown", 200, 210, 1, { button }); pointer("pointermove", 220, 240, 1, { button }); pointer("pointerup", 220, 240, 1, { button }); });
    expect(transform()).not.toBe(ended);
  });
  it.each(["canvas", "node"])("pans with the middle button over a %s without zooming or selecting a node", async targetKind => {
    const target = targetKind === "node" ? host.querySelector<HTMLElement>(".execution-node strong")! : viewport();
    const initial = view();
    await act(() => {
      expect(pointer("pointerdown", 100, 100, 1, { button: 1, target }).defaultPrevented).toBe(true);
    });
    expect(viewport().setPointerCapture).toHaveBeenCalledWith(1);
    expect(viewport().classList.contains("panning")).toBe(true);
    await act(() => pointer("pointermove", 160, 150, 1, { button: 1 }));
    expect(view()).toEqual({ x: initial.x + 60, y: initial.y + 50, scale: initial.scale });
    await wheel(-120);
    expect(view().scale).toBe(initial.scale);
    await act(() => pointer("pointerup", 160, 150, 1, { button: 1 }));
    expect(viewport().releasePointerCapture).toHaveBeenCalledWith(1);
    const auxClick = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    await act(() => { target.dispatchEvent(auxClick); });
    expect(auxClick.defaultPrevented).toBe(true);
    expect(host.querySelector(".execution-inspector")).toBeNull();
    await wheel(-120);
    expect(view().scale).toBeGreaterThan(initial.scale);
  });
  it("stops middle-panning when middle is released while another mouse button remains down", async () => {
    await act(() => pointer("pointerdown", 100, 100, 1, { button: 1 }));
    await act(() => pointer("pointermove", 120, 130, 1, { button: -1, buttons: 5 }));
    const moved = transform();
    await act(() => pointer("pointermove", 150, 160, 1, { button: 1, buttons: 1 }));
    expect(transform()).toBe(moved);
    expect(viewport().classList.contains("panning")).toBe(false);
    await act(() => pointer("pointermove", 180, 190));
    expect(transform()).toBe(moved);
  });
  it("preserves left-click on nodes and does not pan with the right mouse button", async () => {
    const initial = transform();
    const node = host.querySelector<HTMLButtonElement>(".execution-node")!;
    await act(() => {
      expect(pointer("pointerdown", 100, 100, 1, { target: node }).defaultPrevented).toBe(false);
      pointer("pointermove", 150, 160);
      pointer("pointerup", 150, 160);
      node.click();
    });
    expect(host.querySelector(".execution-inspector")).not.toBeNull();
    expect(transform()).toBe(initial);
    await act(() => {
      expect(pointer("pointerdown", 100, 100, 1, { button: 2 }).defaultPrevented).toBe(false);
      pointer("pointermove", 150, 160, 1, { button: 2 });
      pointer("pointerup", 150, 160, 1, { button: 2 });
    });
    expect(transform()).toBe(initial);
  });
  it("focuses the canvas on drag and ignores a different pointer", async () => {
    const initial = transform();
    await act(() => { pointer("pointerdown", 100, 100); pointer("pointermove", 180, 160, 2); pointer("pointerup", 180, 160, 2); });
    expect(document.activeElement).toBe(viewport());
    expect(transform()).toBe(initial);
    await act(() => { pointer("pointermove", 150, 130); pointer("pointerup", 150, 130); });
    expect(transform()).not.toBe(initial);
  });
  it.each([false, true])("zooms both ways around the cursor without focus (Ctrl=%s)", async ctrlKey => {
    const initial = view();
    expect(document.activeElement).not.toBe(viewport());
    expect((await wheel(-120, ctrlKey)).defaultPrevented).toBe(true);
    const enlarged = view();
    expect(enlarged.scale).toBeGreaterThan(initial.scale);
    expect((250 - enlarged.x) / enlarged.scale).toBeCloseTo((250 - initial.x) / initial.scale);
    expect((180 - enlarged.y) / enlarged.scale).toBeCloseTo((180 - initial.y) / initial.scale);
    expect((await wheel(120, ctrlKey)).defaultPrevented).toBe(true);
    expect(view().scale).toBeCloseTo(initial.scale);
    expect(document.activeElement).not.toBe(viewport());
  });
  it("zooms on hover while another pane has focus, without stealing focus or its scrolling", async () => {
    const outside = document.createElement("button"); host.append(outside); outside.focus();
    expect((await wheel(-120)).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(outside);
    const afterZoom = transform();
    viewport().focus();
    expect((await wheel(-120, false, outside)).defaultPrevented).toBe(false);
    expect((await wheel(-120, true, outside)).defaultPrevented).toBe(false);
    expect(transform()).toBe(afterZoom);
    outside.remove();
  });
  it("accepts hovering a module node and handles line/page-mode wheel deltas", async () => {
    const node = host.querySelector<HTMLButtonElement>(".execution-node")!;
    const initial = view().scale;
    expect((await wheel(-3, false, node, 1)).defaultPrevented).toBe(true);
    expect(view().scale).toBeGreaterThan(initial);
    await resize(700, 380);
    const lineScale = view().scale;
    expect((await wheel(-1, false, node, 2)).defaultPrevented).toBe(true);
    expect(view().scale).toBeGreaterThan(lineScale);
  });
  it("starts a wide graph at readable 100% and only fits it on request", async () => {
    await render({ ...graph, id: "wide", modules: Array.from({ length: 8 }, (_, i) => ({ id: `module-${i}`, name: `Module ${i}`, kind: "module", dependencies: i ? [`module-${i - 1}`] : [] })) });
    expect(view().scale).toBe(1);
    await act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "适应全图")!.click());
    expect(view().scale).toBeLessThan(.5);
    const fitted = view();
    await resize(1000, 600);
    expect(view().scale).toBe(fitted.scale);
    expect((500 - view().x) / view().scale).toBeCloseTo((350 - fitted.x) / fitted.scale);
    expect((300 - view().y) / view().scale).toBeCloseTo((190 - fitted.y) / fitted.scale);
    await render({ ...graph, id: "new-graph" });
    expect(view().scale).toBe(1);
  });
  it("preserves manual zoom through resize, hidden tabs and task updates", async () => {
    await wheel(-100);
    const zoomed = view();
    await resize(1000, 600);
    expect(view().scale).toBe(zoomed.scale);
    expect(view().x).toBeCloseTo(zoomed.x + 150);
    expect(view().y).toBeCloseTo(zoomed.y + 110);
    const resized = transform();
    await resize(0, 0);
    expect(transform()).toBe(resized);
    await resize(1000, 600);
    await render({ ...graph, actions: graph.actions.map(action => ({ ...action })) });
    expect(transform()).toBe(resized);
  });
  it("does not zoom mid-drag or consume wheel scrolling in module details", async () => {
    const initial = view().scale;
    await act(() => pointer("pointerdown", 100, 100));
    expect((await wheel(-120)).defaultPrevented).toBe(true);
    expect(view().scale).toBe(initial);
    await act(() => pointer("pointerup", 100, 100));
    await act(() => host.querySelector<HTMLButtonElement>(".execution-node")!.click());
    const detail = host.querySelector<HTMLElement>(".execution-inspector")!;
    expect((await wheel(120, false, detail)).defaultPrevented).toBe(false);
    expect(view().scale).toBe(initial);
  });
  it.each([450, 1000])("floats details without changing canvas layout or view at width %s", async width => {
    await render({ ...graph, id: "overlay", modules: [...graph.modules, { id: "App", name: "App", kind: "module", dependencies: ["Core"] }] });
    await resize(width, 600);
    await wheel(-80);
    await act(() => { pointer("pointerdown", 100, 100); pointer("pointermove", 145, 125); pointer("pointerup", 145, 125); });
    const originalViewport = viewport(), initial = transform();
    const body = host.querySelector<HTMLElement>(".execution-body")!;
    const columns = getComputedStyle(body).gridTemplateColumns;
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".execution-node")];
    for (const button of [...buttons, buttons[0]!]) {
      await act(() => button.click());
      const detail = host.querySelector<HTMLElement>(".execution-inspector")!;
      expect(detail).not.toBeNull();
      expect(detail.parentElement).toBe(body);
      expect(viewport().contains(detail)).toBe(false);
      expect(getComputedStyle(body).position).toBe("relative");
      expect(getComputedStyle(detail).position).toBe("absolute");
      expect(getComputedStyle(detail).right).toBe("12px");
      expect(getComputedStyle(body).gridTemplateColumns).toBe(columns);
      expect(viewport()).toBe(originalViewport);
      expect(transform()).toBe(initial);
      expect((await wheel(120, false, detail.querySelector(".execution-action-list")!)).defaultPrevented).toBe(false);
      expect(transform()).toBe(initial);
    }
    await act(() => host.querySelector<HTMLButtonElement>('[aria-label="关闭模块详情"]')!.click());
    expect(host.querySelector(".execution-inspector")).toBeNull();
    expect(getComputedStyle(body).gridTemplateColumns).toBe(columns);
    expect(transform()).toBe(initial);
    expect(document.activeElement).toBe(viewport());
  });
  it("dismisses details with Escape before collapsing an expanded canvas", async () => {
    await act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "展开画布")!.click());
    await act(() => host.querySelector<HTMLButtonElement>(".execution-node")!.click());
    const initial = transform();
    const search = host.querySelector<HTMLInputElement>('[aria-label="搜索模块子任务"]')!;
    search.focus();
    await act(() => { search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(host.querySelector(".execution-inspector")).toBeNull();
    expect(host.querySelector(".execution-panel.expanded")).not.toBeNull();
    expect(document.activeElement).toBe(viewport());
    expect(transform()).toBe(initial);
    await act(() => { viewport().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(host.querySelector(".execution-panel.expanded")).toBeNull();
  });
  it("clamps wheel zoom and does not duplicate listeners under StrictMode", async () => {
    viewport().focus();
    const initial = view().scale;
    await wheel(-10);
    expect(view().scale).toBeCloseTo(initial * Math.exp(.02));
    for (let i = 0; i < 15; i++) await wheel(-1200);
    expect(view().scale).toBe(2);
    expect((await wheel(-1200)).defaultPrevented).toBe(true);
    for (let i = 0; i < 15; i++) await wheel(1200);
    expect(view().scale).toBe(.12);
    expect(Number.isFinite(view().x) && Number.isFinite(view().y)).toBe(true);
  });
  it("can keep dragging while task updates arrive", async () => {
    for (let i = 0; i < 10; i++) {
      const initial = transform();
      await act(() => {
        pointer("pointerdown", 100, 100);
        pointer("pointermove", 120, 130);
        root.render(createElement(StrictMode, null, createElement(BuildExecutionGraph, { entry: entry({ ...graph, actions: graph.actions.map(action => ({ ...action })) }) })));
        pointer("pointermove", 160, 170);
        pointer("pointerup", 160, 170);
      });
      expect(transform()).not.toBe(initial);
      expect(host.querySelector("[role=alert]")).toBeNull();
    }
  });
  it("contains render errors and lets the user remount the canvas without a build", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await render({ ...graph, id: "bad-input", modules: [null as unknown as ExecutionGraph["modules"][number]] });
    expect(host.querySelector("[role=alert]")?.textContent).toContain("构建任务不受影响");
    expect(host.querySelector(".execution-panel-heading")?.textContent).toContain("Probe");
    await render({ ...graph, id: "bad-input" });
    await act(() => host.querySelector<HTMLButtonElement>("[role=alert] button")!.click());
    expect(viewport()).not.toBeNull();
    expect(host.querySelector("[role=alert]")).toBeNull();
  });
});
