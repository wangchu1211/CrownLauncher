import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectSamples, type ProjectTemplateInfo } from "../Source/Main/Core/catalogs";
import { calculateDirectorySize } from "../Source/Main/Core/directorySize";
import { buildEditorLaunchArguments } from "../Source/Main/Core/editorLaunch";
import { createProject, createProjectFromSample, isValidProjectDirectoryName } from "../Source/Main/Core/projectCreator";
import { inspectProject, writeProjectDescriptor, type ProjectDescriptor } from "../Source/Main/Core/projectDescriptor";
import { ProjectRegistry } from "../Source/Main/Core/projectRegistry";
import { isSafeRelativePath } from "../Source/Main/Core/paths";
import { LauncherService } from "../Source/Main/launcherService";

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

describe("project details and deletion", () => {
  it("calculates the complete directory size without following symlinks", async () => {
    const root = await temporaryRoot();
    const external = await temporaryRoot();
    await mkdir(path.join(root, "Nested"));
    await writeFile(path.join(root, "root.bin"), Buffer.alloc(7));
    await writeFile(path.join(root, "Nested", "child.bin"), Buffer.alloc(13));
    await writeFile(path.join(external, "external.bin"), Buffer.alloc(100));
    await symlink(external, path.join(root, "External"), process.platform === "win32" ? "junction" : "dir");
    expect(await calculateDirectorySize(root)).toBe(20);
  });

  it("permanently deletes a valid project before removing its registry record", async () => {
    const root = await temporaryRoot();
    const config = path.join(root, "Config");
    const projects = path.join(root, "Projects");
    await mkdir(config, { recursive: true });
    await mkdir(projects, { recursive: true });
    await writeFile(path.join(config, "settings.json"), `${JSON.stringify({
      schemaVersion: 1,
      defaultProjectDirectory: projects,
      editorExecutable: "",
    })}\n`);
    const service = new LauncherService(config, path.join(root, "Application"));
    await service.initialize();

    await service.importProject((await makeProject(projects, "Projects")).root);
    let broadDeleteAttempted = false;
    await expect(service.deleteProject(projects, async () => {
      broadDeleteAttempted = true;
    })).rejects.toThrow("too broad");
    expect(broadDeleteAttempted).toBe(false);
    await service.removeProject(projects);

    const first = await makeProject(path.join(projects, "First"), "First");
    await writeFile(path.join(first.root, "Assets", "data.bin"), Buffer.alloc(31));
    await service.importProject(first.root);
    expect(await service.getProjectSize(first.root)).toBeGreaterThanOrEqual(31);

    await service.deleteProject(first.root, (projectPath) => rm(projectPath, { recursive: true }));
    expect((await service.snapshot()).projects).toHaveLength(0);
    await expect(stat(first.root)).rejects.toMatchObject({ code: "ENOENT" });

    const second = await makeProject(path.join(projects, "Second"), "Second");
    await service.importProject(second.root);
    await expect(service.deleteProject(second.root, async () => {
      throw new Error("Permanent delete failed");
    })).rejects.toThrow("Permanent delete failed");
    expect((await service.snapshot()).projects.map((project) => project.path)).toContain(second.root);
    expect((await stat(second.root)).isDirectory()).toBe(true);
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
    await writeFile(path.join(source.root, "sample.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "lookdev-gallery",
      displayName: "LookDev Sample",
      description: "Feature gallery",
      category: "Engine Features",
      startupLevel: "Assets/Levels/LookDev.level",
    })}\n`);
    await writeFile(path.join(source.root, "CMakeLists.txt"), "sample-build-only");
    const samples = await loadProjectSamples(path.join(root, "Samples"));
    expect(samples).toHaveLength(1);
    const sample = samples[0];
    expect(sample.startupLevel).toBe("Assets/Levels/LookDev.level");
    const parent = path.join(root, "CreatedSamples");
    await mkdir(parent);
    const created = await createProjectFromSample({ displayName: "My LookDev", parentDirectory: parent, sample });
    expect(created.projectId).not.toBe(source.projectId);
    expect(created.displayName).toBe("My LookDev");
    expect((await stat(path.join(created.root, "Assets", "Levels", "LookDev.level"))).isFile()).toBe(true);
    await expect(stat(path.join(created.root, "Library"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(created.root, "sample.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(created.root, "CMakeLists.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(buildEditorLaunchArguments(created.root, 42, sample.startupLevel)).toEqual([
      "--project", created.root, "--launcher-pid", "42", "--load", "Assets/Levels/LookDev.level",
    ]);
    expect(() => buildEditorLaunchArguments(created.root, 42, "../escape.level")).toThrow("safe project-relative path");
  });
});
