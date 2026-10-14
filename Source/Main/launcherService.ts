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
import { readProjectCover } from "./Core/projectCover";

function lastOpenedLabel(value: string): string {
  if (!value) {
    return "从未打开";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "从未打开";
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
    error: "未找到 CrownEditor，请在 Launcher 设置中指定可执行文件。",
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
      samples: await Promise.all(this.samples.map(async ({ id, displayName, description, category, sourceProject, root }) => ({
        id,
        displayName,
        description,
        category,
        scripting: sourceProject.scripting.enabled,
        // Preview belongs to the selected installation, never to an account's
        // writable sample copy. Use the same bounded read as project covers.
        coverDataUrl: await readProjectCover(root),
      }))),
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
      throw new Error("请选择有效的项目模板。");
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
      throw new Error("请选择有效的已安装示例。");
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
      child.once("error", (error) => reject(new Error(`无法启动 CrownEditor：${error.message}`)));
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
      throw new Error("该项目已不在项目列表中。");
    }
    return calculateDirectorySize(record.path);
  }

  public async deleteProject(
    projectRoot: string,
    deleteDirectory: (directory: string) => Promise<void>,
  ): Promise<void> {
    const record = this.registry.getRecord(projectRoot);
    if (!record) {
      throw new Error("该项目已不在项目列表中。");
    }
    const inspection = await inspectProject(record.path);
    if (inspection.health !== "ready") {
      throw new Error("只能永久删除有效的 Crown 项目。");
    }
    if (inspection.descriptor.projectId !== record.projectId) {
      throw new Error("项目标识与 Launcher 中的记录不再匹配。");
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
      throw new Error("项目位置涉及受保护目录，无法安全删除。");
    }

    await deleteDirectory(root);
    if (!this.registry.remove(root)) {
      throw new Error("项目文件已删除，但无法从 Launcher 中移除记录。");
    }
    await this.registry.save();
  }

  public async setPinned(projectRoot: string, pinned: boolean): Promise<void> {
    if (!this.registry.setPinned(projectRoot, pinned)) {
      throw new Error("该项目已不在项目列表中。");
    }
    await this.registry.save();
  }

  public async relinkProject(projectRoot: string, projectId: string, newRoot: string): Promise<ProjectView> {
    const inspection = await inspectProject(newRoot);
    if (inspection.health !== "ready") {
      throw new Error(inspection.message);
    }
    if (inspection.descriptor.projectId !== projectId) {
      throw new Error("所选文件夹属于另一个 Crown 项目。");
    }
    if (!await this.registry.relink(projectId, inspection.descriptor.root)) {
      throw new Error("无法重新关联缺失的项目记录。");
    }
    const record = this.registry.getRecords().find((entry) => entry.projectId === projectId);
    if (!record) {
      throw new Error("无法恢复重新关联后的项目记录。");
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
      coverDataUrl: descriptor && descriptor.projectId === record.projectId ? await readProjectCover(descriptor.root) : "",
    };
  }
}
