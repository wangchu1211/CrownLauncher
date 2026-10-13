interface WorkArea { x: number; y: number; width: number; height: number }

export function defaultWindowBounds(workArea: WorkArea) {
  // Electron work areas are in DIP, excluding the taskbar. Keep the larger
  // workbench comfortable on a desktop without overflowing smaller displays.
  const width = Math.min(1480, Math.max(1, workArea.width - 48));
  const height = Math.min(1260, Math.max(1, workArea.height - 48));
  return {
    width, height,
    minWidth: Math.min(960, width), minHeight: Math.min(600, height),
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
  };
}
