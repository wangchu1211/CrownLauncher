import type { WorkbenchHost } from "./workbench";

export type ProjectHealth = "ready" | "missing" | "invalid";

export interface ProjectView {
  projectId: string;
  name: string;
  path: string;
  health: ProjectHealth;
  message: string;
  pinned: boolean;
  lastOpenedAt: string;
  lastOpenedLabel: string;
  scripting: boolean;
  manifest: string;
  editorVersion: string;
}

export interface ProjectTemplateView {
  id: string;
  displayName: string;
  description: string;
  supportsScripting: boolean;
}

export interface ProjectSampleView {
  id: string;
  displayName: string;
  description: string;
  category: string;
  scripting: boolean;
}

export interface EditorInstallView {
  ready: boolean;
  executable: string;
  version: string;
  error: string;
}

export interface LauncherSettingsView {
  defaultProjectDirectory: string;
  editorExecutable: string;
}

export interface ProjectSizeView {
  bytes: number;
}

export interface LauncherSnapshot {
  projects: ProjectView[];
  templates: ProjectTemplateView[];
  samples: ProjectSampleView[];
  editor: EditorInstallView;
  settings: LauncherSettingsView;
}

export interface CreateProjectInput {
  displayName: string;
  parentDirectory: string;
  templateId: string;
  enableScripting: boolean;
}

export interface CreateSampleInput {
  displayName: string;
  parentDirectory: string;
  sampleId: string;
  openAfterCreate: boolean;
}

export interface SaveSettingsInput {
  defaultProjectDirectory: string;
  editorExecutable: string;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface CrownHost {
  workbench: WorkbenchHost;
  launcher: {
    getSnapshot(): Promise<Result<LauncherSnapshot>>;
    importProject(): Promise<Result<ProjectView | null>>;
    createProject(input: CreateProjectInput): Promise<Result<ProjectView>>;
    createSample(input: CreateSampleInput): Promise<Result<ProjectView>>;
    openProject(projectPath: string): Promise<Result<void>>;
    revealProject(projectPath: string): Promise<Result<void>>;
    getProjectSize(projectPath: string): Promise<Result<ProjectSizeView>>;
    removeProject(projectPath: string): Promise<Result<void>>;
    deleteProject(projectPath: string): Promise<Result<void>>;
    relinkProject(projectPath: string, projectId: string): Promise<Result<ProjectView | null>>;
    setPinned(projectPath: string, pinned: boolean): Promise<Result<void>>;
    chooseDirectory(initialDirectory: string): Promise<Result<string | null>>;
    chooseEditorExecutable(initialPath: string): Promise<Result<string | null>>;
    saveSettings(input: SaveSettingsInput): Promise<Result<void>>;
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizedChanged(listener: (maximized: boolean) => void): () => void;
  };
}
