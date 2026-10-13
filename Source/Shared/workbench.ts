import type { Result } from "./contracts";

export interface BuildCapabilities {
  schemaVersion: 1;
  workspace: string;
  configurations: string[];
  platforms: string[];
  features: { name: string; description: string; defaultValue: string }[];
  targets: { name: string; kind: string; outputKind: string; ruleSource: string; canRun: boolean; requiredFeatures: string[]; runRequiresProject?: boolean; runWorkingDirectory?: string }[];
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
  runProject?: string;
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
    runProject?: string | null;
  };
  cancellationRequested: boolean;
  progress: { phase: string; target: string; plannedActions: number | null; invalidatedActions: number | null } | null;
  result: { outcome: string; artifact: string; buildGraphFingerprint: string; actionGraphFingerprint: string } | null;
  timing?: { buildCompletedAt: string; buildDurationMs: number } | null;
  publication?: { schemaVersion: 1; targetIdentity: string; artifact: string; manifestSha256: string; actionGraphFingerprint: string } | null;
  diagnostics?: { schemaVersion: 1; firstErrors: string[]; productExitCode: number | null } | null;
  validation: "not-run";
  manualAcceptance: "pending";
  log: string | null;
  logPath: string;
  execution?: { schemaVersion: 1; graphs: ExecutionGraph[]; warnings: string[] } | null;
}

export type ActionState = "pending" | "running" | "succeeded" | "reused" | "prepared" | "failed" | "blocked" | "cancelled" | "interrupted" | "unknown";
export interface ExecutionAction {
  id: string;
  module: string;
  kind: string;
  label: string;
  dependencies: string[];
  state: ActionState;
  needsBuild: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
}
export interface ExecutionModule { id: string; name: string; kind: string; dependencies: string[] }
export interface ExecutionGraph {
  id: string;
  target: string;
  fingerprint: string;
  createdAt: string;
  modules: ExecutionModule[];
  actions: ExecutionAction[];
}

export interface BuildHistory {
  schemaVersion: 1;
  jobs: BuildJobView[];
  warnings: string[];
}

export interface WorkbenchHost {
  artifact(workspace: string, jobId: string): Promise<Result<BuildArtifact>>;
  launchArtifact(workspace: string, jobId: string, project?: string, fingerprint?: string): Promise<Result<{ processId: number }>>;
  copyDiagnostics(workspace: string, jobId: string): Promise<Result<void>>;
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

export interface BuildArtifact {
  path: string;
  directory: string;
  bytes: number | null;
  executableBytes: number | null;
  modifiedAt: string | null;
  measuredAt: string;
  canRun: boolean;
  runRequiresProject: boolean;
  buildCompletedAt: string | null;
  buildDurationMs: number | null;
  identity: {
    state: "matched" | "replaced" | "missing" | "damaged" | "unknown";
    detail: string;
    fingerprint: string | null;
    verifiedFiles: number;
    latestVerification?: { jobId: string; source: BuildCapabilities["source"]; configuration: string; features: Record<string, string>; completedAt: string | null };
  };
}
