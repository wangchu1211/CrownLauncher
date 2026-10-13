# CrownLauncher

CrownLauncher 是与 CrownEngine 并列开发和发布的独立 Electron 桌面应用。它负责项目
发现、创建、注册和启动；CrownEditor 继续使用 Qt/Vulkan，负责资产、脚本、渲染和场景
编辑。

当前版本实现单 Editor 安装的本地 Project Manager，不包含版本下载、账号或云服务。
Editor install resolver、类型化 host API 和 UI 页面边界已经为后续多版本管理与更多 Web
前端留出扩展点。

## 已实现

- 创建 Empty / Blank 3D 项目，可选 C#；
- 从当前 Editor 安装中的官方 Samples 创建具有新项目身份的可写副本；
- 导入、搜索、固定、Relink、Reveal、Remove from List；
- 在详情中按用户请求统计完整项目目录大小，并支持会话内缓存和刷新；
- 二次确认后永久删除有效项目目录，成功后再移除 Launcher 记录；
- `.crownproject` 校验和原子 recent-project registry；
- 暖黑 Web UI、窄图标栏、项目快捷侧栏、详情面板与自绘窗口 chrome；
- 通过 `--project <absolute-path>` 启动当前 CrownEditor；
- 从旧 Qt Launcher 自动迁移项目注册表、Editor 路径和默认项目目录；
- sandbox、context isolation、严格 CSP 和白名单 preload API；
- Editor 版本解析边界已预留，界面暂不展示版本管理或下载入口。

## 开发

要求 Node.js 22.12 或更新版本。

```powershell
npm install
npm run build
npm test
npm start
```

也可以使用仓库入口：

```powershell
.\Build.ps1 -Test
```

Editor 解析顺序：设置页手动指定 > `CROWN_EDITOR_EXECUTABLE` > Launcher 同目录的
Editor > 附近 CBT 构建。自动发现只沿 Launcher 可执行文件目录的祖先查找，支持位于
CrownEngine 仓库内部，或与 CrownEngine 并列的 CrownLauncher 仓库（包括 `npm start`
和仓库内打包目录）。引擎仓库须有 `CrownBuild.ps1` 与 `Engine/Build/CBT`；只检查
`Build/CBT/Artifacts/Ninja/Win64/{Shipping,Development,Debug}/CrownEditor`，按此顺序
选取可用 Editor。不扫描磁盘、其他账号目录或从当前工作目录猜测引擎。

手动指定的路径失效时会报错，不会静默切换到别的引擎。在设置中清空路径并保存可恢复
自动发现；自动发现结果不写成账号的固定路径。独立移动 Launcher 后若找不到附近引擎，
可通过设置页选择 `crown_editor_qt.exe`，也可临时设置：

```powershell
$env:CROWN_EDITOR_EXECUTABLE =
    "D:\Code\Crown\CrownEngine\Build\CBT\Artifacts\Ninja\Win64\Shipping\CrownEditor\crown_editor_qt.exe"
npm start
```

## Windows 发布目录

```powershell
.\Build.ps1 -Test -Package
```

输出位于 `Build/Electron/win-unpacked/CrownLauncher.exe`。正式安装布局仍允许 Launcher
与 CrownEditor 同目录；开发布局会自动发现上述 CBT Editor，也可在 Launcher Settings
手动覆盖。

Projects 注册记录、固定状态和默认项目目录仍按 Windows 账号隔离，存于
`%LOCALAPPDATA%/CrownEngine/CrownLauncher`。Samples 与模板不归账号所有，分别读取
当前 Editor 同目录的 `Samples` / `Templates`；Samples 页面会显示来源路径。创建副本后，
该副本才作为当前账号的项目登记。切换 Windows 账号无需复制另一账号的设置或项目记录。

产品方案见 [Project Manager MVP](Docs/project-manager-mvp.md)，Electron 决策与进程边界
见 [Electron Architecture](Docs/architecture/electron-launcher.md)。

后续方向见 [CBT 构建工作台方案](Docs/build-workbench.md)：UI 与 CLI 共用 CBT 执行和
任务记录。该方案尚未实施，当前 Launcher 仍只负责项目管理和启动。
