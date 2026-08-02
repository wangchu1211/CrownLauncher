# CrownLauncher Electron Architecture

文档类型：Architecture Decision Record

状态：Accepted

日期：2026-08-01

## 决策

CrownLauncher 从 Qt Quick 迁移到 Electron、TypeScript 和 Web UI。CrownEditor 继续使用
Qt 承载原生 Editor 工作台和 Vulkan 视口。其他需要桌面图形界面的 Crown 产品优先使用
Web UI，并按需通过 Electron 提供桌面能力；命令行、构建工具和后台服务不因此引入
Electron。

Launcher 是 Crown Web UI 技术栈的第一个产品。迁移不改变 `.crownproject`、项目注册表、
Editor 模板、Samples 或 `CrownEditor --project` 跨仓库合同。

## 原因

- Launcher 未来可能承载 Editor 安装、下载、更新、账号和内容浏览，这些界面更适合
  Web 技术；
- TypeScript UI、设计令牌和无平台业务状态可以被后续桌面或浏览器前端复用；
- Launcher 不承载实时 Vulkan 视口，Electron 的体积和常驻内存不是当前交互路径的主要
  约束；
- 迁移发生在 Launcher 规模仍然较小时，可避免 Qt 界面继续增长后再进行高成本重写。

Electron 只统一产品 UI 技术，不替代原生引擎、Editor、资源工具或跨进程合同。

## 进程与信任边界

```text
Renderer (React, sandboxed)
  -> window.crownHost typed capability API
Preload (contextBridge, per-method validation boundary)
  -> allow-listed IPC channels
Main process
  -> ProjectService / SettingsStore / EditorInstallResolver
  -> filesystem, dialogs, shell and child processes
CrownEditor
  <- absolute executable + ["--project", absoluteRoot, "--launcher-pid", pid]
```

Renderer 不启用 Node integration，不接收 `ipcRenderer`，不能直接访问文件系统或启动
进程。Preload 只暴露按用例命名的方法，不提供任意 channel 的 `send` / `invoke`。应用只
加载打包资源，使用严格 CSP，拒绝页面导航、新窗口和未授权权限请求。

## 可复用前端边界

Renderer 只依赖 `CrownHost`：

```ts
interface CrownHost {
  launcher: {
    getSnapshot(): Promise<Result<LauncherSnapshot>>;
    importProject(): Promise<Result<ProjectView | null>>;
    createProject(input: CreateProjectInput): Promise<Result<ProjectView>>;
    getProjectSize(projectPath: string): Promise<Result<ProjectSizeView>>;
    openProject(projectPath: string): Promise<Result<void>>;
    deleteProject(projectPath: string): Promise<Result<void>>;
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
}
```

未来的浏览器或远程前端可以实现另一套 host adapter；React 组件不得假设 Electron、
Windows 路径或 Node API 存在。项目领域模型和 UI 组件可以复用，文件选择、进程启动与
安装属于 host 能力。

项目大小只在用户点击 `Calculate` 后由 Main process 异步统计，结果在当前会话缓存并可
手动刷新，避免启动或选择项目时递归扫描。目录符号链接不跟随，防止统计逃出项目根目录
或进入环。`deleteProject` 先重新校验 registry 中的路径和 `.crownproject` 身份，并拒绝
根目录、用户目录、默认项目父目录、Launcher 配置目录和应用目录，再永久删除项目；只有
删除成功后才移除 registry 记录。Renderer 不获得任意文件删除能力。

## 本地数据兼容

- 项目注册表继续位于 `%LOCALAPPDATA%/CrownEngine/CrownLauncher/projects.json`；
- 新设置写入同目录的 `settings.json`；
- Windows 首次启动且 `settings.json` 不存在时，读取旧 Qt `QSettings` 注册表键并迁移
  Editor 路径和默认项目目录；
- `CROWN_LAUNCHER_REGISTRY_PATH` 继续作为测试隔离入口；
- `CROWN_EDITOR_EXECUTABLE` 继续作为进程级 Editor 覆盖值。

## 版本管理扩展点

MVP 仍只解析一个当前 Editor。`EditorInstallResolver` 输出稳定的 `EditorInstall`，打开
项目只消费解析结果。未来加入多版本时增加 installation registry、release manifest、
download/install service 和版本选择页面，不改变项目管理 UI 的基础用例。

## 构建与发布

- `npm run build`：类型检查并构建 main、preload 和 renderer；
- `npm test`：项目合同、注册表和创建事务测试；
- `npm run package`：生成 Windows unpacked 发布目录；
- Windows `appId` 保持 `CrownEngine.CrownLauncher`，沿用 Launcher 专属 ICO 和任务栏
  分组身份。

发布包显著大于 Qt Launcher 是已接受的权衡。依赖升级时必须重新检查 Electron 安全
清单、打包签名和各平台原生集成。
