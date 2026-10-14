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
      throw new Error("示例启动关卡必须使用安全的项目内相对路径。");
    }
    arguments_.push("--load", level);
  }
  return arguments_;
}
