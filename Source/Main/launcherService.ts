import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  CreateProjectInput,
  CreateSampleInput,
  LauncherSnapshot,
  ProjectView,
  SaveSettingsInput,
} from "../Shared/contracts";
import { loadProjectSamples, loadProjectTemplates, type ProjectSampleInfo, type ProjectTemplateInfo } from "./Core/catalogs";
import { calculateDirectorySize } from "./Core/directorySize";
import { buildEditorLaunchArguments } from "./Core/editorLaunch";
import { resolveEditorInstall, type EditorInstall } from "./Core/editorInstall";
import { createProject, createProjectFromSample } from "./Core/projectCreator";
import { inspectProject } from "./Core/projectDescriptor";
import { ProjectRegistry, type ProjectRecord } from "./Core/projectRegistry";
import { SettingsStore } from "./Core/settingsStore";
import { isPathWithin } from "./Core/paths";

function lastOpenedLabel(value: string): string {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}  ${get("hour")}:${get("minute")}`;
}

export class LauncherService {
  private readonly registry: ProjectRegistry;
  private readonly settings: SettingsStore;
  private editor: EditorInstall = {
    root: "",
    executable: "",
    templatesRoot: "",
    samplesRoot: "",
    displayVersion: "Current",
    error: "CrownEditor was not found. Configure its executable in Launcher Settings.",
  };
  private templates: ProjectTemplateInfo[] = [];
  private samples: ProjectSampleInfo[] = [];

  public constructor(
    private readonly configDirectory: string,
    private readonly applicationDirectory: string,
    registryOverride = "",
  ) {
    this.registry = new ProjectRegistry(registryOverride || path.join(configDirectory, "projects.json"));
    this.settings = new SettingsStore(path.join(configDirectory, "settings.json"));
  }

  public async initialize(): Promise<void> {
    await this.settings.load();
    await mkdir(this.settings.get().defaultProjectDirectory, { recursive: true });
    await this.registry.load();
    await this.refreshInstall();
  }

  public async snapshot(): Promise<LauncherSnapshot> {
    await this.refreshInstall();
    const projects = await Promise.all(this.registry.getRecords().map((record) => this.toProjectView(record)));
    projects.sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }
      if (left.lastOpenedAt !== right.lastOpenedAt) {
        return right.lastOpenedAt.localeCompare(left.lastOpenedAt);
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
    const settings = this.settings.get();
    return {
      projects,
      templates: this.templates.map(({ id, displayName, description, supportsScripting }) => ({
        id,
        displayName,
        description,
        supportsScripting,
      })),
      samples: this.samples.map(({ id, displayName, description, category, sourceProject }) => ({
        id,
        displayName,
        description,
        category,
        scripting: sourceProject.scripting.enabled,
      })),
      editor: {
        ready: !this.editor.error,
        executable: this.editor.executable || settings.editorExecutable,
        version: this.editor.displayVersion,
        error: this.editor.error,
      },
      settings: {
        defaultProjectDirectory: settings.defaultProjectDirectory,
        editorExecutable: settings.editorExecutable,
      },
    };
  }

  public async importProject(projectRoot: string): Promise<ProjectView> {
    const inspection = await inspectProject(projectRoot);
    if (inspection.health !== "ready") {
      throw new Error(inspection.message);
    }
    const record = await this.registry.addOrUpdate(inspection.descriptor);
    await this.registry.save();
    return this.toProjectView(record);
  }

  public async createProject(input: CreateProjectInput): Promise<ProjectView> {
    await this.refreshInstall();
    const template = this.templates.find((entry) => entry.id === input.templateId);
    if (!template) {
      throw new Error("Choose a valid project template.");
    }
    const descriptor = await createProject({ ...input, template });
    const record = await this.registry.addOrUpdate(descriptor);
    await this.registry.save();
    return this.toProjectView(record);
  }

  public async createSample(input: CreateSampleInput): Promise<ProjectView> {
    await this.refreshInstall();
    const sample = this.samples.find((entry) => entry.id === input.sampleId);
    if (!sample) {
      throw new Error("Choose a valid installed sample.");
    }
    const descriptor = await createProjectFromSample({
      displayName: input.displayName,
      parentDirectory: input.parentDirectory,
      sample,
    });
    const record = await this.registry.addOrUpdate(descriptor);
    await this.registry.save();
    const view = await this.toProjectView(record);
    if (input.openAfterCreate && !this.editor.error) {
      // A fresh sample copy has no Editor session state. Open the catalog's
      // authored entry level instead of relying on generic project fallback.
      await this.openProject(view.path, sample.startupLevel);
    }
    return view;
  }

  public async openProject(projectRoot: string, startupLevel = ""): Promise<void> {
    const inspection = await inspectProject(projectRoot);
    if (inspection.health !== "ready") {
      throw new Error(inspection.message);
    }
    await this.refreshInstall();
    if (this.editor.error) {
      throw new Error(this.editor.error);
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.editor.executable, buildEditorLaunchArguments(
        inspection.descriptor.root,
        process.pid,
        startupLevel,
      ), {
        cwd: inspection.descriptor.root,
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      child.once("error", (error) => reject(new Error(`CrownEditor could not be started: ${error.message}`)));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    this.registry.markOpened(projectRoot);
    await this.registry.save();
  }

  public async removeProject(projectRoot: string): Promise<void> {
    if (this.registry.remove(projectRoot)) {
      await this.registry.save();
    }
  }

  public async getProjectSize(projectRoot: string): Promise<number> {
    const record = this.registry.getRecord(projectRoot);
    if (!record) {
      throw new Error("The project is no longer registered.");
    }
    return calculateDirectorySize(record.path);
  }

  public async deleteProject(
    projectRoot: string,
    deleteDirectory: (directory: string) => Promise<void>,
  ): Promise<void> {
    const record = this.registry.getRecord(projectRoot);
    if (!record) {
      throw new Error("The project is no longer registered.");
    }
    const inspection = await inspectProject(record.path);
    if (inspection.health !== "ready") {
      throw new Error("Only a valid Crown project can be permanently deleted.");
    }
    if (inspection.descriptor.projectId !== record.projectId) {
      throw new Error("The project identity no longer matches its Launcher record.");
    }

    const root = inspection.descriptor.root;
    // WHY: a misplaced but valid manifest could make a shared or application
    // directory look like a project. Permanent deletion must reject those
    // broad roots even after identity validation. Remove this guard only if a
    // future deletion service is sandboxed to independently owned project roots.
    const broadProtectedRoots = [
      path.parse(root).root,
      homedir(),
      this.settings.get().defaultProjectDirectory,
    ];
    const isolatedProtectedRoots = [this.configDirectory, this.applicationDirectory];
    const containsBroadRoot = broadProtectedRoots.some((protectedRoot) => isPathWithin(protectedRoot, root));
    const overlapsApplicationData = isolatedProtectedRoots.some((protectedRoot) =>
      isPathWithin(protectedRoot, root) || isPathWithin(root, protectedRoot));
    if (containsBroadRoot || overlapsApplicationData) {
      throw new Error("The project location is too broad to delete safely.");
    }

    await deleteDirectory(root);
    if (!this.registry.remove(root)) {
      throw new Error("The deleted project record could not be removed from Launcher.");
    }
    await this.registry.save();
  }

  public async setPinned(projectRoot: string, pinned: boolean): Promise<void> {
    if (!this.registry.setPinned(projectRoot, pinned)) {
      throw new Error("The project is no longer registered.");
    }
    await this.registry.save();
  }

  public async relinkProject(projectRoot: string, projectId: string, newRoot: string): Promise<ProjectView> {
    const inspection = await inspectProject(newRoot);
    if (inspection.health !== "ready") {
      throw new Error(inspection.message);
    }
    if (inspection.descriptor.projectId !== projectId) {
      throw new Error("The selected folder belongs to a different Crown project.");
    }
    if (!await this.registry.relink(projectId, inspection.descriptor.root)) {
      throw new Error("The missing project record could not be relinked.");
    }
    const record = this.registry.getRecords().find((entry) => entry.projectId === projectId);
    if (!record) {
      throw new Error("The relinked project record could not be restored.");
    }
    await this.registry.save();
    return this.toProjectView(record);
  }

  public async saveSettings(input: SaveSettingsInput): Promise<void> {
    await this.settings.update(input);
    await this.refreshInstall();
  }

  private async refreshInstall(): Promise<void> {
    this.editor = await resolveEditorInstall(this.applicationDirectory, this.settings.get().editorExecutable);
    this.templates = [];
    this.samples = [];
    if (this.editor.error) {
      return;
    }
    this.templates = await loadProjectTemplates(this.editor.templatesRoot);
    this.samples = await loadProjectSamples(this.editor.samplesRoot);
  }

  private async toProjectView(record: ProjectRecord): Promise<ProjectView> {
    const inspection = await inspectProject(record.path);
    const descriptor = inspection.health === "ready" ? inspection.descriptor : null;
    return {
      projectId: record.projectId,
      name: descriptor?.displayName ?? path.basename(record.path),
      path: record.path,
      health: inspection.health,
      message: inspection.message,
      pinned: record.pinned,
      lastOpenedAt: record.lastOpenedAt,
      lastOpenedLabel: lastOpenedLabel(record.lastOpenedAt),
      scripting: descriptor?.scripting.enabled ?? false,
      manifest: descriptor?.manifestPath ?? "",
      editorVersion: descriptor?.editorVersion ?? "Current",
    };
  }
}
