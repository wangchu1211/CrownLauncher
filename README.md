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
- `.crownproject` 校验和原子 recent-project registry；
- 与 CrownEditor 对齐的紧凑暖黑 Web UI 和自绘窗口 chrome；
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

开发环境中可通过设置页选择 `crown_editor_qt.exe`，也可临时设置：

```powershell
$env:CROWN_EDITOR_EXECUTABLE =
    "D:\Code\Crown\CrownEngine\Build\win-editor\Release\crown_editor_qt.exe"
npm start
```

## Windows 发布目录

```powershell
.\Build.ps1 -Test -Package
```

输出位于 `Build/Electron/win-unpacked/CrownLauncher.exe`。正式安装布局仍允许 Launcher
与 CrownEditor 同目录；开发布局通过 Launcher Settings 指向独立的 Editor 构建。

产品方案见 [Project Manager MVP](Docs/project-manager-mvp.md)，Electron 决策与进程边界
见 [Electron Architecture](Docs/architecture/electron-launcher.md)。
