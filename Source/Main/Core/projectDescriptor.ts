import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomically } from "./atomicFile";
import { isPathWithin, isSafeRelativePath, normalizeAbsolutePath, toPortablePath } from "./paths";

export interface ProjectScriptingConfig {
  enabled: boolean;
  projectFile: string;
  assemblyName: string;
}

export interface ProjectDescriptor {
  schemaVersion: 1;
  projectId: string;
  displayName: string;
  editorVersion?: string;
  scripting: ProjectScriptingConfig;
  root: string;
  manifestPath: string;
}

export type ProjectInspection =
  | { health: "ready"; message: ""; descriptor: ProjectDescriptor; root: string }
  | { health: "missing" | "invalid"; message: string; root: string };

const uuidPattern = /^[{]?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[}]?$/i;

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function loadDescriptor(projectRootOrManifest: string): Promise<ProjectDescriptor> {
  const requested = await normalizeAbsolutePath(projectRootOrManifest);
  const requestedStat = await stat(requested);
  let root = requested;
  let manifestPath = "";

  if (requestedStat.isFile()) {
    if (path.extname(requested).toLocaleLowerCase("en-US") !== ".crownproject") {
      throw new Error("所选文件不是 .crownproject 文件。");
    }
    manifestPath = requested;
    root = path.dirname(requested);
  } else if (requestedStat.isDirectory()) {
    const manifests = (await readdir(requested, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLocaleLowerCase("en-US") === ".crownproject")
      .map((entry) => path.join(requested, entry.name));
    if (manifests.length === 0) {
      throw new Error("项目中没有 .crownproject 文件。");
    }
    if (manifests.length !== 1) {
      throw new Error("项目中必须且只能有一个 .crownproject 文件。");
    }
    manifestPath = manifests[0] as string;
  } else {
    throw new Error("所选项目路径不是目录或文件。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`项目描述文件不是有效的 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  const object = readObject(parsed);
  if (!object || object.schemaVersion !== 1) {
    throw new Error(`不支持的项目描述文件格式版本：${String(object?.schemaVersion ?? "未知")}。`);
  }
  const uuidMatch = typeof object.projectId === "string" ? uuidPattern.exec(object.projectId) : null;
  if (!uuidMatch?.[1]) {
    throw new Error("项目描述文件中的 projectId 无效。");
  }
  const displayName = typeof object.displayName === "string" ? object.displayName.trim() : "";
  if (!displayName) {
    throw new Error("项目描述文件中的 displayName 不能为空。");
  }

  const scriptingObject = readObject(object.scripting) ?? {};
  const enabled = scriptingObject.enabled === true;
  const projectFile = typeof scriptingObject.projectFile === "string" ? scriptingObject.projectFile.trim() : "";
  const assemblyName = typeof scriptingObject.assemblyName === "string" ? scriptingObject.assemblyName.trim() : "";
  if (enabled && (!isSafeRelativePath(projectFile) || !assemblyName)) {
    throw new Error("项目描述文件中的脚本配置无效。");
  }

  const descriptor: ProjectDescriptor = {
    schemaVersion: 1,
    projectId: uuidMatch[1].toLocaleLowerCase("en-US"),
    displayName,
    scripting: { enabled, projectFile: enabled ? projectFile : "", assemblyName: enabled ? assemblyName : "" },
    root,
    manifestPath,
  };
  if (typeof object.editorVersion === "string" && object.editorVersion.trim()) {
    descriptor.editorVersion = object.editorVersion.trim();
  }
  return descriptor;
}

export async function inspectProject(projectRoot: string): Promise<ProjectInspection> {
  const root = await normalizeAbsolutePath(projectRoot);
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return { health: "invalid", message: "项目根目录不存在或不可读取。", root };
    }
  } catch {
    return { health: "missing", message: "已登记的项目位置不存在，请重新定位。", root };
  }

  try {
    const descriptor = await loadDescriptor(root);
    if (!(await stat(path.join(root, "Assets"))).isDirectory()) {
      return { health: "invalid", message: "项目中没有 Assets 目录。", root };
    }
    if (descriptor.scripting.enabled) {
      const scriptProject = path.resolve(root, descriptor.scripting.projectFile);
      if (!isPathWithin(scriptProject, root)) {
        return { health: "invalid", message: "脚本项目路径超出了项目根目录。", root };
      }
      try {
        if (!(await stat(scriptProject)).isFile()) {
          throw new Error("not a file");
        }
      } catch {
        return { health: "invalid", message: "配置的 C# 项目文件缺失或不可读取。", root };
      }
    }
    return { health: "ready", message: "", descriptor, root };
  } catch (error) {
    return { health: "invalid", message: error instanceof Error ? error.message : String(error), root };
  }
}

export async function writeProjectDescriptor(descriptor: ProjectDescriptor, manifestPath: string): Promise<void> {
  const scripting: Record<string, unknown> = { enabled: descriptor.scripting.enabled };
  if (descriptor.scripting.enabled) {
    scripting.projectFile = toPortablePath(descriptor.scripting.projectFile);
    scripting.assemblyName = descriptor.scripting.assemblyName;
  }
  const document: Record<string, unknown> = {
    schemaVersion: descriptor.schemaVersion,
    projectId: descriptor.projectId,
    displayName: descriptor.displayName,
    scripting,
  };
  if (descriptor.editorVersion?.trim()) {
    document.editorVersion = descriptor.editorVersion.trim();
  }
  await writeFileAtomically(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
}
