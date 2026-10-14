import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import appIcon from "../../Resources/app-icon.png";
import { WorkbenchPage } from "./WorkbenchPage";
import { catalogText } from "./launcherLabels";
import { PageHeading } from "./PageHeading";
import type {
  CreateProjectInput,
  EditorInstallView,
  LauncherSnapshot,
  ProjectSampleView,
  ProjectView,
  Result,
} from "../Shared/contracts";
import {
  BuildIcon,
  ChevronIcon,
  CloseIcon,
  DiamondIcon,
  FolderIcon,
  MoreIcon,
  PinIcon,
  ProjectIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons";

type Page = "projects" | "samples" | "build";
type DialogName = "create" | "sample" | "settings" | "remove" | "delete" | null;
type ProjectSizeState = {
  status: "idle" | "calculating" | "ready" | "error";
  label: string;
  title: string;
};

const idleProjectSize: ProjectSizeState = {
  status: "idle",
  label: "计算大小",
  title: "计算整个项目目录的大小。",
};

const emptySnapshot: LauncherSnapshot = {
  projects: [],
  templates: [],
  samples: [],
  editor: { ready: false, executable: "", version: "Current", error: "" },
  settings: { defaultProjectDirectory: "", editorExecutable: "" },
};

function unwrap<T>(value: Result<T>): T {
  if (!value.ok) {
    throw new Error(value.error);
  }
  return value.value;
}

function formatProjectSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { accent?: boolean; danger?: boolean }) {
  const { accent, danger, className = "", ...buttonProps } = props;
  return <button className={`button ${accent ? "button-accent" : ""} ${danger ? "button-danger" : ""} ${className}`} {...buttonProps} />;
}

function CoverPreview({ source = "", alt, placeholder, className, sample = false }: {
  source?: string; alt: string; placeholder?: string; className: string; sample?: boolean;
}) {
  const [failedSource, setFailedSource] = useState("");
  return <div className={`cover-preview ${className}`}>
    {source && failedSource !== source
      ? <img src={source} alt={alt} loading="lazy" decoding="async" onError={() => setFailedSource(source)} />
      : <div className="cover-placeholder">{sample ? <DiamondIcon /> : <ProjectIcon />}{placeholder && <span>{placeholder}</span>}</div>}
  </div>;
}

export function ProjectCover({ project, large = false }: { project: ProjectView; large?: boolean }) {
  return <CoverPreview source={project.coverDataUrl ?? ""} alt={`${project.name} 的项目封面`}
    className={`project-cover ${large ? "project-cover-large" : ""}`} placeholder={large ? "等待 Editor 生成封面" : ""} />;
}

export function SampleCover({ sample }: { sample: ProjectSampleView }) {
  return <CoverPreview source={sample.coverDataUrl ?? ""} alt={`${catalogText(sample.displayName)} 的示例预览`}
    className="sample-cover" placeholder="暂无预览图" sample />;
}

function WindowControls({ maximized }: { maximized: boolean }) {
  return <div className="window-controls">
    <button className="window-button" aria-label="最小化" onClick={() => void window.crownHost.window.minimize()}><span className="minimize-mark" /></button>
    <button className="window-button" aria-label={maximized ? "还原" : "最大化"} onClick={() => void window.crownHost.window.toggleMaximize()}>
      <span className={maximized ? "restore-mark" : "maximize-mark"} />
    </button>
    <button className="window-button window-close" aria-label="关闭" onClick={() => void window.crownHost.window.close()}><CloseIcon /></button>
  </div>;
}

function TitleBar({ maximized }: { maximized: boolean }) {
  return <header className="titlebar" onDoubleClick={() => void window.crownHost.window.toggleMaximize()}>
    <div className="title-drag-region">
      <img className="title-icon" src={appIcon} alt="" />
      <span>Crown Launcher</span>
    </div>
    <WindowControls maximized={maximized} />
  </header>;
}

function NavItem({ selected, label, description, icon, onClick }: {
  selected: boolean;
  label: string;
  description?: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return <button className={`nav-item ${selected ? "selected" : ""}`} aria-label={label} aria-description={description} aria-current={selected ? "page" : undefined} onClick={onClick}>
    {icon}<span className="nav-tooltip" aria-hidden="true">{label}{description && <small>{description}</small>}</span>
  </button>;
}

export function Sidebar({ page, snapshot, onPage, onSettings }: {
  page: Page;
  snapshot: LauncherSnapshot;
  onPage: (page: Page) => void;
  onSettings: () => void;
}) {
  const editorStatus = snapshot.editor.ready ? "可以启动" : "需要配置";
  return <aside className="sidebar" aria-label="侧边栏">
    <nav className="nav-top" aria-label="工作区导航">
      <NavItem selected={page === "projects"} label="项目" icon={<FolderIcon />} onClick={() => onPage("projects")} />
      <NavItem selected={page === "samples"} label="示例" icon={<DiamondIcon />} onClick={() => onPage("samples")} />
      <NavItem selected={page === "build"} label="构建" icon={<BuildIcon />} onClick={() => onPage("build")} />
    </nav>
    <div className="sidebar-footer">
      <NavItem selected={false} label="设置" description={`CrownEditor · ${editorStatus}`} onClick={onSettings}
        icon={<span className="settings-mark"><SettingsIcon /><i className={snapshot.editor.ready ? "connected" : ""} aria-hidden="true" /></span>} />
    </div>
  </aside>;
}

export function ProjectRow({ project, selected, onSelect, onOpen, onPin }: {
  project: ProjectView;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onPin: () => void;
}) {
  const pinClick = (event: ReactMouseEvent) => {
    event.stopPropagation();
    onPin();
  };
  return <div
    className={`project-row ${selected ? "selected" : ""}`}
    role="button"
    aria-label={`${project.name} — ${project.path}`}
    aria-pressed={selected}
    tabIndex={0}
    onClick={onSelect}
    onDoubleClick={onOpen}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter") { event.preventDefault(); onOpen(); }
      if (event.key === " ") { event.preventDefault(); onSelect(); }
    }}
  >
    <ProjectCover project={project} />
    <span className="project-row-copy"><span className="project-row-name">{project.name}</span><span className="project-row-path" title={project.path}>{project.path}</span></span>
    {project.health !== "ready" && <span className={`health-badge ${project.health}`}>{project.health === "missing" ? "路径缺失" : "无效项目"}</span>}
    <button className={`pin-button ${project.pinned ? "pinned" : ""}`} aria-label={project.pinned ? `取消置顶 ${project.name}` : `置顶 ${project.name}`} aria-pressed={project.pinned} title={project.pinned ? "取消置顶" : "置顶项目"} onClick={pinClick} onDoubleClick={(event) => event.stopPropagation()}>
      <PinIcon />
    </button>
    <span className="last-opened">{project.lastOpenedLabel}</span>
  </div>;
}

export function ProjectInspector({ project, projectSize, editorReady, menuOpen, onMenu, onReveal, onCalculateSize, onOpen, onRelink, onRemove, onDelete, onConfigure }: {
  project: ProjectView | null;
  projectSize: ProjectSizeState;
  editorReady: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onReveal: () => void;
  onCalculateSize: () => void;
  onOpen: () => void;
  onRelink: () => void;
  onRemove: () => void;
  onDelete: () => void;
  onConfigure: () => void;
}) {
  return <aside className="inspector">
    <div className="inspector-tab"><ProjectIcon className="inspector-tab-icon" /><span>项目详情</span></div>
    <div className="inspector-body">
      <div className="project-heading">
        <ProjectIcon className="project-mark" />
        <div className="project-heading-text">
          <strong>{project?.name ?? "未选择项目"}</strong>
          {project?.health === "ready" && <span className="project-kind">Crown 项目</span>}
          {project && project.health !== "ready" && <span className={`health-detail ${project.health}`}><i />{project.health === "missing" ? "路径缺失" : "无效项目"}</span>}
        </div>
        <div className="menu-anchor">
          <button className="icon-button" aria-label="项目操作" aria-expanded={menuOpen} disabled={!project} onClick={onMenu}><MoreIcon /></button>
          {menuOpen && <div className="compact-menu">
            <button onClick={onRemove}>从列表移除</button>
            <div className="compact-menu-separator" />
            <button className="danger-menu-item" disabled={project?.health !== "ready"} onClick={onDelete}>删除项目…</button>
          </div>}
        </div>
      </div>
      {project && <section className="project-cover-section" aria-label="项目封面">
        <ProjectCover project={project} large />
        <p>由 Editor 自动更新，Game 优先，Scene 预览作为补充。无有效画面时保留原封面。</p>
      </section>}
      <div className="separator" />
      <section className="detail-section">
        <h3>基本信息</h3>
        <label>位置</label>
        <p className="project-path">{project?.path ?? "选择项目以查看其位置。"}</p>
        <div className="detail-metric">
          <span>项目大小</span>
          <button
            className={`size-action ${projectSize.status}`}
            title={projectSize.title}
            disabled={!project || project.health === "missing" || projectSize.status === "calculating"}
            onClick={onCalculateSize}
          >
            <span>{!project || project.health === "missing" ? "—" : projectSize.label}</span>
            {projectSize.status === "ready" && <RefreshIcon />}
          </button>
        </div>
        <Button disabled={!project || project.health === "missing"} onClick={onReveal}>在资源管理器中显示</Button>
      </section>
      <div className="separator" />
      <section className="detail-section">
        <h3>脚本</h3>
        <p className="detail-value">{project ? (project.scripting ? "已启用 C#" : "未启用") : "—"}</p>
        {project && project.health !== "ready" && <p className={`validation-message ${project.health}`}>{project.message}</p>}
      </section>
    </div>
    <div className="inspector-action">
      <Button
        accent={Boolean(project?.health === "ready" && editorReady)}
        disabled={!project || project.health === "invalid"}
        onClick={project?.health === "missing" ? onRelink : editorReady ? onOpen : onConfigure}
      >
        {project?.health === "missing" ? "重新定位项目" : editorReady ? "在 CrownEditor 中打开" : "配置 CrownEditor"}
      </Button>
    </div>
  </aside>;
}

export function ProjectsPage({ snapshot, selected, projectSize, search, setSearch, onSelect, onImport, onNew, onOpen, onPin, onReveal, onCalculateSize, onRelink, onRemove, onDelete, onConfigure }: {
  snapshot: LauncherSnapshot;
  selected: ProjectView | null;
  projectSize: ProjectSizeState;
  search: string;
  setSearch: (value: string) => void;
  onSelect: (project: ProjectView) => void;
  onImport: () => void;
  onNew: () => void;
  onOpen: (project: ProjectView) => void;
  onPin: (project: ProjectView) => void;
  onReveal: (project: ProjectView) => void;
  onCalculateSize: (project: ProjectView) => void;
  onRelink: (project: ProjectView) => void;
  onRemove: () => void;
  onDelete: () => void;
  onConfigure: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return !query ? snapshot.projects : snapshot.projects.filter((project) =>
      project.name.toLocaleLowerCase().includes(query) || project.path.toLocaleLowerCase().includes(query));
  }, [search, snapshot.projects]);
  useEffect(() => setMenuOpen(false), [selected?.path]);

  return <div className="projects-layout" onClick={() => menuOpen && setMenuOpen(false)}>
    <main className="launcher-page projects-main">
      <PageHeading title="项目" description="管理项目，让创意从这里开始。" actions={<>
        <Button onClick={onImport}>导入</Button><Button accent disabled={snapshot.templates.length === 0} onClick={onNew}><span aria-hidden="true">＋</span> 新建项目</Button>
      </>} />
      <div className="project-toolbar">
        <label className="search-field"><SearchIcon /><input aria-label="搜索项目" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按名称或路径搜索…" />{search && <button className="icon-button" aria-label="清空搜索" onClick={() => setSearch("")}><CloseIcon /></button>}</label>
        <span className="project-count" role="status">{filtered.length} 个项目</span>
      </div>
      <div className="project-table">
        <div className="table-header"><span>全部项目</span><span>上次打开</span></div>
        <div className="project-list">
          {filtered.map((project) => <ProjectRow
            key={project.path}
            project={project}
            selected={selected?.path === project.path}
            onSelect={() => onSelect(project)}
            onOpen={() => onOpen(project)}
            onPin={() => onPin(project)}
          />)}
          {filtered.length === 0 && <div className="empty-state"><FolderIcon /><strong>{search ? "没有匹配的项目" : "从这里开始你的新创意"}</strong><span>{search ? "试试其他名称或路径。" : "导入已有项目，或创建一个新项目。"}</span></div>}
        </div>
      </div>
    </main>
    <div className="inspector-container" onClick={(event) => event.stopPropagation()}>
      <ProjectInspector
        project={selected}
        projectSize={projectSize}
        editorReady={snapshot.editor.ready}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((open) => !open)}
        onReveal={() => selected && onReveal(selected)}
        onCalculateSize={() => selected && onCalculateSize(selected)}
        onOpen={() => selected && onOpen(selected)}
        onRelink={() => selected && onRelink(selected)}
        onRemove={() => { setMenuOpen(false); onRemove(); }}
        onDelete={() => { setMenuOpen(false); onDelete(); }}
        onConfigure={onConfigure}
      />
    </div>
  </div>;
}

export function SamplesPage({ samples, editor, onRefresh, onCreate, onConfigure }: {
  samples: ProjectSampleView[];
  editor: EditorInstallView;
  onRefresh: () => void;
  onCreate: (sample: ProjectSampleView) => void;
  onConfigure: () => void;
}) {
  return <main className="launcher-page samples-page">
    <PageHeading title="示例" description="探索 Crown 功能，从示例开始创作。" actions={<Button onClick={onRefresh}><RefreshIcon /> 刷新</Button>} />
    <section className="sample-install" aria-label="示例来源">
      <div><div className="section-caption">来自当前引擎安装</div>
        <p>示例来自当前引擎安装，与 Windows 账号无关。</p>
        {editor.ready && <code title={editor.executable}>{editor.executable}</code>}
      </div>
      <Button onClick={onConfigure}>{editor.ready ? "切换引擎" : "配置 CrownEditor"}</Button>
    </section>
    <div className="sample-grid">
      {samples.map((sample) => <article className="sample-card" key={sample.id}>
        <SampleCover sample={sample} />
        <small>{catalogText(sample.category) || "示例"}</small>
        <strong>{catalogText(sample.displayName)}</strong>
        <p>{catalogText(sample.description)}</p>
        <footer><span>{sample.scripting ? "C# · 完整项目" : "完整项目"}</span><Button onClick={() => onCreate(sample)}>创建副本 <span aria-hidden="true">↗</span></Button></footer>
      </article>)}
      {samples.length === 0 && <div className="empty-state sample-empty">
        <strong>{editor.ready ? "当前引擎未安装示例" : "尚未找到 CrownEditor"}</strong>
        <span>{editor.ready ? "请选择包含示例的引擎安装，然后刷新。" : "请配置 CrownEditor 路径；连接后会自动显示该引擎附带的示例。"}</span>
        {!editor.ready && editor.error && <span className="sample-install-error">{editor.error}</span>}
      </div>}
    </div>
  </main>;
}

function Modal({ title, children, onClose, className = "" }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    if (!modalRef.current?.contains(previous)) modalRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-overlay" role="presentation">
    <section ref={modalRef} tabIndex={-1} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first?.focus(); }
    }}>
      <header><strong>{title}</strong><button className="icon-button" aria-label="关闭" onClick={onClose}><CloseIcon /></button></header>
      {children}
    </section>
  </div>;
}

function CreateProjectDialog({ snapshot, busy, onClose, onChooseDirectory, onSubmit }: {
  snapshot: LauncherSnapshot;
  busy: boolean;
  onClose: () => void;
  onChooseDirectory: (initial: string) => Promise<string | null>;
  onSubmit: (input: CreateProjectInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState(snapshot.settings.defaultProjectDirectory);
  const [templateId, setTemplateId] = useState(snapshot.templates[0]?.id ?? "");
  const [scripting, setScripting] = useState(false);
  const template = snapshot.templates.find((entry) => entry.id === templateId);
  return <Modal title="新建 Crown 项目" onClose={onClose} className="create-modal">
    <div className="modal-content form-stack">
      <label className="field-caption" htmlFor="create-name">项目名称</label>
      <input id="create-name" className="text-field" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="我的 Crown 项目" />
      <label className="field-caption" htmlFor="create-location">保存位置</label>
      <div className="field-row"><input id="create-location" className="text-field" value={location} onChange={(event) => setLocation(event.target.value)} /><Button onClick={() => void onChooseDirectory(location).then((value) => value && setLocation(value))}>浏览…</Button></div>
      <label className="field-caption" htmlFor="create-template">项目模板</label>
      <div className="select-field"><select id="create-template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{snapshot.templates.map((entry) => <option key={entry.id} value={entry.id}>{catalogText(entry.displayName)}</option>)}</select><ChevronIcon /></div>
      <p className="template-description">{catalogText(template?.description ?? "")}</p>
      <label className={`check-row ${template?.supportsScripting ? "" : "disabled"}`}><input type="checkbox" checked={scripting} disabled={!template?.supportsScripting} onChange={(event) => setScripting(event.target.checked)} /><span className="checkbox-mark" /><span><strong>启用 C# 脚本</strong><small>为该项目创建独立的脚本程序集。</small></span></label>
    </div>
    <footer className="modal-footer"><Button onClick={onClose}>取消</Button><Button accent disabled={busy || !name.trim() || !location || !templateId} onClick={() => void onSubmit({ displayName: name, parentDirectory: location, templateId, enableScripting: scripting })}>{busy ? "正在创建…" : "创建项目"}</Button></footer>
  </Modal>;
}

function SampleDialog({ sample, snapshot, busy, onClose, onChooseDirectory, onSubmit }: {
  sample: ProjectSampleView;
  snapshot: LauncherSnapshot;
  busy: boolean;
  onClose: () => void;
  onChooseDirectory: (initial: string) => Promise<string | null>;
  onSubmit: (name: string, location: string) => Promise<void>;
}) {
  const [name, setName] = useState(sample.displayName);
  const [location, setLocation] = useState(snapshot.settings.defaultProjectDirectory);
  return <Modal title="创建示例副本" onClose={onClose} className="sample-modal">
    <div className="modal-content form-stack">
      <p className="modal-explanation">原始示例保持只读。Crown Launcher 会创建可编辑的项目副本，并分配新的项目标识。</p>
      <label className="field-caption" htmlFor="sample-name">项目名称</label>
      <input id="sample-name" className="text-field" autoFocus value={name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.target.value)} />
      <label className="field-caption" htmlFor="sample-location">保存位置</label>
      <div className="field-row"><input id="sample-location" className="text-field" value={location} onChange={(event) => setLocation(event.target.value)} /><Button onClick={() => void onChooseDirectory(location).then((value) => value && setLocation(value))}>浏览…</Button></div>
    </div>
    <footer className="modal-footer"><Button onClick={onClose}>取消</Button><Button accent disabled={busy || !name.trim() || !location} onClick={() => void onSubmit(name, location)}>{busy ? "正在创建…" : snapshot.editor.ready ? "创建并打开" : "创建副本"}</Button></footer>
  </Modal>;
}

export function SettingsDialog({ snapshot, busy, onClose, onChooseDirectory, onChooseEditor, onSubmit }: {
  snapshot: LauncherSnapshot;
  busy: boolean;
  onClose: () => void;
  onChooseDirectory: (initial: string) => Promise<string | null>;
  onChooseEditor: (initial: string) => Promise<string | null>;
  onSubmit: (directory: string, editor: string) => Promise<void>;
}) {
  const [directory, setDirectory] = useState(snapshot.settings.defaultProjectDirectory);
  const [editor, setEditor] = useState(snapshot.settings.editorExecutable);
  return <Modal title="Launcher 设置" onClose={onClose} className="settings-modal">
    <div className="modal-content form-stack">
      <label className="field-caption" htmlFor="settings-editor">CrownEditor 可执行文件</label>
      <div className="field-row"><input id="settings-editor" className="text-field" placeholder="留空：自动发现附近的 CrownEditor" value={editor} onChange={(event) => setEditor(event.target.value)} /><Button onClick={() => void onChooseEditor(editor || snapshot.editor.executable).then((value) => value && setEditor(value))}>选择…</Button></div>
      <p className="editor-discovery-hint">留空并保存可恢复自动发现。手动指定路径优先；示例与模板始终来自同一引擎。</p>
      <p className={`editor-state ${snapshot.editor.ready ? "ready" : "missing"}`}><i />{snapshot.editor.ready ? `CrownEditor · ${snapshot.editor.version === "Current" ? "当前版本" : snapshot.editor.version}` : snapshot.editor.error}</p>
      {snapshot.editor.ready && <p className="editor-discovery-hint">当前使用：{snapshot.editor.executable}</p>}
      <label className="field-caption settings-directory-label" htmlFor="settings-directory">默认项目位置</label>
      <div className="field-row"><input id="settings-directory" className="text-field" value={directory} onChange={(event) => setDirectory(event.target.value)} /><Button onClick={() => void onChooseDirectory(directory).then((value) => value && setDirectory(value))}>浏览…</Button></div>
    </div>
    <footer className="modal-footer"><Button onClick={onClose}>取消</Button><Button accent disabled={busy || !directory} onClick={() => void onSubmit(directory, editor)}>{busy ? "正在保存…" : "保存"}</Button></footer>
  </Modal>;
}

export function App() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>("projects");
  const [visitedPages, setVisitedPages] = useState<ReadonlySet<Page>>(() => new Set(["projects"]));
  const [dialog, setDialog] = useState<DialogName>(null);
  const [sample, setSample] = useState<ProjectSampleView | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [maximized, setMaximized] = useState(false);
  const [projectSizes, setProjectSizes] = useState(() => new Map<string, ProjectSizeState>());
  const errorTimer = useRef<number | null>(null);

  const showError = useCallback((value: unknown) => {
    const message = value instanceof Error ? value.message : String(value);
    setError(message);
    if (errorTimer.current !== null) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(""), 6500);
  }, []);

  const refresh = useCallback(async (preferredPath = "") => {
    try {
      const next = unwrap(await window.crownHost.launcher.getSnapshot());
      setSnapshot(next);
      setSelectedPath((current) => {
        const preferred = preferredPath || current;
        return next.projects.some((project) => project.path === preferred) ? preferred : next.projects[0]?.path ?? "";
      });
    } catch (cause) {
      showError(cause);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void refresh();
    void window.crownHost.window.isMaximized().then(setMaximized);
    return window.crownHost.window.onMaximizedChanged(setMaximized);
  }, [refresh]);

  useEffect(() => {
    // Editor owns cover publication. Refresh on returning to Launcher without
    // polling/rendering projects in the background or interrupting a modal.
    if (page !== "projects" || dialog !== null || busy) return;
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, page, dialog, busy]);

  const selected = snapshot.projects.find((project) => project.path === selectedPath) ?? null;
  const selectedProjectSize = selected ? projectSizes.get(selected.path) ?? idleProjectSize : idleProjectSize;
  const calculateProjectSize = (project: ProjectView) => {
    setProjectSizes((current) => new Map(current).set(project.path, {
      status: "calculating",
      label: "正在计算…",
      title: "正在计算整个项目目录的大小。",
    }));
    void window.crownHost.launcher.getProjectSize(project.path).then((value) => {
      if (!value.ok) {
        setProjectSizes((current) => new Map(current).set(project.path, {
          status: "error",
          label: "重试",
          title: value.error,
        }));
        showError(value.error);
        return;
      }
      setProjectSizes((current) => new Map(current).set(project.path, {
        status: "ready",
        label: formatProjectSize(value.value.bytes),
        title: `${value.value.bytes.toLocaleString("zh-CN")} 字节。点击重新计算。`,
      }));
    });
  };
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try {
      await operation();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  };
  const chooseDirectory = async (initial: string) => unwrap(await window.crownHost.launcher.chooseDirectory(initial));
  const chooseEditor = async (initial: string) => unwrap(await window.crownHost.launcher.chooseEditorExecutable(initial));
  const openProject = (project: ProjectView) => void run(async () => {
    if (project.health !== "ready") {
      if (project.health === "missing") await relinkProject(project);
      else throw new Error(project.message);
      return;
    }
    unwrap(await window.crownHost.launcher.openProject(project.path));
    await refresh(project.path);
  });
  const relinkProject = async (project: ProjectView) => {
    const value = unwrap(await window.crownHost.launcher.relinkProject(project.path, project.projectId));
    if (value) await refresh(value.path);
  };

  return <div className={`app-shell ${maximized ? "maximized" : ""}`}>
    <TitleBar maximized={maximized} />
    <div className="workspace" inert={dialog !== null}>
      <Sidebar page={page} snapshot={snapshot} onPage={next => {
        if (next === "projects" && page !== "projects") void refresh();
        setVisitedPages(previous => previous.has(next) ? previous : new Set([...previous, next]));
        setPage(next);
      }} onSettings={() => setDialog("settings")} />
      <section className="content">
        {/* Keep visited pages mounted so navigation preserves forms, scroll and canvas state. */}
        <div className="page-panel" id="page-projects" hidden={page !== "projects"} inert={page !== "projects"}>
        {loading ? <div className="loading-state">正在加载项目…</div> : <ProjectsPage
          snapshot={snapshot}
          selected={selected}
          projectSize={selectedProjectSize}
          search={search}
          setSearch={setSearch}
          onSelect={(project) => setSelectedPath(project.path)}
          onImport={() => void run(async () => {
            const project = unwrap(await window.crownHost.launcher.importProject());
            if (project) await refresh(project.path);
          })}
          onNew={() => setDialog("create")}
          onOpen={openProject}
          onPin={(project) => void run(async () => {
            unwrap(await window.crownHost.launcher.setPinned(project.path, !project.pinned));
            await refresh(project.path);
          })}
          onReveal={(project) => void run(async () => { unwrap(await window.crownHost.launcher.revealProject(project.path)); })}
          onCalculateSize={calculateProjectSize}
          onRelink={(project) => void run(() => relinkProject(project))}
          onRemove={() => setDialog("remove")}
          onDelete={() => setDialog("delete")}
          onConfigure={() => setDialog("settings")}
        />}
        </div>
        {visitedPages.has("samples") && <div className="page-panel" id="page-samples" hidden={page !== "samples"} inert={page !== "samples"}>
        {loading ? <div className="loading-state">正在加载示例…</div> : <SamplesPage
          samples={snapshot.samples}
          editor={snapshot.editor}
          onRefresh={() => void refresh(selectedPath)}
          onCreate={(value) => { setSample(value); setDialog("sample"); }}
          onConfigure={() => setDialog("settings")}
        />}
        </div>}
        {visitedPages.has("build") && <div className="page-panel" id="page-build" hidden={page !== "build"} inert={page !== "build"}>
          <WorkbenchPage visible={page === "build"} />
        </div>}
      </section>
    </div>

    {dialog === "create" && <CreateProjectDialog snapshot={snapshot} busy={busy} onClose={() => setDialog(null)} onChooseDirectory={chooseDirectory} onSubmit={async (input) => run(async () => {
      const project = unwrap(await window.crownHost.launcher.createProject(input));
      setDialog(null);
      setPage("projects");
      await refresh(project.path);
    })} />}
    {dialog === "sample" && sample && <SampleDialog sample={sample} snapshot={snapshot} busy={busy} onClose={() => setDialog(null)} onChooseDirectory={chooseDirectory} onSubmit={async (name, location) => run(async () => {
      const project = unwrap(await window.crownHost.launcher.createSample({ displayName: name, parentDirectory: location, sampleId: sample.id, openAfterCreate: snapshot.editor.ready }));
      setDialog(null);
      setPage("projects");
      await refresh(project.path);
    })} />}
    {dialog === "settings" && <SettingsDialog snapshot={snapshot} busy={busy} onClose={() => setDialog(null)} onChooseDirectory={chooseDirectory} onChooseEditor={chooseEditor} onSubmit={async (directory, editor) => run(async () => {
      unwrap(await window.crownHost.launcher.saveSettings({ defaultProjectDirectory: directory, editorExecutable: editor }));
      setDialog(null);
      await refresh(selectedPath);
    })} />}
    {dialog === "remove" && selected && <Modal title="从项目列表移除？" onClose={() => setDialog(null)} className="remove-modal">
      <div className="modal-content remove-copy"><p>将从列表中移除“{selected.name}”，不会删除磁盘上的项目文件。</p></div>
      <footer className="modal-footer"><Button onClick={() => setDialog(null)}>取消</Button><Button danger disabled={busy} onClick={() => void run(async () => {
        unwrap(await window.crownHost.launcher.removeProject(selected.path));
        setDialog(null);
        await refresh();
      })}>移除</Button></footer>
    </Modal>}
    {dialog === "delete" && selected && <Modal title="永久删除项目？" onClose={() => setDialog(null)} className="delete-modal">
      <div className="modal-content delete-copy">
        <p>将永久删除“{selected.name}”及其目录内的全部文件。</p>
        <code>{selected.path}</code>
        <p className="delete-warning">此操作无法撤销，项目不会移入回收站。</p>
      </div>
      <footer className="modal-footer"><Button onClick={() => setDialog(null)}>取消</Button><Button danger disabled={busy} onClick={() => void run(async () => {
        unwrap(await window.crownHost.launcher.deleteProject(selected.path));
        setDialog(null);
        await refresh();
      })}>{busy ? "正在删除…" : "永久删除"}</Button></footer>
    </Modal>}
    {error && <div className="error-toast" role="alert"><strong>!</strong><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError("")}><CloseIcon /></button></div>}
  </div>;
}
