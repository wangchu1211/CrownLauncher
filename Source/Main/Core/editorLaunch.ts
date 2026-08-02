import { isSafeRelativePath } from "./paths";

export function buildEditorLaunchArguments(
  projectRoot: string,
  launcherPid: number,
  startupLevel = "",
): string[] {
  const arguments_ = [
    "--project",
    projectRoot,
    "--launcher-pid",
    String(launcherPid),
  ];
  const level = startupLevel.trim();
  if (level) {
    if (!isSafeRelativePath(level)) {
      throw new Error("The sample startup level is not a safe project-relative path.");
    }
    arguments_.push("--load", level);
  }
  return arguments_;
}
