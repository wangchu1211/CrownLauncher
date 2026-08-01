import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface EditorInstall {
  root: string;
  executable: string;
  templatesRoot: string;
  samplesRoot: string;
  displayVersion: string;
  error: string;
}

export async function resolveEditorInstall(
  applicationDirectory: string,
  configuredExecutable: string,
): Promise<EditorInstall> {
  const executableName = process.platform === "win32" ? "crown_editor_qt.exe" : "crown_editor_qt";
  const requested = configuredExecutable.trim()
    || process.env.CROWN_EDITOR_EXECUTABLE?.trim()
    || path.join(applicationDirectory, executableName);
  const executable = path.resolve(requested);
  try {
    if (!(await stat(executable)).isFile()) {
      throw new Error("not a file");
    }
  } catch {
    return {
      root: "",
      executable: configuredExecutable ? path.normalize(configuredExecutable) : "",
      templatesRoot: "",
      samplesRoot: "",
      displayVersion: "Current",
      error: "CrownEditor was not found. Configure its executable in Launcher Settings.",
    };
  }

  const root = path.dirname(executable);
  let displayVersion = "Current";
  try {
    const version = JSON.parse(await readFile(path.join(root, "version.json"), "utf8")) as { version?: unknown };
    if (typeof version.version === "string" && version.version.trim()) {
      displayVersion = version.version.trim();
    }
  } catch {
    // A development Editor does not have to carry release metadata.
  }
  return {
    root,
    executable,
    templatesRoot: path.join(root, "Templates"),
    samplesRoot: path.join(root, "Samples"),
    displayVersion,
    error: "",
  };
}
