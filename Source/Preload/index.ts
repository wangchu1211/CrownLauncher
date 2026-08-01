import { contextBridge, ipcRenderer } from "electron";
import type { CrownHost } from "../Shared/contracts";

const crownHost: CrownHost = {
  launcher: {
    getSnapshot: () => ipcRenderer.invoke("launcher:get-snapshot"),
    importProject: () => ipcRenderer.invoke("launcher:import-project"),
    createProject: (input) => ipcRenderer.invoke("launcher:create-project", input),
    createSample: (input) => ipcRenderer.invoke("launcher:create-sample", input),
    openProject: (projectPath) => ipcRenderer.invoke("launcher:open-project", projectPath),
    revealProject: (projectPath) => ipcRenderer.invoke("launcher:reveal-project", projectPath),
    removeProject: (projectPath) => ipcRenderer.invoke("launcher:remove-project", projectPath),
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
