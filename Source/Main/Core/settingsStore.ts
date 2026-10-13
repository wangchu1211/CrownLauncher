import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomically } from "./atomicFile";

export interface LauncherSettings {
  schemaVersion: 1;
  defaultProjectDirectory: string;
  editorExecutable: string;
}

function queryLegacyWindowsSetting(subkey: "editor" | "projects", valueName: string): string {
  if (process.platform !== "win32") {
    return "";
  }
  try {
    const key = `HKCU\\Software\\CrownEngine\\CrownLauncher\\${subkey}`;
    const bytes = execFileSync("reg.exe", ["query", key, "/v", valueName], {
      windowsHide: true,
    });
    // WHY: reg.exe writes through the active Windows console code page rather
    // than UTF-8. GB18030 covers the Simplified Chinese code pages used by
    // supported systems and preserves Unicode paths during one-time migration.
    const output = new TextDecoder("gb18030").decode(bytes);
    const line = output.split(/\r?\n/).find((candidate) => candidate.includes("REG_SZ"));
    return line?.split("REG_SZ")[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

export class SettingsStore {
  private value: LauncherSettings = {
    schemaVersion: 1,
    defaultProjectDirectory: path.join(homedir(), "CrownProjects"),
    editorExecutable: "",
  };

  public constructor(private readonly storagePath: string) {}

  public get(): LauncherSettings {
    return { ...this.value };
  }

  public async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.storagePath, "utf8")) as Partial<LauncherSettings>;
      if (parsed.schemaVersion !== 1) {
        throw new Error("Unsupported Launcher settings schema version.");
      }
      const restored: LauncherSettings = {
        schemaVersion: 1,
        defaultProjectDirectory: typeof parsed.defaultProjectDirectory === "string" && parsed.defaultProjectDirectory.trim()
          ? path.resolve(parsed.defaultProjectDirectory)
          : path.join(homedir(), "CrownProjects"),
        // Older builds normalized the empty auto-discovery setting to ".".
        // A directory cannot be an Editor executable; restore automatic mode.
        editorExecutable: typeof parsed.editorExecutable === "string" && parsed.editorExecutable.trim() && parsed.editorExecutable.trim() !== "."
          ? path.normalize(parsed.editorExecutable.trim()) : "",
      };
      // WHY: Electron migration builds before 0.2.0 decoded reg.exe output as
      // UTF-8 and could persist U+FFFD in non-ASCII home paths. Re-run the
      // legacy migration only for that unmistakably corrupted value.
      if (!restored.defaultProjectDirectory.includes("\uFFFD") && !restored.editorExecutable.includes("\uFFFD")) {
        this.value = restored;
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    // WHY: the Qt Launcher stored QSettings in the Windows registry. Migrate only
    // when the portable settings file is absent so Electron never overwrites a
    // user's later choice. Remove after all supported Qt builds are retired.
    const legacyDirectory = queryLegacyWindowsSetting("projects", "defaultDirectory");
    const legacyEditor = queryLegacyWindowsSetting("editor", "executable");
    if (legacyDirectory) {
      this.value.defaultProjectDirectory = path.resolve(legacyDirectory);
    }
    if (legacyEditor) {
      this.value.editorExecutable = path.normalize(legacyEditor);
    }
    await this.save();
  }

  public async update(input: Omit<LauncherSettings, "schemaVersion">): Promise<void> {
    try {
      if (!(await stat(input.defaultProjectDirectory)).isDirectory()) {
        throw new Error("not a directory");
      }
    } catch {
      throw new Error("The default project directory must exist.");
    }
    this.value = {
      schemaVersion: 1,
      defaultProjectDirectory: path.resolve(input.defaultProjectDirectory),
      editorExecutable: input.editorExecutable.trim() ? path.resolve(input.editorExecutable) : "",
    };
    await this.save();
  }

  private async save(): Promise<void> {
    await writeFileAtomically(this.storagePath, `${JSON.stringify(this.value, null, 2)}\n`);
  }
}
