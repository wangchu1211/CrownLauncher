import { contextBridge, ipcRenderer } from "electron";
import type { CrownHost } from "../Shared/contracts";

const crownHost: CrownHost = {
  workbench: {
    artifact: (workspace, id) => ipcRenderer.invoke("workbench:artifact", workspace, id),
    launchArtifact: (workspace, id, project, fingerprint) => ipcRenderer.invoke("workbench:launch-artifact", workspace, id, project, fingerprint),
    copyDiagnostics: (workspace, id) => ipcRenderer.invoke("workbench:copy-diagnostics", workspace, id),
    getWorkspaces: () => ipcRenderer.invoke("workbench:workspaces"),
    chooseWorkspace: () => ipcRenderer.invoke("workbench:choose-workspace"),
    connect: workspace => ipcRenderer.invoke("workbench:connect", workspace),
    describe: request => ipcRenderer.invoke("workbench:describe", request),
    start: request => ipcRenderer.invoke("workbench:start", request),
    history: workspace => ipcRenderer.invoke("workbench:history", workspace),
    job: (workspace, id) => ipcRenderer.invoke("workbench:job", workspace, id),
    cancel: (workspace, id) => ipcRenderer.invoke("workbench:cancel", workspace, id),
    reveal: (workspace, id, item) => ipcRenderer.invoke("workbench:reveal", workspace, id, item),
  },
  launcher: {
    getSnapshot: () => ipcRenderer.invoke("launcher:get-snapshot"),
    importProject: () => ipcRenderer.invoke("launcher:import-project"),
    createProject: (input) => ipcRenderer.invoke("launcher:create-project", input),
    createSample: (input) => ipcRenderer.invoke("launcher:create-sample", input),
    openProject: (projectPath) => ipcRenderer.invoke("launcher:open-project", projectPath),
    revealProject: (projectPath) => ipcRenderer.invoke("launcher:reveal-project", projectPath),
    getProjectSize: (projectPath) => ipcRenderer.invoke("launcher:get-project-size", projectPath),
    removeProject: (projectPath) => ipcRenderer.invoke("launcher:remove-project", projectPath),
    deleteProject: (projectPath) => ipcRenderer.invoke("launcher:delete-project", projectPath),
    relinkProject: (projectPath, projectId) => ipcRenderer.invoke("launcher:relink-project", projectPath, projectId),
    setPinned: (projectPath, pinned) => ipcRenderer.invoke("launcher:set-pinned", projectPath, pinned),
    chooseDirectory: (initialDirectory) => ipcRenderer.invoke("launcher:choose-directory", initialDirectory),
    chooseEditorExecutable: (initialPath) => ipcRenderer.invoke("launcher:choose-editor", initialPath),
    saveSettings: (input) => ipcRenderer.invoke("launcher:save-settings", input),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizedChanged: (listener) => {
      const callback = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized);
      ipcRenderer.on("window:maximized-changed", callback);
      return () => ipcRenderer.removeListener("window:maximized-changed", callback);
    },
  },
};

contextBridge.exposeInMainWorld("crownHost", crownHost);
