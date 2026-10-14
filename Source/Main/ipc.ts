import { BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import { rm } from "node:fs/promises";
import type { CreateProjectInput, CreateSampleInput, Result, SaveSettingsInput } from "../Shared/contracts";
import { LauncherService } from "./launcherService";
import { WorkbenchService } from "./workbenchService";
import { formatBuildDiagnostic } from "../Shared/buildDiagnostics";

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
    throw new Error(`${label}必须是文本。`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label}必须是布尔值。`);
  }
  return value;
}

function parseCreateProject(value: unknown): CreateProjectInput {
  const input = value as Partial<CreateProjectInput> | null;
  return {
    displayName: requireText(input?.displayName, "项目名称"),
    parentDirectory: requireText(input?.parentDirectory, "项目位置"),
    templateId: requireText(input?.templateId, "模板"),
    enableScripting: requireBoolean(input?.enableScripting, "脚本选项"),
  };
}

function parseCreateSample(value: unknown): CreateSampleInput {
  const input = value as Partial<CreateSampleInput> | null;
  return {
    displayName: requireText(input?.displayName, "项目名称"),
    parentDirectory: requireText(input?.parentDirectory, "项目位置"),
    sampleId: requireText(input?.sampleId, "示例"),
    openAfterCreate: requireBoolean(input?.openAfterCreate, "打开选项"),
  };
}

export function registerIpc(window: BrowserWindow, service: LauncherService, workbench: WorkbenchService): void {
  ipcMain.handle("workbench:artifact", (_event, workspace: unknown, id: unknown) => result(() => workbench.artifact(requireText(workspace, "工作区"), requireText(id, "任务 ID"))));
  ipcMain.handle("workbench:launch-artifact", (_event, workspace: unknown, id: unknown, project: unknown, fingerprint: unknown) => result(() => workbench.launchArtifact(requireText(workspace, "工作区"), requireText(id, "任务 ID"), project === undefined ? undefined : requireText(project, "项目"), requireText(fingerprint, "发布指纹"))));
  ipcMain.handle("workbench:copy-diagnostics", (_event, workspace: unknown, id: unknown) => result(async () => {
    clipboard.writeText(formatBuildDiagnostic(await workbench.job(requireText(workspace, "工作区"), requireText(id, "任务 ID"))));
  }));
  ipcMain.handle("workbench:workspaces", () => result(() => workbench.workspaces()));
  ipcMain.handle("workbench:choose-workspace", () => result(async () => {
    const selection = await dialog.showOpenDialog(window, { title: "选择 CrownEngine 源码工作区", buttonLabel: "选择工作区", properties: ["openDirectory", "dontAddToRecent"] });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
  }));
  ipcMain.handle("workbench:connect", (_event, value: unknown) => result(() => workbench.connect(requireText(value, "工作区"))));
  ipcMain.handle("workbench:describe", (_event, value: unknown) => result(() => workbench.describe(value)));
  ipcMain.handle("workbench:start", (_event, value: unknown) => result(() => workbench.start(value)));
  ipcMain.handle("workbench:history", (_event, workspace: unknown) => result(() => workbench.history(requireText(workspace, "工作区"))));
  ipcMain.handle("workbench:job", (_event, workspace: unknown, id: unknown) => result(() => workbench.job(requireText(workspace, "工作区"), requireText(id, "任务 ID"))));
  ipcMain.handle("workbench:cancel", (_event, workspace: unknown, id: unknown) => result(() => workbench.cancel(requireText(workspace, "工作区"), requireText(id, "任务 ID"))));
  ipcMain.handle("workbench:reveal", (_event, workspace: unknown, id: unknown, item: unknown) => result(async () => {
    if (item !== "log" && item !== "artifact") throw new Error("不支持的任务输出类型。");
    shell.showItemInFolder(await workbench.revealPath(requireText(workspace, "工作区"), requireText(id, "任务 ID"), item));
  }));
  ipcMain.handle("launcher:get-snapshot", () => result(() => service.snapshot()));
  ipcMain.handle("launcher:import-project", () => result(async () => {
    const selection = await dialog.showOpenDialog(window, {
      title: "导入 Crown 项目",
      buttonLabel: "导入项目",
      defaultPath: (await service.snapshot()).settings.defaultProjectDirectory,
      properties: ["openDirectory", "dontAddToRecent"],
    });
    return selection.canceled || !selection.filePaths[0]
      ? null
      : service.importProject(selection.filePaths[0]);
  }));
  ipcMain.handle("launcher:create-project", (_event, value: unknown) => result(() => service.createProject(parseCreateProject(value))));
  ipcMain.handle("launcher:create-sample", (_event, value: unknown) => result(() => service.createSample(parseCreateSample(value))));
  ipcMain.handle("launcher:open-project", (_event, value: unknown) => result(() => service.openProject(requireText(value, "项目路径"))));
  ipcMain.handle("launcher:reveal-project", (_event, value: unknown) => result(async () => {
    const error = await shell.openPath(requireText(value, "项目路径"));
    if (error) {
      throw new Error(error);
    }
  }));
  ipcMain.handle("launcher:get-project-size", (_event, value: unknown) => result(async () => ({
    bytes: await service.getProjectSize(requireText(value, "项目路径")),
  })));
  ipcMain.handle("launcher:remove-project", (_event, value: unknown) => result(() => service.removeProject(requireText(value, "项目路径"))));
  ipcMain.handle("launcher:delete-project", (_event, value: unknown) => result(() => service.deleteProject(
    requireText(value, "项目路径"),
    (projectPath) => rm(projectPath, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 }),
  )));
  ipcMain.handle("launcher:set-pinned", (_event, projectPath: unknown, pinned: unknown) => result(() => service.setPinned(
    requireText(projectPath, "项目路径"),
    requireBoolean(pinned, "置顶状态"),
  )));
  ipcMain.handle("launcher:relink-project", (_event, projectPath: unknown, projectId: unknown) => result(async () => {
    const selection = await dialog.showOpenDialog(window, {
      title: "重新定位 Crown 项目",
      buttonLabel: "选择项目",
      defaultPath: (await service.snapshot()).settings.defaultProjectDirectory,
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (selection.canceled || !selection.filePaths[0]) {
      return null;
    }
    return service.relinkProject(
      requireText(projectPath, "项目路径"),
      requireText(projectId, "项目标识"),
      selection.filePaths[0],
    );
  }));
  ipcMain.handle("launcher:choose-directory", (_event, value: unknown) => result(async () => {
    const initialDirectory = requireText(value, "初始目录");
    const selection = await dialog.showOpenDialog(window, {
      title: "选择项目保存位置",
      buttonLabel: "选择此目录",
      ...(initialDirectory ? { defaultPath: initialDirectory } : {}),
      properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
    });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
  }));
  ipcMain.handle("launcher:choose-editor", (_event, value: unknown) => result(async () => {
    const initialPath = requireText(value, "初始 Editor 路径");
    const selection = await dialog.showOpenDialog(window, {
      title: "选择 CrownEditor",
      buttonLabel: "选择可执行文件",
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
      defaultProjectDirectory: requireText(input?.defaultProjectDirectory, "默认项目目录"),
      editorExecutable: requireText(input?.editorExecutable, "Editor 可执行文件"),
    });
  }));

  ipcMain.handle("window:minimize", () => window.minimize());
  ipcMain.handle("window:toggle-maximize", () => window.isMaximized() ? window.unmaximize() : window.maximize());
  ipcMain.handle("window:close", () => window.close());
  ipcMain.handle("window:is-maximized", () => window.isMaximized());
}
