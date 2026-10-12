import type { Event, Input, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { nextZoomFactor, registerZoomShortcuts, zoomCommand } from "../Source/Main/zoomShortcuts";

const input: Input = {
  type: "keyDown", key: "=", code: "Equal", control: true, shift: false,
  meta: false, alt: false, isComposing: false, isAutoRepeat: false, location: 0, modifiers: ["control"],
};

describe("Launcher zoom shortcuts", () => {
  it.each([
    [{}, "in"],
    [{ key: "+", shift: true }, "in"],
    [{ key: "+", code: "NumpadAdd", location: 3 }, "in"],
    [{ key: "-", code: "Minus" }, "out"],
    [{ key: "-", code: "NumpadSubtract", location: 3 }, "out"],
    [{ key: "0", code: "Digit0" }, "reset"],
    [{ key: "0", code: "Numpad0", location: 3 }, "reset"],
    [{ isAutoRepeat: true }, "in"],
  ])("recognizes Windows zoom chord %j", (patch, command) => {
    expect(zoomCommand({ ...input, ...patch }, "win32")).toBe(command);
  });

  it.each([
    { control: false }, { type: "keyUp" }, { alt: true }, { meta: true },
    { isComposing: true }, { key: "a", code: "KeyA" }, { key: ")", code: "Digit0", shift: true },
  ])("leaves unrelated input alone: %j", patch => {
    expect(zoomCommand({ ...input, ...patch }, "win32")).toBeNull();
  });

  it("uses Command on macOS", () => {
    expect(zoomCommand({ ...input, control: false, meta: true }, "darwin")).toBe("in");
    expect(zoomCommand(input, "darwin")).toBeNull();
  });

  it("zooms both directions, tolerates rounding and resets within bounded steps", () => {
    expect(nextZoomFactor(1, "in")).toBe(1.1);
    expect(nextZoomFactor(1.1, "out")).toBe(1);
    expect(nextZoomFactor(0.9, "in")).toBe(1);
    expect(nextZoomFactor(1, "out")).toBe(0.9);
    expect(nextZoomFactor(1.09999999, "in")).toBe(1.25);
    expect(nextZoomFactor(1.10000001, "out")).toBe(1);
    expect(nextZoomFactor(3, "in")).toBe(3);
    expect(nextZoomFactor(0.5, "out")).toBe(0.5);
    expect(nextZoomFactor(2, "reset")).toBe(1);
  });

  it("handles each keydown once and prevents a second menu zoom", () => {
    let handler!: (event: Event, input: Input) => void;
    const contents = {
      on: vi.fn((_name: string, callback: typeof handler) => { handler = callback; }),
      getZoomFactor: vi.fn(() => 1), setZoomFactor: vi.fn(),
    };
    registerZoomShortcuts(contents as unknown as WebContents);
    expect(contents.on).toHaveBeenCalledWith("before-input-event", expect.any(Function));
    const event = { preventDefault: vi.fn() };
    handler(event as unknown as Event, { ...input, control: process.platform !== "darwin", meta: process.platform === "darwin" });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(contents.setZoomFactor).toHaveBeenCalledExactlyOnceWith(1.1);
    handler(event as unknown as Event, { ...input, type: "keyUp" });
    handler(event as unknown as Event, { ...input, control: false, meta: false });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(contents.setZoomFactor).toHaveBeenCalledOnce();
  });
});
