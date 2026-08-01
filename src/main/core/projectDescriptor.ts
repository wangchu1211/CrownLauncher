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
      throw new Error("The selected file is not a .crownproject file.");
    }
    manifestPath = requested;
    root = path.dirname(requested);
  } else if (requestedStat.isDirectory()) {
    const manifests = (await readdir(requested, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLocaleLowerCase("en-US") === ".crownproject")
      .map((entry) => path.join(requested, entry.name));
    if (manifests.length === 0) {
      throw new Error("The project does not contain a .crownproject file.");
    }
    if (manifests.length !== 1) {
      throw new Error("The project must contain exactly one .crownproject file.");
    }
    manifestPath = manifests[0] as string;
  } else {
    throw new Error("The selected project path is not a directory or file.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`The project manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const object = readObject(parsed);
  if (!object || object.schemaVersion !== 1) {
    throw new Error(`Unsupported project manifest schema version ${String(object?.schemaVersion ?? "unknown")}.`);
  }
  const uuidMatch = typeof object.projectId === "string" ? uuidPattern.exec(object.projectId) : null;
  if (!uuidMatch?.[1]) {
    throw new Error("The project manifest contains an invalid projectId.");
  }
  const displayName = typeof object.displayName === "string" ? object.displayName.trim() : "";
  if (!displayName) {
    throw new Error("The project manifest contains an empty displayName.");
  }

  const scriptingObject = readObject(object.scripting) ?? {};
  const enabled = scriptingObject.enabled === true;
  const projectFile = typeof scriptingObject.projectFile === "string" ? scriptingObject.projectFile.trim() : "";
  const assemblyName = typeof scriptingObject.assemblyName === "string" ? scriptingObject.assemblyName.trim() : "";
  if (enabled && (!isSafeRelativePath(projectFile) || !assemblyName)) {
    throw new Error("The project manifest contains an invalid scripting configuration.");
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
      return { health: "invalid", message: "The project root is not a readable directory.", root };
    }
  } catch {
    return { health: "missing", message: "The registered project location is missing.", root };
  }

  try {
    const descriptor = await loadDescriptor(root);
    if (!(await stat(path.join(root, "Assets"))).isDirectory()) {
      return { health: "invalid", message: "The project does not contain an Assets directory.", root };
    }
    if (descriptor.scripting.enabled) {
      const scriptProject = path.resolve(root, descriptor.scripting.projectFile);
      if (!isPathWithin(scriptProject, root)) {
        return { health: "invalid", message: "The script project escapes the project root.", root };
      }
      try {
        if (!(await stat(scriptProject)).isFile()) {
          throw new Error("not a file");
        }
      } catch {
        return { health: "invalid", message: "The configured C# project file is missing or unreadable.", root };
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
