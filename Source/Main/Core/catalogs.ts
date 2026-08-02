import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isSafeRelativePath } from "./paths";
import { inspectProject, type ProjectDescriptor } from "./projectDescriptor";

export interface ProjectTemplateInfo {
  id: string;
  displayName: string;
  description: string;
  supportsScripting: boolean;
  root: string;
  directories: string[];
  textFiles: string[];
}

export interface ProjectSampleInfo {
  id: string;
  displayName: string;
  description: string;
  category: string;
  startupLevel: string;
  root: string;
  sourceProject: ProjectDescriptor;
}

async function directoryNames(root: string): Promise<string[]> {
  try {
    if (!(await stat(root)).isDirectory()) {
      return [];
    }
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function stringArray(value: unknown, directoryName: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !isSafeRelativePath(entry.trim())) {
      throw new Error(`Project template ${directoryName} contains an unsafe path.`);
    }
    result.push(entry.trim());
  }
  return result;
}

export async function loadProjectTemplates(templatesRoot: string): Promise<ProjectTemplateInfo[]> {
  const directories = await directoryNames(templatesRoot);
  if (directories.length === 0) {
    return [];
  }
  const templates: ProjectTemplateInfo[] = [];
  for (const directoryName of directories) {
    const root = path.join(templatesRoot, directoryName);
    let object: Record<string, unknown>;
    try {
      object = JSON.parse(await readFile(path.join(root, "template.json"), "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = typeof object.id === "string" ? object.id.trim() : "";
    const displayName = typeof object.displayName === "string" ? object.displayName.trim() : "";
    if (!id || !displayName) {
      throw new Error(`Project template ${directoryName} is missing required metadata.`);
    }
    templates.push({
      id,
      displayName,
      description: typeof object.description === "string" ? object.description.trim() : "",
      supportsScripting: object.supportsScripting === true,
      root,
      directories: stringArray(object.directories, directoryName),
      textFiles: stringArray(object.textFiles, directoryName),
    });
  }
  return templates;
}

export async function loadProjectSamples(samplesRoot: string): Promise<ProjectSampleInfo[]> {
  const samples: ProjectSampleInfo[] = [];
  const ids = new Set<string>();
  for (const directoryName of await directoryNames(samplesRoot)) {
    const root = path.join(samplesRoot, directoryName);
    let object: Record<string, unknown>;
    try {
      object = JSON.parse(await readFile(path.join(root, "sample.json"), "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = typeof object.id === "string" ? object.id.trim() : "";
    const displayName = typeof object.displayName === "string" ? object.displayName.trim() : "";
    if (object.schemaVersion !== 1 || !id || !displayName || ids.has(id)) {
      throw new Error(`Sample ${directoryName} has invalid or duplicate metadata.`);
    }
    const startupLevel = typeof object.startupLevel === "string" ? object.startupLevel.trim() : "";
    if (startupLevel && !isSafeRelativePath(startupLevel)) {
      throw new Error(`Sample ${directoryName} contains an unsafe startup level.`);
    }
    if (startupLevel) {
      try {
        if (!(await stat(path.join(root, startupLevel))).isFile()) {
          throw new Error("not a file");
        }
      } catch {
        throw new Error(`Sample ${directoryName} startup level does not exist.`);
      }
    }
    const inspection = await inspectProject(root);
    if (inspection.health !== "ready") {
      throw new Error(`Sample ${directoryName} is not a valid Crown project: ${inspection.message}`);
    }
    ids.add(id);
    samples.push({
      id,
      displayName,
      description: typeof object.description === "string" ? object.description.trim() : "",
      category: typeof object.category === "string" ? object.category.trim() : "",
      startupLevel,
      root,
      sourceProject: inspection.descriptor,
    });
  }
  return samples;
}
