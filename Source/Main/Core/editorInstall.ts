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

async function isFile(candidate: string): Promise<boolean> {
  return stat(candidate).then((info) => info.isFile(), () => false);
}

async function isEngineRoot(directory: string): Promise<boolean> {
  return await isFile(path.join(directory, "CrownBuild.ps1"))
    && await stat(path.join(directory, "Engine", "Build", "CBT")).then((info) => info.isDirectory(), () => false);
}

async function nearbyEngineRoot(applicationDirectory: string): Promise<string> {
  // Only inspect ancestors of this Launcher, never cwd, user profiles or a disk
  // scan. A recognized checkout bounds discovery to its own engine installation.
  let directory = path.resolve(applicationDirectory);
  while (path.dirname(directory) !== directory) {
    if (await isEngineRoot(directory)) return directory;
    let launcherCheckout = false;
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")) as { name?: unknown };
      launcherCheckout = manifest.name === "crown-launcher";
    } catch { /* Not a Launcher checkout. */ }
    if (launcherCheckout) {
      const sibling = path.join(path.dirname(directory), "CrownEngine");
      return await isEngineRoot(sibling) ? sibling : "";
    }
    directory = path.dirname(directory);
  }
  return "";
}

async function discoverEditor(applicationDirectory: string, executableName: string): Promise<string> {
  const adjacent = path.resolve(applicationDirectory, executableName);
  if (await isFile(adjacent)) return adjacent;
  if (process.platform !== "win32") return "";
  const engine = await nearbyEngineRoot(applicationDirectory);
  if (!engine) return "";
  for (const configuration of ["Shipping", "Development", "Debug"]) {
    const candidate = path.join(engine, "Build", "CBT", "Artifacts", "Ninja", "Win64", configuration, "CrownEditor", executableName);
    if (await isFile(candidate)) return candidate;
  }
  return "";
}

export async function resolveEditorInstall(
  applicationDirectory: string,
  configuredExecutable: string,
): Promise<EditorInstall> {
  const executableName = process.platform === "win32" ? "crown_editor_qt.exe" : "crown_editor_qt";
  const requested = configuredExecutable.trim() || process.env.CROWN_EDITOR_EXECUTABLE?.trim();
  // An explicit selection must not silently switch to a different engine when
  // it is missing. Auto-discovery is transient, not an account setting to save.
  const executable = requested ? path.resolve(requested) : await discoverEditor(applicationDirectory, executableName);
  if (!executable || !(await isFile(executable))) {
    return {
      root: "",
      executable,
      templatesRoot: "",
      samplesRoot: "",
      displayVersion: "Current",
      error: requested
        ? `CrownEditor was not found at ${executable}. Update the selected executable or clear the override to enable automatic discovery.`
        : "CrownEditor was not found beside Launcher or in a nearby CBT build. Choose an Editor executable in Launcher Settings.",
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
