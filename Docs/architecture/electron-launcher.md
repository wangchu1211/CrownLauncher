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

项目大小只在用户点击 `计算大小` 后由 Main process 异步统计，结果在当前会话缓存并可
手动刷新，避免启动或选择项目时递归扫描。目录符号链接不跟随，防止统计逃出项目根目录
或进入环。`deleteProject` 先重新校验 registry 中的路径和 `.crownproject` 身份，并拒绝
根目录、用户目录、默认项目父目录、Launcher 配置目录和应用目录，再永久删除项目；只有
删除成功后才移除 registry 记录。Renderer 不获得任意文件删除能力。

## 界面语言

Launcher 的项目、示例、构建、设置及相关弹窗统一使用简体中文，保留 CrownEditor、CBT、
C#、LookDev 等专有名称。页面声明 `zh-CN`；应用提供的文件选择弹窗标题和确认按钮同步
中文化，系统自带控件仍遵循操作系统语言。

内置模板与示例的英文目录文案通过 Renderer 的 `launcherLabels.ts` 做显示层映射，不
修改 Editor 提供的共享目录文件。未知或自定义目录文案保留原文。用户项目名、目录路径、
模板与示例 ID、默认创建目录名和持久化格式均不因翻译而改变。

项目操作的应用级错误提示使用中文；底层系统或解析器的原始诊断保持原样，便于定位问题。

项目、示例、构建共用 `launcher-page` 页面留白及 `PageHeading` 标题/说明/操作区，
响应式边距也由同一组变量控制；各模块不单独覆盖主标题字号或页头位置。Build 正文仍
保留较大的阅读字号，项目详情侧栏保持独立布局。

主导航页面在当前窗口会话内按需首次挂载，切换后用 `hidden` / `inert` 保留已访问页面，
不卸载重建。因此构建配置、选中任务、详情标签、画布缩放/平移与滚动位置可保留；
未进入 Build 时不连接 CBT。离开 Build 暂停任务轮询并丢弃在途轮询的迟到结果，返回时
先显示已有内容，再立即刷新任务进度；不重置配置、不自动重新连接。切换工作区或点击
“重新连接”仍显式初始化工作台。该缓存不跨 Launcher 重启，不替代 CBT 的磁盘任务记录，
也不影响后台构建。项目页返回时仍刷新项目封面，隐藏页面不参与焦点导航或画布快捷键。

## 项目封面

项目列表显示缩略封面，详情页显示完整预览；封面由 Editor 自动覆盖，不提供手动选图
按钮或 IPC。Editor 只截取当前实际显示的 Scene / Game 视口，不截取桌面、不自动切换
视图，也不为了封面启动 Editor。每次 Editor 会话先允许 Scene 预览，首次获得有效 Game
画面后，本会话只更新 Game 封面，避免切回 Scene 时覆盖成品画面。

Editor 每 5 秒检查一次，成功后至少间隔 30 秒再次更新（首次有效 Game 不受 Scene
间隔限制）。截图限定在 960×540 范围，JPEG 最大 768 KiB，由 `QSaveFile` 原子写入
项目根目录的 `ProjectCover.jpg`；黑白纯色、透明、失效/切换中的视口与截图失败保留旧封面。
退出时不强制截图或阻塞关闭。封面随项目目录移动；`.crownproject` 和账号注册表格式不变。

Launcher 只读取已登记且身份匹配的项目封面；回到项目页或该页重新获得焦点时刷新，
不后台轮询整个项目。
Renderer 只接收限量 JPEG data URL，不获得任意本地文件 URL 或写入路径。缺失、损坏、
超大或重解析点封面使用占位图，不影响项目打开；宽高比不一致时留边而非裁掉场景内容。

示例也读取当前 Editor 安装目录 `Samples/<sample>/ProjectCover.jpg`，使用同一限量
读取边界，仅在示例页卡片中显示；项目页不再放置“探索 Crown”推荐区。官方预览是随引擎分发的实际 Game 截图，
不借用账号内项目封面、不自动打开示例截图。创建示例副本时带入初始封面，副本之后的
自动更新不修改安装源；旧安装没有预览或图片损坏时回退占位，不影响创建副本。

## 本地数据兼容

- 项目注册表继续位于 `%LOCALAPPDATA%/CrownEngine/CrownLauncher/projects.json`；
- 新设置写入同目录的 `settings.json`；
- Windows 首次启动且 `settings.json` 不存在时，读取旧 Qt `QSettings` 注册表键并迁移
  Editor 路径和默认项目目录；
- `CROWN_LAUNCHER_REGISTRY_PATH` 继续作为测试隔离入口；
- `CROWN_EDITOR_EXECUTABLE` 继续作为进程级 Editor 覆盖值。

## CBT 构建工作台

Build 页面通过 `crownHost.workbench` 白名单接口调用 Main 的 `WorkbenchService`。
Main 校验工作区、任务 ID、Target、配置、Features 和 jobs，不接受任意 shell 字符串。
CBT 提供版本化 JSON 能力、图摘要、任务历史和控制接口；Renderer 不解析普通日志来猜测
成功。连接与构建使用公开 bootstrap，历史查询使用工作区中已验证路径的不可变 Tool runtime。

任务及进程归 CBT supervisor 所有，关闭 Launcher 不结束 UI 发起的后台任务。只有显式
Cancel 才取消所选任务；Main 不按进程名杀 Editor。完整合同与范围见 [构建工作台](../build-workbench.md)。

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
