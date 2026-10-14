import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { comparablePath } from "./paths";

export const projectCoverFile = "ProjectCover.jpg";
export const maxCoverBytes = 768 * 1024;

export async function readBoundedImage(file: string, limit: number): Promise<Buffer> {
  const handle = await open(file, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size === 0 || info.size > limit) throw new Error("项目封面为空或过大。");
    // Bound the read as well as stat while Editor may publish a new cover.
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error("截图文件过大。");
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

async function coverPath(root: string): Promise<string> {
  const resolvedRoot = await realpath(root);
  const target = path.join(resolvedRoot, projectCoverFile);
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || comparablePath(await realpath(target)) !== comparablePath(target)) {
      throw new Error("项目封面路径不是普通文件，无法安全访问。");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

export async function readProjectCover(root: string): Promise<string> {
  try {
    const data = await readBoundedImage(await coverPath(root), maxCoverBytes);
    if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) return "";
    return `data:image/jpeg;base64,${data.toString("base64")}`;
  } catch {
    // Missing/corrupt cover art must not hide an otherwise valid project.
    return "";
  }
}
