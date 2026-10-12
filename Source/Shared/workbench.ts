import type { Result } from "./contracts";

export interface BuildCapabilities {
  schemaVersion: 1;
  workspace: string;
  configurations: string[];
  platforms: string[];
  features: { name: string; description: string; defaultValue: string }[];
  targets: { name: string; kind: string; outputKind: string; ruleSource: string; canRun: boolean; requiredFeatures: string[] }[];
  source: { branch: string; commit: string; dirty: boolean; workingTree: string };
  runtime: { dotnet: string; assembly: string };
}

export interface BuildRequest {
  workspace: string;
  target: string;
  configuration: string;
  platform: string;
  features: Record<string, string>;
  jobs: number;
  operation: "build" | "run";
}

export interface BuildDescription {
  schemaVersion: 1;
  target: string;
  configuration: string;
  features: Record<string, string>;
  fingerprint: string;
  modules: { name: string; sources: number }[];
  dependencies: string[];
  requiredFeatures: string[];
}

export interface BuildJobView {
  schemaVersion: 1;
  job: {
    id: string;
    workspace: string;
    target: string;
    command: "build" | "run";
    configuration: string;
    platform: string;
    features: Record<string, string>;
    jobs: number;
    origin: "cli" | "launcher";
    source: BuildCapabilities["source"];
    state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    heartbeatAt: string | null;
    exitCode: number | null;
    error: string | null;
  };
  cancellationRequested: boolean;
  progress: { phase: string; target: string; plannedActions: number | null; invalidatedActions: number | null } | null;
  result: { outcome: string; artifact: string; buildGraphFingerprint: string; actionGraphFingerprint: string } | null;
  validation: "not-run";
  manualAcceptance: "pending";
  log: string | null;
  logPath: string;
}

export interface BuildHistory {
  schemaVersion: 1;
  jobs: BuildJobView[];
  warnings: string[];
}

export interface WorkbenchHost {
  getWorkspaces(): Promise<Result<string[]>>;
  chooseWorkspace(): Promise<Result<string | null>>;
  connect(workspace: string): Promise<Result<BuildCapabilities>>;
  describe(request: BuildRequest): Promise<Result<BuildDescription>>;
  start(request: BuildRequest): Promise<Result<{ schemaVersion: 1; jobId: string }>>;
  history(workspace: string): Promise<Result<BuildHistory>>;
  job(workspace: string, jobId: string): Promise<Result<BuildJobView>>;
  cancel(workspace: string, jobId: string): Promise<Result<void>>;
  reveal(workspace: string, jobId: string, item: "log" | "artifact"): Promise<Result<void>>;
}
