import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectSampleInfo, ProjectTemplateInfo } from "../Source/Main/Core/catalogs";
import { createProject, createProjectFromSample, isValidProjectDirectoryName } from "../Source/Main/Core/projectCreator";
import { inspectProject, writeProjectDescriptor, type ProjectDescriptor } from "../Source/Main/Core/projectDescriptor";
import { ProjectRegistry } from "../Source/Main/Core/projectRegistry";
import { isSafeRelativePath } from "../Source/Main/Core/paths";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "crown-launcher-"));
  temporaryRoots.push(root);
  return root;
}

async function makeProject(root: string, name: string, projectId = randomUUID()): Promise<ProjectDescriptor> {
  await mkdir(path.join(root, "Assets"), { recursive: true });
  const descriptor: ProjectDescriptor = {
    schemaVersion: 1,
    projectId,
    displayName: name,
    scripting: { enabled: false, projectFile: "", assemblyName: "" },
    root,
    manifestPath: path.join(root, `${name}.crownproject`),
  };
  await writeProjectDescriptor(descriptor, descriptor.manifestPath);
  return descriptor;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project descriptor and validation", () => {
  it("round-trips a valid Unicode project and reports exceptional states", async () => {
    const root = await temporaryRoot();
    const valid = await makeProject(path.join(root, "Unicode 项目"), "Unicode 项目");
    const inspection = await inspectProject(valid.root);
    expect(inspection.health).toBe("ready");
    if (inspection.health === "ready") {
      expect(inspection.descriptor.displayName).toBe("Unicode 项目");
    }

    expect((await inspectProject(path.join(root, "missing"))).health).toBe("missing");
    const invalidRoot = path.join(root, "invalid");
    await mkdir(path.join(invalidRoot, "Assets"), { recursive: true });
    expect((await inspectProject(invalidRoot)).health).toBe("invalid");

    await writeProjectDescriptor({ ...valid, displayName: "Duplicate" }, path.join(valid.root, "Duplicate.crownproject"));
    expect((await inspectProject(valid.root)).health).toBe("invalid");
  });
});

describe("project registry", () => {
  it("saves atomically, preserves pin state, deduplicates by identity and never deletes files", async () => {
    const root = await temporaryRoot();
    const descriptor = await makeProject(path.join(root, "Project"), "Project");
    const registryPath = path.join(root, "config", "projects.json");
    const registry = new ProjectRegistry(registryPath);
    await registry.addOrUpdate(descriptor);
    expect(registry.setPinned(descriptor.root, true)).toBe(true);
    expect(registry.markOpened(descriptor.root)).toBe(true);
    await registry.save();

    const restored = new ProjectRegistry(registryPath);
    await restored.load();
    expect(restored.getRecords()).toHaveLength(1);
    expect(restored.getRecords()[0]?.pinned).toBe(true);

    const movedRoot = path.join(root, "Moved");
    const moved = await makeProject(movedRoot, "Project", descriptor.projectId);
    await restored.addOrUpdate(moved);
    await restored.save();
    expect(restored.getRecords()).toHaveLength(1);
    expect(restored.getRecords()[0]?.path).toBe(movedRoot);
    expect(await restored.relink(descriptor.projectId, descriptor.root)).toBe(true);
    expect(restored.getRecords()[0]?.pinned).toBe(true);
    expect(restored.getRecords()[0]?.lastOpenedAt).not.toBe("");
    expect(restored.remove(descriptor.root)).toBe(true);
    expect((await stat(descriptor.root)).isDirectory()).toBe(true);
  });
});

describe("project creation", () => {
  it("materializes a template transaction with C# scripting", async () => {
    const root = await temporaryRoot();
    const templateRoot = path.join(root, "Templates", "Blank3D");
    await mkdir(path.join(templateRoot, "Files", "ProjectSettings"), { recursive: true });
    await writeFile(path.join(templateRoot, "Files", "ProjectSettings", "BuildSettings.json"), "{\"project\":\"{{PROJECT_NAME}}\"}");
    const template: ProjectTemplateInfo = {
      id: "blank3d",
      displayName: "Blank 3D",
      description: "A compact Crown 3D project.",
      supportsScripting: true,
      root: templateRoot,
      directories: ["Assets", "Assets/Scripts", "ProjectSettings"],
      textFiles: ["ProjectSettings/BuildSettings.json"],
    };
    const parent = path.join(root, "Created");
    await mkdir(parent);
    const created = await createProject({
      displayName: "外部 Demo",
      parentDirectory: parent,
      template,
      enableScripting: true,
    });
    expect((await inspectProject(created.root)).health).toBe("ready");
    expect((await stat(path.join(created.root, "外部 Demo.Scripts.csproj"))).isFile()).toBe(true);
    expect(await readFile(path.join(created.root, "ProjectSettings", "BuildSettings.json"), "utf8")).toContain("外部 Demo");
    expect(isValidProjectDirectoryName("../escape")).toBe(false);
    expect(isSafeRelativePath("C:escape")).toBe(false);
  });

  it("creates an independent writable sample and excludes generated content", async () => {
    const root = await temporaryRoot();
    const source = await makeProject(path.join(root, "Samples", "LookDev"), "LookDev Gallery");
    await mkdir(path.join(source.root, "Assets", "Levels"), { recursive: true });
    await writeFile(path.join(source.root, "Assets", "Levels", "LookDev.level"), "sample-level");
    await mkdir(path.join(source.root, "Library"));
    await writeFile(path.join(source.root, "Library", "cache.ccd"), "generated");
    await writeFile(path.join(source.root, "sample.json"), "{}");
    await writeFile(path.join(source.root, "CMakeLists.txt"), "sample-build-only");
    const sample: ProjectSampleInfo = {
      id: "lookdev-gallery",
      displayName: "LookDev Gallery",
      description: "Feature gallery",
      category: "Engine Features",
      root: source.root,
      sourceProject: source,
    };
    const parent = path.join(root, "CreatedSamples");
    await mkdir(parent);
    const created = await createProjectFromSample({ displayName: "My LookDev", parentDirectory: parent, sample });
    expect(created.projectId).not.toBe(source.projectId);
    expect(created.displayName).toBe("My LookDev");
    expect((await stat(path.join(created.root, "Assets", "Levels", "LookDev.level"))).isFile()).toBe(true);
    await expect(stat(path.join(created.root, "Library"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(created.root, "sample.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(created.root, "CMakeLists.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
