# CrownLauncher

CrownLauncher 是与 CrownEngine 并列开发和发布的独立桌面应用。它负责项目发现、
创建、注册和启动；CrownEditor 继续负责项目初始化、资产、脚本、渲染和场景编辑。

当前版本实现单 Editor 版本的本地 Project Manager，不包含版本下载、安装、账号或
云服务。架构保留 Editor install resolver，以便后续增加多版本管理而不重写项目打开
流程。

## 已实现

- 创建 Empty / Blank 3D 项目，可选 C#；
- 导入、搜索、固定、Relink、Reveal、Remove from List；
- `.crownproject` 校验和原子 recent-project registry；
- 紧凑棕色 Qt Quick 界面；
- 通过 `--project <absolute-path>` 启动当前 CrownEditor；
- Editor 安装解析接口已预留，界面暂不展示版本管理或下载入口。

## 构建

```powershell
$env:CROWN_QT_ROOT = "D:\CrownDependencies\SDKs\Qt\6.10.2\msvc2022_64"
.\Build.ps1 -Configuration Release -Preset windows-vs2026 -Test
```

开发环境中可通过设置页选择 `crown_editor_qt.exe`，也可临时设置：

```powershell
$env:CROWN_EDITOR_EXECUTABLE =
    "D:\Code\Crown\CrownEngine\Build\win-editor\Release\crown_editor_qt.exe"
.\Build\windows-vs2026\Release\CrownLauncher.exe
```

正式打包时 Launcher 与当前 Editor 可以放在同一安装目录；Launcher 也支持 Editor 位于
独立目录的开发布局。

设计与实施方案见 [Project Manager MVP](Docs/project-manager-mvp.md)。
