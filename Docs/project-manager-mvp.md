# CrownLauncher Project Manager MVP

文档类型：Design

状态：MVP 已落地并迁移至 Electron；多版本与下载延期

日期：2026-07-31

## 1. 目标

CrownLauncher 是独立于 CrownEngine 的轻量桌面应用。MVP 建立完整的本地项目管理
闭环：

- 创建 Crown 项目；
- 导入已有项目；
- 保存并搜索最近项目；
- 固定、重新定位和从列表移除项目；
- 校验项目入口文件；
- 启动当前可用的 CrownEditor；
- 在 Editor 启动失败时恢复 Launcher 并提供错误信息。

MVP 只支持一个本地 CrownEditor，不执行任何网络请求。多版本、下载和更新只保留稳定
扩展边界，不显示空的 Versions 页面。

## 2. 非目标

以下能力不进入 MVP：

- Editor 版本列表、下载、安装和卸载；
- Launcher 自动更新；
- 项目格式升级或降级；
- 用户账号、许可证和团队权限；
- 项目云同步；
- 遥测、崩溃上传和远程配置；
- 删除磁盘上的项目；
- 从源码构建 CrownEngine；
- 进程内切换 Crown 项目。

`Remove from List` 只删除 Launcher 的本地记录，绝不删除项目目录。

## 3. 仓库与进程边界

本地目录：

```text
D:/Code/Crown/
  CrownEngine/
  CrownLauncher/
  CrownRTS/
```

三个目录是独立 Git 仓库和独立发布边界。CrownRTS 是正式游戏项目，通过稳定的项目
合同使用引擎，不属于随 Editor 安装的 Samples。CrownLauncher 不通过
`add_subdirectory(../CrownEngine)` 引入引擎，也不链接 CrownRuntime、Renderer、
EditorCore、Vulkan 或 WebEngine。

```text
CrownLauncher.exe
  -> ProjectDescriptor / Registry / Templates
  -> IEditorInstallResolver
  -> CrownEditor.exe --project <absolute-project-root>
  -> CrownEditor owns engine, asset, script and scene startup
```

当前 UI 与桌面壳依赖：

- Electron：窗口、原生文件对话框、Shell 和进程启动；
- TypeScript：跨进程合同和领域实现；
- React + Vite：Renderer UI 与生产构建；
- Node.js 标准库：本地文件、JSON 和原子事务；
- Vitest：项目合同与创建事务测试。

Renderer 必须保持 sandbox 和 context isolation，且只能通过白名单 preload API 使用桌面
能力。具体边界见 `Docs/architecture/electron-launcher.md`。

## 4. 跨仓库稳定合同

CrownLauncher 与 CrownEngine 只通过以下合同协作：

1. `<Project>.crownproject` 项目入口；
2. `CrownEditor.exe --project <path>` 命令行；
3. Editor 发布目录中的 `version.json`；
4. Launcher 与 Editor 的本地启动握手；
5. Editor 安装目录中的项目模板目录。
6. Editor 安装目录中的官方 Samples catalog。

任何一方都不得依赖另一仓库的源文件路径、构建目录结构或 C++ ABI。

## 5. 项目入口文件

项目根目录包含且只包含一个 `.crownproject` 文件。文件名不要求和 `displayName`
相同，避免重命名显示名称时强制移动入口文件。

```text
CrownRTS/
  CrownRTS.crownproject
  Assets/
  ProjectSettings/
  Library/
  Logs/
```

MVP schema：

```json
{
  "schemaVersion": 1,
  "projectId": "21bcbcd4-9eba-4c4a-aadc-725543fcad57",
  "displayName": "Crown RTS",
  "scripting": {
    "enabled": true,
    "projectFile": "CrownRTS.Scripts.csproj",
    "assemblyName": "CrownRTS.Scripts"
  }
}
```

字段规则：

- `schemaVersion`：必填整数，表示入口文件格式，不表示 Editor 多版本支持；
- `projectId`：必填 UUID，新建项目时生成；
- `displayName`：必填非空 UTF-8 字符串；
- `scripting`：可选；路径必须是项目根目录内的相对路径；
- 未识别字段必须忽略，保证向前扩展；
- 入口文件不得保存用户绝对路径、最近场景或窗口状态。

未来可以增加可选字段：

```json
{
  "editorVersion": "0.2.0"
}
```

MVP 不写入也不展示该字段。解析模型从第一版开始使用
`std::optional<std::string>` 表达版本需求。

## 6. 项目校验

Launcher 只做打开前的轻量校验，不扫描或导入资产。

状态：

- `Ready`：目录、入口文件和 `Assets/` 均有效；
- `Missing`：已注册路径不存在；
- `Invalid`：目录存在，但入口文件缺失、重复、损坏或字段非法；
- `Opening`：Editor 启动事务正在进行。

校验项目：

- 路径可规范化为绝对路径；
- 项目根目录存在且可读；
- 恰好存在一个 `.crownproject`；
- JSON 可以解析且 schema 受支持；
- `projectId` 和 `displayName` 有效；
- `Assets/` 是目录；
- 可选脚本项目路径不能逃逸项目根目录；
- Windows Unicode、空格和长路径不经过窄字符编码往返。

手工复制项目导致两个路径具有相同 `projectId` 时，Launcher 必须提示用户这是项目
副本，并在用户确认后为副本生成新 ID。不能静默修改项目文件。

## 7. 本地项目注册表

注册表写入 `QStandardPaths::AppConfigLocation`，Windows 预期位置为：

```text
%LOCALAPPDATA%/Crown/CrownLauncher/projects.json
```

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "projectId": "21bcbcd4-9eba-4c4a-aadc-725543fcad57",
      "path": "D:/Code/Crown/CrownRTS",
      "pinned": true,
      "lastOpenedAt": "2026-07-31T10:42:00Z"
    }
  ]
}
```

规则：

- 路径以规范化绝对路径保存；
- 注册表写入使用临时文件加原子替换；
- 启动时只校验列表中的项目，不递归扫描磁盘；
- `Relink` 更新路径但保持 pin 和 last-opened 状态；
- 项目详情和最近场景属于 Editor 用户状态，不写回 `.crownproject`。

## 8. Editor 安装解析边界

MVP 仍通过接口解析 Editor，避免把当前单版本路径散落在 UI 和业务逻辑中。

```cpp
struct EditorInstall
{
    std::filesystem::path root;
    std::filesystem::path executable;
    std::filesystem::path templatesRoot;
    std::filesystem::path samplesRoot;
    std::string displayVersion;
};

class IEditorInstallResolver
{
public:
    virtual ~IEditorInstallResolver() = default;
    virtual EditorInstall Resolve(
        const std::optional<std::string>& requestedVersion) = 0;
};
```

MVP 仅实现 `BundledEditorInstallResolver`：

- 正式安装从 Launcher 安装布局定位 CrownEditor；
- 本地开发从 Launcher Settings 中读取 Editor executable；
- 不允许在代码中写死 `../CrownEngine/Build/...`；
- 解析失败返回结构化错误，不回退到任何仓库内项目路径。

未来增加多版本时，只新增 versioned resolver、安装注册表和下载服务，项目打开用例不变。

## 9. 项目模板与创建事务

模板跟随 Editor 安装，而不是永久编译进 Launcher：

```text
<EditorInstall>/
  Templates/
    Empty/
      template.json
      Files/
    Blank3D/
      template.json
      Files/
```

MVP 模板：

- `Empty`：空 `Assets/` 和基础 ProjectSettings；
- `Blank 3D`：默认场景、Camera 和 Directional Light；
- 可选创建项目 C# 文件，具体文件来自模板。

创建流程：

1. 校验项目名称和目标父目录；
2. 确保最终目录不存在或为空；
3. 在相同父目录创建 `.crown-create-<uuid>` staging；
4. 展开模板文件和受控占位符；
5. 生成 UUID 与 `.crownproject`；
6. 运行与导入相同的项目校验；
7. 原子移动为最终目录；
8. 写入本地注册表；
9. 启动 Editor。

任何失败都只清理本次明确创建的 staging 目录，不触碰已有目标目录。

模板路径和占位符必须防止 `..`、绝对路径、符号链接和目录逃逸。

## 9.1 官方 Samples

Samples 跟随 Editor 安装并作为完整只读项目提供：

```text
<EditorInstall>/Samples/LookDev/
  sample.json
  LookDev.crownproject
  Assets/
  ProjectSettings/
```

Launcher 的 Samples 页面读取 `sample.json`，但不会直接打开安装目录中的母版。
`Create Copy` 使用同父目录 staging 复制 authored files，排除 `.git`、`Library`、
`Logs`、`Build`、`bin`、`obj`、母版 manifest 和开发期 CMake 文件，然后生成新的
`projectId` 与 `.crownproject`。生成项目经过普通项目校验后才原子发布并加入 registry。

Samples 当前随安装包提供；以后增加下载只扩展 catalog 获取方式，不改变实例化合同。

## 10. Launcher UI

采用 Electron Web UI，并保持与 CrownEditor 同源的紧凑暖色工作台风格，但不复刻
Editor 的文档标签页：

- 暖黑和紫棕黑面层；
- 珊瑚橙 `#F08363` 只用于克制的主操作或焦点；
- 间距以 4 / 8 / 12 / 16 px 为主，浏览型控件使用紧凑行高和近直角几何；
- 项目列表是连续表格，不使用宽松 SaaS 卡片；
- 选中项使用中性深色填充，不使用大面积高饱和色。
- 使用一条无标签页语义的原生窗口标题栏，只出现一个 Crown 图标和
  `Crown Launcher`；
- 不保留全局状态栏。完成提示保持在当前上下文，错误使用临时浮层。

主页面：

```text
Projects               Crown RTS
  Search     Import  New Project

  Project                         Last Opened
  [pin] Crown RTS                 Just now

  Settings                General
                          Location / Show in Explorer
                          Scripting
                          Open in CrownEditor
```

`Projects` 与 `Samples` 位于左侧顶部，`Settings` 固定在左下角。右侧只展示打开决策
所需的项目名称、位置和脚本状态；正常项目不重复展示 `Ready`，只有 `Missing` / `Invalid`
项目才在列表和详情中出现异常提示。固定项目在名称前常驻显示珊瑚橙图钉，并排在未固定
项目之前；未固定项目仅在选中或悬停时显示灰色图钉按钮，单击按钮直接固定或取消固定，
Tooltip 使用 `Pin to Top` / `Unpin from Top` 明确说明排序效果。移出列表收进 `...`
菜单，重新定位只在 Missing 状态下作为主操作出现。
不要显示 Current Editor 卡片、不可用的 Versions / Downloads 或账号入口。Open
按钮固定在右侧底部，但窗口底部不再预留额外状态栏或空白带。

交互：

- 单击选择并更新详情；
- 双击 Ready 项目、Enter 和右侧 Open 按钮复用同一打开动作；
- Missing 项目的主操作变为 Relink；
- Invalid 项目的主操作变为 View Error；
- Delete 不直接移除，必须经过明确确认；
- Remove 对话框明确写出“不会删除项目文件”。

## 11. Editor 启动与握手

Launcher 使用绝对路径和参数数组启动：

```text
CrownEditor.exe --project D:/Projects/MyGame
```

不得通过拼接未经转义的 shell command line 启动。

本地握手由 Main process 的平台适配层实现，每次启动使用随机 nonce：

```json
{"type":"BootstrapStarted","projectId":"..."}
{"type":"Ready","projectId":"..."}
{"type":"Failed","projectId":"...","message":"..."}
```

流程：

1. Launcher 建立一次性 endpoint；
2. 通过参数把 endpoint 和 nonce 传给 Editor；
3. Editor 显示自己的项目初始化进度窗口；
4. 收到 `BootstrapStarted` 后 Launcher 隐藏主窗口；
5. 收到 `Ready` 后 Launcher 可以退出；
6. 收到 `Failed`、进程提前退出或握手超时后恢复 Launcher；
7. 错误界面提供 Retry、Open Logs 和 Show Project Folder。

下载和安装进度未来归 Launcher；资产、脚本、Renderer 和场景初始化进度始终归
CrownEditor。

## 12. CrownEditor 的配套改造

Project Manager 的可用性依赖 CrownEngine 同步完成以下工作：

- 删除 Qt Editor、CLI 和 `EditorCore` 中的 WarehouseStealth 默认项目；
- 将 LookDev 从临时游戏项目迁移为 `Engine/Samples/LookDev` 官方样例；
- `EditorCore` 接收经过校验的 project context；
- 将重型构造过程拆为可报告进度的初始化事务；
- 初始场景按以下顺序解析：

```text
--load
  -> 当前项目的用户 last scene
  -> ProjectSettings/BuildSettings.json startupScene
  -> 未保存空场景
```

- 默认场景缺失时打开空场景并报告错误，不能退出 Editor；
- 项目脚本路径从 `.crownproject` 获取；
- 移除 `CROWN_PROJECT_SCRIPT_ASSEMBLY_PATH` 对 WarehouseStealth 的编译期绑定；
- 项目脚本输出到 `<Project>/Library/ScriptAssemblies/`；
- `CMakeLists.txt` 不再要求为每个普通用户项目执行 `add_subdirectory`；
- 无 `--project` 启动 CrownEditor 时转交 CrownLauncher，或返回明确错误；
- 删除 Engine 仓库内的 WarehouseStealth 临时项目；LookDev Gallery 只通过 Samples
  页面创建可写副本，不直接打开安装目录中的母版。

## 13. 代码结构

```text
CrownLauncher/
  package.json
  src/
    shared/
      contracts.ts
    main/
      core/
        projectDescriptor.ts
        projectRegistry.ts
        projectCreator.ts
        catalogs.ts
        editorInstall.ts
      launcherService.ts
      ipc.ts
      index.ts
    preload/
      index.ts
    renderer/
      App.tsx
      styles.css
  Resources/
  tests/
  Docs/
```

Core 层不依赖 Electron 或 React。Main process 负责文件选择、原生进程和本地 IPC；
Renderer 不读取 Node API，也不持有任意 IPC channel。

## 14. 实施阶段

### Phase 1：项目合同

- 建立 CrownLauncher CMake 工程；
- 实现 descriptor、validator 和 registry；
- 给 WarehouseStealth 增加 `.crownproject`；
- 完成 Unicode、空格路径和损坏 JSON 单元测试。

### Phase 2：Editor 项目无关化

- 删除默认项目和默认关卡；
- 按 manifest 配置脚本；
- 支持无关卡空项目；
- 建立 Editor install `version.json` 和模板输出目录。

### Phase 3：Launcher 打开已有项目

- 实现已确认的 Projects UI；
- Open、Import、Relink、Pin、Search、Reveal、Remove；
- BundledEditorInstallResolver；
- 启动当前 Editor。

### Phase 4：New Project

- Empty 和 Blank 3D 模板；
- staging 创建事务；
- 可选 C# 项目；
- 创建后校验、注册并打开。

### Phase 5：启动体验与加固

- Launcher/Editor 握手；
- Editor 全启动阶段进度；
- 失败恢复和日志入口；
- 重复 projectId、项目复制和并发打开处理；
- 原生窗口截图与多 DPI QA。

## 15. 验证矩阵

自动验证至少覆盖：

- 正常、缺失、损坏和重复 `.crownproject`；
- Unicode、空格、长路径和不可写目录；
- registry 原子写入和损坏恢复；
- Relink 保留 pin 与 last-opened；
- Remove 不删除任何项目文件；
- 模板占位符无法逃逸目标目录；
- 创建失败只清理 staging；
- Editor executable 缺失或启动失败；
- Editor Ready、Failed、timeout 和提前退出；
- 默认场景缺失时进入空场景；
- 无脚本项目和启用 C# 的项目；
- Launcher 关闭、最大化、缩放和 100%/125%/150% DPI。

视觉变更必须捕获真实 CrownLauncher 原生窗口的整窗物理像素截图，检查标题栏、列表、
详情栏、对话框、焦点、文本清晰度和棕色设计令牌一致性。

## 16. MVP 验收标准

满足以下条件才视为 Project Manager MVP 完成：

1. CrownLauncher 可独立启动且不初始化 CrownEngine；
2. 可以导入现有 WarehouseStealth；
3. 可以在 CrownEngine 仓库外创建 Empty 和 Blank 3D 项目；
4. 新项目无需修改 CrownEngine 根 CMake；
5. 项目可从最近列表再次打开；
6. Missing 项目可以 Relink；
7. Remove 不改变项目目录；
8. CrownEditor 不再默认绑定 WarehouseStealth 或 LookDev；
9. 默认场景缺失时仍可进入 Editor；
10. 整个流程不执行网络请求，也不包含版本下载 UI。

## 17. 后续扩展边界

多版本管理以后在现有边界上增加：

- `VersionedEditorInstallResolver`；
- 本地 Editor installations registry；
- Versions 页面；
- 静态远程 release manifest；
- 下载、哈希验证、staging 安装和卸载；
- 项目 `editorVersion` 绑定；
- Launcher 自更新。

这些扩展不得改变 `.crownproject` 的基础身份字段、项目注册表的本地所有权、
`CrownEditor.exe --project` 命令或模板跟随 Editor 安装的原则。

## 18. 2026-07-31 落地记录

本次实现完成 Phase 1–4 与 Phase 5 中的启动进程、进度窗口、错误保底和 150% DPI
原生窗口验证：

- CrownLauncher 已成为独立 Git / CMake / Qt Quick 应用；
- CrownEngine Release 输出会部署 `version.json`、`Templates/` 和 `Managed/`；
- WarehouseStealth 已具有合法 `.crownproject`；
- CrownEditor GUI 必须显式接收 `--project`，脚本和初始场景均按项目合同解析；
- Empty 项目进入 `Untitled.level`，Blank 3D 项目加载模板场景；
- C# 首次打开时构建到项目自己的 `Library/ScriptAssemblies/`；
- Launcher Core 测试、Editor project-context 测试和 CrownEngine smoke 107/107 通过；
- 已从 Launcher 实际启动仓库外的 Blank 3D + C# 项目并完成整窗截图。

基于本地 IPC 的 Ready/Failed/timeout 细粒度握手与 100%/125% DPI 扩展矩阵作为
后续启动体验加固项，不影响当前 Launcher 保持可见、Editor 立即启动失败可报告的 MVP
行为。

## 19. 2026-08-01 Electron 迁移记录

- Qt Quick 应用壳和 C++ Launcher Core 已由 Electron、TypeScript 和 React 实现替换；
- `%LOCALAPPDATA%/CrownEngine/CrownLauncher/projects.json` 保持 schema 1，已有项目列表、
  pin 和最近打开时间无需转换；
- 首次启动把旧 Qt `QSettings` 中的 Editor 路径和默认项目目录迁移到 `settings.json`；
- Renderer 启用 sandbox、context isolation、严格 CSP，Preload 仅暴露类型化能力；
- 项目校验、registry、模板创建和 Sample 副本事务具有 Node 领域测试；
- Windows 发布由 electron-builder 生成，`appId` 和 Launcher 图标保持不变；
- UI 保留 Projects / Samples 左侧导航、Settings 左下角、紧凑项目表、按需 pin 按钮、
  右侧详情和无全局状态栏设计。
