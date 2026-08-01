import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function writeFileAtomically(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
