import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { normalizeAbsolutePath } from "./paths";

export async function calculateDirectorySize(directory: string): Promise<number> {
  const root = await normalizeAbsolutePath(directory);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) {
    throw new Error("项目位置不是目录。");
  }

  let bytes = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    const entries = await readdir(current, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(current, entry.name);
      // WHY: project symlinks can point outside the project or form cycles.
      // Size is intentionally the storage owned by this directory tree only.
      // Follow links only if traversal later gains cycle detection and an
      // explicit product definition for externally owned storage.
      if (entry.isSymbolicLink()) {
        return;
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
        return;
      }
      if (entry.isFile()) {
        try {
          // Read before accumulating: `bytes += await ...` captures an old sum
          // before yielding, so concurrent file stats overwrite each other.
          const info = await lstat(entryPath);
          bytes += info.size;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }
    }));
  }
  return bytes;
}
