import { describe, expect, it } from "vitest";
import { defaultWindowBounds } from "../Source/Main/windowLayout";

describe("Launcher default window", () => {
  it("uses the reference size and centers on a roomy desktop", () => {
    expect(defaultWindowBounds({ x: 0, y: 0, width: 1920, height: 1400 })).toEqual({
      width: 1480, height: 1260, minWidth: 960, minHeight: 600, x: 220, y: 70,
    });
  });
  it.each([
    { x: 0, y: 0, width: 1366, height: 728 },
    { x: 0, y: 0, width: 800, height: 560 },
    { x: -1920, y: -100, width: 1920, height: 1040 },
    { x: 1920, y: 40, width: 1536, height: 824 },
  ])("stays within the selected display work area: %j", area => {
    const bounds = defaultWindowBounds(area);
    expect(bounds.x).toBeGreaterThanOrEqual(area.x + 24);
    expect(bounds.y).toBeGreaterThanOrEqual(area.y + 24);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width - 24);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height - 24);
    expect(bounds.minWidth).toBeLessThanOrEqual(bounds.width);
    expect(bounds.minHeight).toBeLessThanOrEqual(bounds.height);
  });
});
