import { createHash } from "node:crypto";
import { createReadStream, type Stats } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { BuildArtifact, BuildJobView } from "../Shared/workbench";

const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const inside = (root: string, file: string) => { const relative = path.relative(root, file); return !!relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); };
const missing = (error: unknown) => ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code || "");
export async function hashFile(file: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

export async function inspectArtifact(workspace: string, entry: BuildJobView): Promise<{
  executable: string; info: Stats | null; identity: BuildArtifact["identity"];
}> {
  if (!entry.result || !["build-passed", "run-passed"].includes(entry.result.outcome)) throw new Error("此任务没有经过验证的构建产物。");
  const lexicalRoot = path.resolve(workspace, "Build/CBT/Artifacts"), executable = path.resolve(workspace, entry.result.artifact);
  if (!inside(lexicalRoot, executable)) throw new Error("产物不在 CBT 产物目录内。");
  const identity: BuildArtifact["identity"] = { state: "unknown", detail: "历史任务未记录发布身份，无法确认当前产物是否属于本次任务。", fingerprint: null, verifiedFiles: 0 };
  let root: string, resolved: string, info: Stats;
  try {
    root = await realpath(lexicalRoot); resolved = await realpath(executable);
    if (!inside(root, resolved)) throw new Error("产物不在 CBT 产物目录内。");
    info = await stat(resolved);
    if (!info.isFile()) throw new Error("主产物不是文件。");
  } catch (error) {
    if (!missing(error)) throw error;
    return { executable, info: null, identity: { ...identity, state: "missing", detail: "主产物不存在，可能已清理或尚未完成发布。请重新构建。" } };
  }
  const directory = path.dirname(resolved), manifestPath = path.join(directory, "manifest.json");
  try {
    const checkedManifest = await realpath(manifestPath);
    if (!inside(directory, checkedManifest) || (await stat(checkedManifest)).size > 8 * 1024 * 1024) throw new Error("发布清单路径或大小无效。");
    const bytes = await readFile(checkedManifest), manifest = JSON.parse(bytes.toString("utf8"));
    if (manifest.schemaVersion !== 1 || manifest.targetIdentity !== `${entry.job.target}-${entry.job.platform}-${entry.job.configuration}` ||
      !Array.isArray(manifest.artifacts) || !manifest.artifacts.length || manifest.artifacts.length > 20000) throw new Error("发布清单与目标不符或格式不受支持。");
    const paths = new Set<string>(); let hasExecutable = false;
    for (const file of manifest.artifacts) {
      if (typeof file.path !== "string" || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("发布清单文件条目无效。");
      const lexical = path.resolve(workspace, file.path);
      if (!inside(lexicalRoot, lexical)) throw new Error("发布清单包含目录外文件。");
      const candidate = await realpath(lexical);
      if (!inside(directory, candidate) || paths.has(candidate.toLowerCase())) throw new Error("发布清单包含重定向或重复文件。");
      paths.add(candidate.toLowerCase()); hasExecutable ||= candidate.toLowerCase() === resolved.toLowerCase();
      const before = await stat(candidate);
      if (!before.isFile() || before.size !== file.size || await hashFile(candidate) !== file.sha256) {
        return { executable: resolved, info, identity: { ...identity, state: "damaged", detail: `文件与发布清单不一致：${path.relative(directory, candidate)}。请重新构建，避免运行混合版本。` } };
      }
      const after = await stat(candidate);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("校验期间文件发生变化，请等待构建结束后刷新。");
      identity.verifiedFiles++;
    }
    if (!hasExecutable) throw new Error("发布清单未包含主产物。");
    // A refresh is an observation, not a build lock. Never label an in-flight
    // replacement as matched; recheck the manifest after hashing its payload.
    if (!(await readFile(manifestPath)).equals(bytes)) throw new Error("校验期间发布清单发生变化，请稍后刷新。");
    identity.fingerprint = hash(bytes);
    if (entry.publication?.schemaVersion === 1) {
      identity.state = entry.publication.manifestSha256 === identity.fingerprint ? "matched" : "replaced";
      identity.detail = identity.state === "matched" ? "当前发布清单及其文件内容与本次任务记录一致；不代表当前源码已重新验证。" : "当前发布清单与本次任务不同。下方大小属于当前产物，构建时间仍属于选中的历史任务。";
    }
    return { executable: resolved, info, identity };
  } catch (error) {
    identity.fingerprint = null;
    identity.detail = missing(error) ? "发布清单或其中的文件缺失，无法确认产物完整性。请重新构建。" : `无法确认发布身份：${error instanceof Error ? error.message : error}`;
    return { executable: resolved, info, identity };
  }
}
