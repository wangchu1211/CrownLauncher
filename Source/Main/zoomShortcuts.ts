import type { Input, WebContents } from "electron";

type ZoomInput = Pick<Input, "type" | "key" | "code" | "control" | "meta" | "alt" | "isComposing">;
type ZoomCommand = "in" | "out" | "reset";

export function zoomCommand(input: ZoomInput, platform: NodeJS.Platform = process.platform): ZoomCommand | null {
  const modifier = platform === "darwin" ? input.meta && !input.control : input.control && !input.meta;
  if (input.type !== "keyDown" || !modifier || input.alt || input.isComposing) return null;
  // WHY: The main keyboard's + key reports '=' without Shift. Electron's
  // default zoom-in accelerator does not accept that chord on Windows.
  if (input.key === "+" || input.key === "=" || input.code === "NumpadAdd") return "in";
  if (input.key === "-" || input.code === "NumpadSubtract") return "out";
  if (input.key === "0") return "reset";
  return null;
}

const zoomFactors = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export function nextZoomFactor(current: number, command: ZoomCommand): number {
  if (command === "reset") return 1;
  // Chromium can return a slightly rounded factor; don't get stuck on a step.
  if (command === "in") return zoomFactors.find(factor => factor > current + 0.001) ?? 3;
  return [...zoomFactors].reverse().find(factor => factor < current - 0.001) ?? 0.5;
}

export function registerZoomShortcuts(contents: WebContents): void {
  contents.on("before-input-event", (event, input) => {
    const command = zoomCommand(input);
    if (command === null) return;
    // Suppress the default menu accelerator so one press only zooms once.
    event.preventDefault();
    contents.setZoomFactor(nextZoomFactor(contents.getZoomFactor(), command));
  });
}
