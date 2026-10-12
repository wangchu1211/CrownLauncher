import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import appIcon from "../../Resources/app-icon.png";
import { WorkbenchPage } from "./WorkbenchPage";
import type {
  CreateProjectInput,
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
  label: "Calculate",
  title: "Calculate the complete project directory size.",
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

function WindowControls({ maximized }: { maximized: boolean }) {
  return <div className="window-controls">
    <button className="window-button" aria-label="Minimize" onClick={() => void window.crownHost.window.minimize()}><span className="minimize-mark" /></button>
    <button className="window-button" aria-label={maximized ? "Restore" : "Maximize"} onClick={() => void window.crownHost.window.toggleMaximize()}>
      <span className={maximized ? "restore-mark" : "maximize-mark"} />
    </button>
    <button className="window-button window-close" aria-label="Close" onClick={() => void window.crownHost.window.close()}><CloseIcon /></button>
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
  const editorStatus = snapshot.editor.ready ? "Ready to launch" : "Setup required";
  return <aside className="sidebar" aria-label="Sidebar">
    <img className="sidebar-brand" src={appIcon} alt="Crown" />
    <nav className="nav-top" aria-label="Workspace">
      <NavItem selected={page === "projects"} label="Projects" icon={<FolderIcon />} onClick={() => onPage("projects")} />
      <NavItem selected={page === "samples"} label="Samples" icon={<DiamondIcon />} onClick={() => onPage("samples")} />
      <NavItem selected={page === "build"} label="构建" icon={<BuildIcon />} onClick={() => onPage("build")} />
    </nav>
    <div className="sidebar-footer">
      <NavItem selected={false} label="Settings" description={`CrownEditor · ${editorStatus}`} onClick={onSettings}
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
    <span className="project-tile"><ProjectIcon /></span>
    <span className="project-row-copy"><span className="project-row-name">{project.name}</span><span className="project-row-path" title={project.path}>{project.path}</span></span>
    {project.health !== "ready" && <span className={`health-badge ${project.health}`}>{project.health === "missing" ? "Missing" : "Invalid"}</span>}
    <button className={`pin-button ${project.pinned ? "pinned" : ""}`} aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`} aria-pressed={project.pinned} title={project.pinned ? "Unpin from Top" : "Pin to Top"} onClick={pinClick} onDoubleClick={(event) => event.stopPropagation()}>
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
    <div className="inspector-tab"><ProjectIcon className="inspector-tab-icon" /><span>Project Inspector</span></div>
    <div className="inspector-body">
      <div className="project-heading">
        <ProjectIcon className="project-mark" />
        <div className="project-heading-text">
          <strong>{project?.name ?? "No project selected"}</strong>
          {project?.health === "ready" && <span className="project-kind">Crown project</span>}
          {project && project.health !== "ready" && <span className={`health-detail ${project.health}`}><i />{project.health === "missing" ? "Missing" : "Invalid"}</span>}
        </div>
        <div className="menu-anchor">
          <button className="icon-button" aria-label="Project actions" aria-expanded={menuOpen} disabled={!project} onClick={onMenu}><MoreIcon /></button>
          {menuOpen && <div className="compact-menu">
            <button onClick={onRemove}>Remove from List</button>
            <div className="compact-menu-separator" />
            <button className="danger-menu-item" disabled={project?.health !== "ready"} onClick={onDelete}>Delete Project…</button>
          </div>}
        </div>
      </div>
      <div className="separator" />
      <section className="detail-section">
        <h3>General</h3>
        <label>Location</label>
        <p className="project-path">{project?.path ?? "Select a project to view its location."}</p>
        <div className="detail-metric">
          <span>Project Size</span>
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
        <Button disabled={!project || project.health === "missing"} onClick={onReveal}>Show in Explorer</Button>
      </section>
      <div className="separator" />
      <section className="detail-section">
        <h3>Scripting</h3>
        <p className="detail-value">{project ? (project.scripting ? "C# enabled" : "Disabled") : "—"}</p>
        {project && project.health !== "ready" && <p className={`validation-message ${project.health}`}>{project.message}</p>}
      </section>
    </div>
    <div className="inspector-action">
      <Button
        accent={Boolean(project?.health === "ready" && editorReady)}
        disabled={!project || project.health === "invalid"}
        onClick={project?.health === "missing" ? onRelink : editorReady ? onOpen : onConfigure}
      >
        {project?.health === "missing" ? "Relink Project" : editorReady ? "Open in CrownEditor" : "Configure CrownEditor"}
      </Button>
    </div>
  </aside>;
}

export function ProjectsPage({ snapshot, selected, projectSize, search, setSearch, onSelect, onImport, onNew, onCreateSample, onOpen, onPin, onReveal, onCalculateSize, onRelink, onRemove, onDelete, onConfigure }: {
  snapshot: LauncherSnapshot;
  selected: ProjectView | null;
  projectSize: ProjectSizeState;
  search: string;
  setSearch: (value: string) => void;
  onSelect: (project: ProjectView) => void;
  onImport: () => void;
  onNew: () => void;
  onCreateSample: (sample: ProjectSampleView) => void;
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
  const lookDevSample = snapshot.samples.find((sample) => sample.id === "lookdev-gallery") ?? null;
  useEffect(() => setMenuOpen(false), [selected?.path]);

  return <div className="projects-layout" onClick={() => menuOpen && setMenuOpen(false)}>
    <main className="projects-main">
      <header className="page-heading">
        <div><h1>Projects</h1><p>A place for everything you build.</p></div>
        <div className="heading-actions"><Button onClick={onImport}>Import</Button><Button accent disabled={snapshot.templates.length === 0} onClick={onNew}><span aria-hidden="true">＋</span> New Project</Button></div>
      </header>
      <div className="project-toolbar">
        <label className="search-field"><SearchIcon /><input aria-label="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or path…" />{search && <button className="icon-button" aria-label="Clear search" onClick={() => setSearch("")}><CloseIcon /></button>}</label>
        <span className="project-count" role="status">{filtered.length} {filtered.length === 1 ? "project" : "projects"}</span>
      </div>
      {lookDevSample && <section className="featured-sample">
        <span className="featured-sample-mark"><DiamondIcon /></span>
        <div>
          <small>EXPLORE CROWN</small>
          <strong>{lookDevSample.displayName}</strong>
          <p>{lookDevSample.description}</p>
        </div>
        <Button onClick={() => onCreateSample(lookDevSample)}>Create a copy <span aria-hidden="true">↗</span></Button>
      </section>}
      <div className="project-table">
        <div className="table-header"><span>All projects</span><span>Last opened</span></div>
        <div className="project-list">
          {filtered.map((project) => <ProjectRow
            key={project.path}
            project={project}
            selected={selected?.path === project.path}
            onSelect={() => onSelect(project)}
            onOpen={() => onOpen(project)}
            onPin={() => onPin(project)}
          />)}
          {filtered.length === 0 && <div className="empty-state"><FolderIcon /><strong>{search ? "No matching projects" : "Your next idea starts here"}</strong><span>{search ? "Try a different name or path." : "Import a project or create a new one."}</span></div>}
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

export function SamplesPage({ samples, editorReady, onRefresh, onCreate }: {
  samples: ProjectSampleView[];
  editorReady: boolean;
  onRefresh: () => void;
  onCreate: (sample: ProjectSampleView) => void;
}) {
  return <main className="samples-page">
    <header className="page-heading"><div><h1>Samples</h1><p>Explore Crown. Make it your own.</p></div><Button onClick={onRefresh}><RefreshIcon /> Refresh</Button></header>
    <div className="section-caption">FROM YOUR EDITOR INSTALLATION</div>
    <div className="sample-grid">
      {samples.map((sample) => <article className="sample-card" key={sample.id}>
        <div className="sample-card-top"><span className="sample-symbol"><DiamondIcon /></span><small>{(sample.category || "SAMPLE").toLocaleUpperCase()}</small></div>
        <strong>{sample.displayName}</strong>
        <p>{sample.description}</p>
        <footer><span>{sample.scripting ? "C#  ·  Full project" : "Full project"}</span><Button onClick={() => onCreate(sample)}>Create Copy <span aria-hidden="true">↗</span></Button></footer>
      </article>)}
      {samples.length === 0 && <div className="empty-state sample-empty"><strong>{editorReady ? "No samples installed" : "Configure CrownEditor to discover samples"}</strong><span>Samples are supplied by the selected Editor installation.</span></div>}
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
      <header><strong>{title}</strong><button className="icon-button" aria-label="Close" onClick={onClose}><CloseIcon /></button></header>
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
  return <Modal title="Create Crown Project" onClose={onClose} className="create-modal">
    <div className="modal-content form-stack">
      <label className="field-caption" htmlFor="create-name">PROJECT NAME</label>
      <input id="create-name" className="text-field" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="My Crown Project" />
      <label className="field-caption" htmlFor="create-location">LOCATION</label>
      <div className="field-row"><input id="create-location" className="text-field" value={location} onChange={(event) => setLocation(event.target.value)} /><Button onClick={() => void onChooseDirectory(location).then((value) => value && setLocation(value))}>Browse</Button></div>
      <label className="field-caption" htmlFor="create-template">TEMPLATE</label>
      <div className="select-field"><select id="create-template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{snapshot.templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select><ChevronIcon /></div>
      <p className="template-description">{template?.description}</p>
      <label className={`check-row ${template?.supportsScripting ? "" : "disabled"}`}><input type="checkbox" checked={scripting} disabled={!template?.supportsScripting} onChange={(event) => setScripting(event.target.checked)} /><span className="checkbox-mark" /><span><strong>Enable C# scripting</strong><small>Creates a project-local script assembly.</small></span></label>
    </div>
    <footer className="modal-footer"><Button onClick={onClose}>Cancel</Button><Button accent disabled={busy || !name.trim() || !location || !templateId} onClick={() => void onSubmit({ displayName: name, parentDirectory: location, templateId, enableScripting: scripting })}>{busy ? "Creating…" : "Create Project"}</Button></footer>
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
  return <Modal title="Create Sample Copy" onClose={onClose} className="sample-modal">
    <div className="modal-content form-stack">
      <p className="modal-explanation">The installed sample stays read-only. Crown Launcher creates a writable project with a new identity.</p>
      <label className="field-caption" htmlFor="sample-name">PROJECT NAME</label>
      <input id="sample-name" className="text-field" autoFocus value={name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.target.value)} />
      <label className="field-caption" htmlFor="sample-location">LOCATION</label>
      <div className="field-row"><input id="sample-location" className="text-field" value={location} onChange={(event) => setLocation(event.target.value)} /><Button onClick={() => void onChooseDirectory(location).then((value) => value && setLocation(value))}>Browse</Button></div>
    </div>
    <footer className="modal-footer"><Button onClick={onClose}>Cancel</Button><Button accent disabled={busy || !name.trim() || !location} onClick={() => void onSubmit(name, location)}>{busy ? "Creating…" : snapshot.editor.ready ? "Create & Open" : "Create Copy"}</Button></footer>
  </Modal>;
}

function SettingsDialog({ snapshot, busy, onClose, onChooseDirectory, onChooseEditor, onSubmit }: {
  snapshot: LauncherSnapshot;
  busy: boolean;
  onClose: () => void;
  onChooseDirectory: (initial: string) => Promise<string | null>;
  onChooseEditor: (initial: string) => Promise<string | null>;
  onSubmit: (directory: string, editor: string) => Promise<void>;
}) {
  const [directory, setDirectory] = useState(snapshot.settings.defaultProjectDirectory);
  const [editor, setEditor] = useState(snapshot.settings.editorExecutable || snapshot.editor.executable);
  return <Modal title="Launcher Settings" onClose={onClose} className="settings-modal">
    <div className="modal-content form-stack">
      <label className="field-caption" htmlFor="settings-editor">CROWNEDITOR EXECUTABLE</label>
      <div className="field-row"><input id="settings-editor" className="text-field" value={editor} onChange={(event) => setEditor(event.target.value)} /><Button onClick={() => void onChooseEditor(editor).then((value) => value && setEditor(value))}>Choose</Button></div>
      <p className={`editor-state ${snapshot.editor.ready ? "ready" : "missing"}`}><i />{snapshot.editor.ready ? `CrownEditor ${snapshot.editor.version}` : snapshot.editor.error}</p>
      <label className="field-caption settings-directory-label" htmlFor="settings-directory">DEFAULT PROJECT LOCATION</label>
      <div className="field-row"><input id="settings-directory" className="text-field" value={directory} onChange={(event) => setDirectory(event.target.value)} /><Button onClick={() => void onChooseDirectory(directory).then((value) => value && setDirectory(value))}>Browse</Button></div>
    </div>
    <footer className="modal-footer"><Button onClick={onClose}>Cancel</Button><Button accent disabled={busy || !directory} onClick={() => void onSubmit(directory, editor)}>{busy ? "Saving…" : "Save"}</Button></footer>
  </Modal>;
}

export function App() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>("projects");
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

  const selected = snapshot.projects.find((project) => project.path === selectedPath) ?? null;
  const selectedProjectSize = selected ? projectSizes.get(selected.path) ?? idleProjectSize : idleProjectSize;
  const calculateProjectSize = (project: ProjectView) => {
    setProjectSizes((current) => new Map(current).set(project.path, {
      status: "calculating",
      label: "Calculating…",
      title: "Calculating the complete project directory size.",
    }));
    void window.crownHost.launcher.getProjectSize(project.path).then((value) => {
      if (!value.ok) {
        setProjectSizes((current) => new Map(current).set(project.path, {
          status: "error",
          label: "Retry",
          title: value.error,
        }));
        showError(value.error);
        return;
      }
      setProjectSizes((current) => new Map(current).set(project.path, {
        status: "ready",
        label: formatProjectSize(value.value.bytes),
        title: `${value.value.bytes.toLocaleString()} bytes. Click to recalculate.`,
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
      <Sidebar page={page} snapshot={snapshot} onPage={setPage} onSettings={() => setDialog("settings")} />
      <section className="content">
        {page === "build" ? <WorkbenchPage /> : loading ? <div className="loading-state">Loading projects…</div> : page === "projects" ? <ProjectsPage
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
          onCreateSample={(value) => { setSample(value); setDialog("sample"); }}
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
        /> : <SamplesPage
          samples={snapshot.samples}
          editorReady={snapshot.editor.ready}
          onRefresh={() => void refresh(selectedPath)}
          onCreate={(value) => { setSample(value); setDialog("sample"); }}
        />}
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
    {dialog === "remove" && selected && <Modal title="Remove from Project Manager?" onClose={() => setDialog(null)} className="remove-modal">
      <div className="modal-content remove-copy"><p>“{selected.name}” will be removed from this list. Project files on disk will not be deleted.</p></div>
      <footer className="modal-footer"><Button onClick={() => setDialog(null)}>Cancel</Button><Button danger disabled={busy} onClick={() => void run(async () => {
        unwrap(await window.crownHost.launcher.removeProject(selected.path));
        setDialog(null);
        await refresh();
      })}>Remove</Button></footer>
    </Modal>}
    {dialog === "delete" && selected && <Modal title="Permanently Delete Project?" onClose={() => setDialog(null)} className="delete-modal">
      <div className="modal-content delete-copy">
        <p>“{selected.name}” and every file inside it will be permanently deleted.</p>
        <code>{selected.path}</code>
        <p className="delete-warning">This action cannot be undone. The project will not be moved to the Recycle Bin.</p>
      </div>
      <footer className="modal-footer"><Button onClick={() => setDialog(null)}>Cancel</Button><Button danger disabled={busy} onClick={() => void run(async () => {
        unwrap(await window.crownHost.launcher.deleteProject(selected.path));
        setDialog(null);
        await refresh();
      })}>{busy ? "Deleting…" : "Delete Permanently"}</Button></footer>
    </Modal>}
    {error && <div className="error-toast" role="alert"><strong>!</strong><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><CloseIcon /></button></div>}
  </div>;
}
