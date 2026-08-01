import { realpath } from "node:fs/promises";
import path from "node:path";

export async function normalizeAbsolutePath(value: string): Promise<string> {
  const absolute = path.resolve(value);
  try {
    return path.normalize(await realpath(absolute));
  } catch {
    return path.normalize(absolute);
  }
}

export function isSafeRelativePath(value: string): boolean {
  if (!value.trim() || path.isAbsolute(value) || path.win32.parse(value).root) {
    return false;
  }
  const normalized = path.normalize(value);
  if (normalized === "." || normalized === "..") {
    return false;
  }
  return !normalized.split(path.sep).includes("..");
}

export function isPathWithin(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function comparablePath(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function toPortablePath(value: string): string {
  return value.replaceAll(path.sep, "/");
}
