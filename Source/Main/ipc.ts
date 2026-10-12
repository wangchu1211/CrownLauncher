import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { rm } from "node:fs/promises";
import type { CreateProjectInput, CreateSampleInput, Result, SaveSettingsInput } from "../Shared/contracts";
import { LauncherService } from "./launcherService";
import { WorkbenchService } from "./workbenchService";

function result<T>(operation: () => Promise<T>): Promise<Result<T>> {
  return operation()
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }));
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function parseCreateProject(value: unknown): CreateProjectInput {
  const input = value as Partial<CreateProjectInput> | null;
  return {
    displayName: requireText(input?.displayName, "Project name"),
    parentDirectory: requireText(input?.parentDirectory, "Project location"),
    templateId: requireText(input?.templateId, "Template"),
    enableScripting: requireBoolean(input?.enableScripting, "Scripting option"),
  };
}

function parseCreateSample(value: unknown): CreateSampleInput {
  const input = value as Partial<CreateSampleInput> | null;
  return {
    displayName: requireText(input?.displayName, "Project name"),
    parentDirectory: requireText(input?.parentDirectory, "Project location"),
    sampleId: requireText(input?.sampleId, "Sample"),
    openAfterCreate: requireBoolean(input?.openAfterCreate, "Open option"),
  };
}

export function registerIpc(window: BrowserWindow, service: LauncherService, workbench: WorkbenchService): void {
  ipcMain.handle("workbench:workspaces", () => result(() => workbench.workspaces()));
  ipcMain.handle("workbench:choose-workspace", () => result(async () => {
    const selection = await dialog.showOpenDialog(window, { title: "Choose CrownEngine source workspace", properties: ["openDirectory", "dontAddToRecent"] });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
  }));
  ipcMain.handle("workbench:connect", (_event, value: unknown) => result(() => workbench.connect(requireText(value, "Workspace"))));
  ipcMain.handle("workbench:describe", (_event, value: unknown) => result(() => workbench.describe(value)));
  ipcMain.handle("workbench:start", (_event, value: unknown) => result(() => workbench.start(value)));
  ipcMain.handle("workbench:history", (_event, workspace: unknown) => result(() => workbench.history(requireText(workspace, "Workspace"))));
  ipcMain.handle("workbench:job", (_event, workspace: unknown, id: unknown) => result(() => workbench.job(requireText(workspace, "Workspace"), requireText(id, "Task ID"))));
  ipcMain.handle("workbench:cancel", (_event, workspace: unknown, id: unknown) => result(() => workbench.cancel(requireText(workspace, "Workspace"), requireText(id, "Task ID"))));
  ipcMain.handle("workbench:reveal", (_event, workspace: unknown, id: unknown, item: unknown) => result(async () => {
    if (item !== "log" && item !== "artifact") throw new Error("Unsupported task output.");
    shell.showItemInFolder(await workbench.revealPath(requireText(workspace, "Workspace"), requireText(id, "Task ID"), item));
  }));
  ipcMain.handle("launcher:get-snapshot", () => result(() => service.snapshot()));
  ipcMain.handle("launcher:import-project", () => result(async () => {
    const selection = await dialog.showOpenDialog(window, {
      title: "Import Crown Project",
      defaultPath: (await service.snapshot()).settings.defaultProjectDirectory,
      properties: ["openDirectory", "dontAddToRecent"],
    });
    return selection.canceled || !selection.filePaths[0]
      ? null
      : service.importProject(selection.filePaths[0]);
  }));
  ipcMain.handle("launcher:create-project", (_event, value: unknown) => result(() => service.createProject(parseCreateProject(value))));
  ipcMain.handle("launcher:create-sample", (_event, value: unknown) => result(() => service.createSample(parseCreateSample(value))));
  ipcMain.handle("launcher:open-project", (_event, value: unknown) => result(() => service.openProject(requireText(value, "Project path"))));
  ipcMain.handle("launcher:reveal-project", (_event, value: unknown) => result(async () => {
    const error = await shell.openPath(requireText(value, "Project path"));
    if (error) {
      throw new Error(error);
    }
  }));
  ipcMain.handle("launcher:get-project-size", (_event, value: unknown) => result(async () => ({
    bytes: await service.getProjectSize(requireText(value, "Project path")),
  })));
  ipcMain.handle("launcher:remove-project", (_event, value: unknown) => result(() => service.removeProject(requireText(value, "Project path"))));
  ipcMain.handle("launcher:delete-project", (_event, value: unknown) => result(() => service.deleteProject(
    requireText(value, "Project path"),
    (projectPath) => rm(projectPath, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 }),
  )));
  ipcMain.handle("launcher:set-pinned", (_event, projectPath: unknown, pinned: unknown) => result(() => service.setPinned(
    requireText(projectPath, "Project path"),
    requireBoolean(pinned, "Pinned state"),
  )));
  ipcMain.handle("launcher:relink-project", (_event, projectPath: unknown, projectId: unknown) => result(async () => {
    const selection = await dialog.showOpenDialog(window, {
      title: "Locate Crown Project",
      defaultPath: (await service.snapshot()).settings.defaultProjectDirectory,
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (selection.canceled || !selection.filePaths[0]) {
      return null;
    }
    return service.relinkProject(
      requireText(projectPath, "Project path"),
      requireText(projectId, "Project identity"),
      selection.filePaths[0],
    );
  }));
  ipcMain.handle("launcher:choose-directory", (_event, value: unknown) => result(async () => {
    const initialDirectory = requireText(value, "Initial directory");
    const selection = await dialog.showOpenDialog(window, {
      title: "Choose Project Location",
      ...(initialDirectory ? { defaultPath: initialDirectory } : {}),
      properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
    });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
  }));
  ipcMain.handle("launcher:choose-editor", (_event, value: unknown) => result(async () => {
    const initialPath = requireText(value, "Initial Editor path");
    const selection = await dialog.showOpenDialog(window, {
      title: "Choose CrownEditor",
      ...(initialPath ? { defaultPath: initialPath } : {}),
      properties: ["openFile", "dontAddToRecent"],
      ...(process.platform === "win32"
        ? { filters: [{ name: "CrownEditor", extensions: ["exe"] }] }
        : {}),
    });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
  }));
  ipcMain.handle("launcher:save-settings", (_event, value: unknown) => result(() => {
    const input = value as Partial<SaveSettingsInput> | null;
    return service.saveSettings({
      defaultProjectDirectory: requireText(input?.defaultProjectDirectory, "Default project directory"),
      editorExecutable: requireText(input?.editorExecutable, "Editor executable"),
    });
  }));

  ipcMain.handle("window:minimize", () => window.minimize());
  ipcMain.handle("window:toggle-maximize", () => window.isMaximized() ? window.unmaximize() : window.maximize());
  ipcMain.handle("window:close", () => window.close());
  ipcMain.handle("window:is-maximized", () => window.isMaximized());
}
