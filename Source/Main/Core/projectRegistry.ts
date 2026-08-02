import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { writeFileAtomically } from "./atomicFile";
import { comparablePath, normalizeAbsolutePath, toPortablePath } from "./paths";
import type { ProjectDescriptor } from "./projectDescriptor";

export interface ProjectRecord {
  projectId: string;
  path: string;
  pinned: boolean;
  lastOpenedAt: string;
}

interface RegistryDocument {
  schemaVersion: 1;
  projects: ProjectRecord[];
}

export class ProjectRegistry {
  private records: ProjectRecord[] = [];

  public constructor(private readonly storagePath: string) {}

  public getRecords(): readonly ProjectRecord[] {
    return this.records;
  }

  public getRecord(projectPath: string): Readonly<ProjectRecord> | undefined {
    return this.find(projectPath);
  }

  public async load(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.storagePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.records = [];
        return;
      }
      throw new Error(`Could not read the project registry: ${error instanceof Error ? error.message : String(error)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`The project registry is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object" || (parsed as { schemaVersion?: unknown }).schemaVersion !== 1) {
      throw new Error("Unsupported project registry schema version.");
    }
    const values = Array.isArray((parsed as { projects?: unknown }).projects)
      ? (parsed as { projects: unknown[] }).projects
      : [];
    const restored: ProjectRecord[] = [];
    for (const value of values) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const record = value as Record<string, unknown>;
      if (typeof record.projectId !== "string" || typeof record.path !== "string" || !record.path.trim()) {
        continue;
      }
      restored.push({
        projectId: record.projectId.replaceAll("{", "").replaceAll("}", "").toLocaleLowerCase("en-US"),
        path: await normalizeAbsolutePath(record.path),
        pinned: record.pinned === true,
        lastOpenedAt: typeof record.lastOpenedAt === "string" ? record.lastOpenedAt : "",
      });
    }
    this.records = restored;
  }

  public async save(): Promise<void> {
    const document: RegistryDocument = {
      schemaVersion: 1,
      projects: this.records.map((record) => ({ ...record, path: toPortablePath(record.path) })),
    };
    await writeFileAtomically(this.storagePath, `${JSON.stringify(document, null, 2)}\n`);
  }

  public async addOrUpdate(descriptor: ProjectDescriptor): Promise<ProjectRecord> {
    const normalized = await normalizeAbsolutePath(descriptor.root);
    const found = this.records.find((record) => comparablePath(record.path) === comparablePath(normalized))
      ?? this.records.find((record) => record.projectId === descriptor.projectId);
    if (found) {
      found.projectId = descriptor.projectId;
      found.path = normalized;
      return found;
    }
    const record: ProjectRecord = {
      projectId: descriptor.projectId || randomUUID(),
      path: normalized,
      pinned: false,
      lastOpenedAt: "",
    };
    this.records.push(record);
    return record;
  }

  public remove(projectPath: string): boolean {
    const before = this.records.length;
    const comparable = comparablePath(projectPath);
    this.records = this.records.filter((record) => comparablePath(record.path) !== comparable);
    return this.records.length !== before;
  }

  public setPinned(projectPath: string, pinned: boolean): boolean {
    const record = this.find(projectPath);
    if (!record) {
      return false;
    }
    record.pinned = pinned;
    return true;
  }

  public markOpened(projectPath: string): boolean {
    const record = this.find(projectPath);
    if (!record) {
      return false;
    }
    record.lastOpenedAt = new Date().toISOString();
    return true;
  }

  public async relink(projectId: string, newPath: string): Promise<boolean> {
    const record = this.records.find((entry) => entry.projectId === projectId);
    if (!record) {
      return false;
    }
    record.path = await normalizeAbsolutePath(newPath);
    return true;
  }

  private find(projectPath: string): ProjectRecord | undefined {
    const comparable = comparablePath(projectPath);
    return this.records.find((record) => comparablePath(record.path) === comparable);
  }
}
