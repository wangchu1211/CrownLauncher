import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectView, Result } from "../Shared/contracts";
import type { BuildCapabilities, BuildDescription, BuildJobView, BuildRequest } from "../Shared/workbench";
import { FolderIcon, RefreshIcon } from "./icons";
import { buildOrigins, buildPhases, buildStates, featureDescription } from "./workbenchLabels";
import { BuildTargetPicker } from "./BuildTargetPicker";
import { defaultBuildTarget, targetWarning } from "./buildTargets";
import { BuildExecutionGraph } from "./BuildExecutionGraph";
import { BuildArtifacts } from "./BuildArtifacts";
import { BuildDiagnostic } from "./BuildDiagnostic";
import "./workbench.css";

function unwrap<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error); return result.value; }
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const active = (job: BuildJobView) => job.job.state === "queued" || job.job.state === "running";
function time(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "—"; }

export function BuildTaskDetails({ entry, onCancel, onReveal }: { entry: BuildJobView | null; onCancel: () => void; onReveal: (item: "log" | "artifact") => void }) {
  const [tab, setTab] = useState<"summary" | "graph" | "log" | "artifacts">("graph");
  const logRef = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => { if (follow.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [entry?.log]);
  useEffect(() => { follow.current = true; }, [entry?.job.id]);
  useEffect(() => { setTab("graph"); }, [entry?.job.id]);
  if (!entry) return <section className="build-task build-no-task"><FolderIcon /><h2>尚未选择构建任务</h2><p>选择工作区和配置，然后开始构建。</p><p>此工作区通过 CLI 发起的构建也会显示在这里。</p></section>;
  const { job, progress, result } = entry;
  const runFailed = job.command === "run" && job.state === "failed" && result?.outcome === "build-passed" && progress?.phase === "running-product";
  const end = active(entry) ? Date.now() : new Date(job.finishedAt || job.heartbeatAt || job.createdAt).getTime();
  const elapsed = Math.max(0, Math.floor((end - new Date(job.startedAt || job.createdAt).getTime()) / 1000));
  const duration = elapsed >= 60 ? `${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒` : `${elapsed} 秒`;
  return <section className="build-task">
    <header className="build-task-heading"><div><div className="build-eyebrow">{buildOrigins[job.origin]} · {job.command === "run" ? "构建并运行" : "构建"}</div><h2>{job.target}</h2></div><span className={`build-status ${job.state}`}>{buildStates[job.state]}</span>{active(entry) && <button className="button" disabled={entry.cancellationRequested} onClick={onCancel}>{entry.cancellationRequested ? "正在取消…" : "取消任务"}</button>}</header>
    <div className="build-task-meta"><span>{job.platform} / {job.configuration}</span><span title="含构建与程序运行时间">任务总时长 {duration}</span><span title={job.source.commit}>{job.source.branch || "分离 HEAD / 未知分支"} · {job.source.commit.slice(0, 8) || "未知提交"}</span>{job.source.dirty && <span className="build-dirty">有未提交的修改</span>}</div>
    <div className="build-phase"><i className={active(entry) ? "active" : ""} /><span>{active(entry) ? (buildPhases[progress?.phase || ""] || progress?.phase || "正在启动 CBT 任务") : job.state === "succeeded" ? "任务已完成" : job.state === "cancelled" ? "任务已取消" : job.state === "interrupted" ? "任务已中断" : runFailed ? "构建已通过，程序运行失败" : "任务失败"}</span>{progress && active(entry) && progress.target !== job.target && <small>{progress.target}</small>}</div>
    <div className="build-detail-tabs" role="tablist" aria-label="构建任务视图">{([["summary", "摘要"], ["graph", "构建图"], ["log", "日志"], ["artifacts", "产物"]] as const).map(([value, label]) => <button key={value} role="tab" id={"build-tab-" + value} aria-controls={"build-panel-" + value} aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    <div className="build-tab-panel build-summary" id="build-panel-summary" role="tabpanel" aria-labelledby="build-tab-summary" hidden={tab !== "summary"}>
    <h3>{runFailed ? "构建已完成，运行未成功" : job.state === "succeeded" ? "构建已完成" : active(entry) ? "构建正在进行" : "本次任务未成功完成"}</h3>
    <p>{job.command === "build" ? "本次仅构建，不启动程序，不执行自动测试。" : "本次构建并启动程序，任务在程序退出后结束。不执行自动测试。"}</p>
    <div className="build-evidence"><div><small>构建结果</small><strong>{result ? "构建已验证" : active(entry) ? "构建中" : "未验证"}</strong></div><div><small>自动测试</small><strong>未运行</strong></div><div><small>人工验收</small><strong>待验收</strong></div></div>
    {progress?.plannedActions != null && <p className="build-counts">{progress.target}：计划执行 {progress.plannedActions} 项操作{progress.invalidatedActions != null ? ` · ${progress.invalidatedActions} 项缓存凭据失效` : ""}。这是计划数量，不代表完成百分比。</p>}
    {result && <button className="button" onClick={() => onReveal("artifact")}>打开产物目录</button>}
    </div>
    <BuildDiagnostic key={job.id} entry={entry} onLog={() => onReveal("log")} />
    {job.runProject && <p className="build-run-project-record">运行项目：{job.runProject}</p>}
    {progress?.phase === "running-product" && active(entry) && <p className="build-notice">程序正在运行，退出后任务才会结束。取消任务也会停止本任务启动的程序。</p>}
    <div className="build-tab-panel" id="build-panel-graph" role="tabpanel" aria-labelledby="build-tab-graph" hidden={tab !== "graph"}><BuildExecutionGraph key={job.id} entry={entry} /></div>
    <div className="build-tab-panel" id="build-panel-artifacts" role="tabpanel" aria-labelledby="build-tab-artifacts" hidden={tab !== "artifacts"}>{tab === "artifacts" && <BuildArtifacts key={job.id} entry={entry} onReveal={() => onReveal("artifact")} />}</div>
    <div className="build-tab-panel" id="build-panel-log" role="tabpanel" aria-labelledby="build-tab-log" hidden={tab !== "log"}>
    <div className="build-log-heading"><span>实时日志 <small>最近 64 KiB</small></span><button className="button" onClick={() => onReveal("log")}>日志文件</button>{result && <button className="button" onClick={() => onReveal("artifact")}>产物目录</button>}</div>
    <pre className="build-log" ref={logRef} tabIndex={0} aria-label="构建日志" onScroll={event => { const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40; }}>{entry.log || (active(entry) ? "等待 CBT 输出…" : "未记录到日志输出。")}</pre>
    </div>
    <details className="build-record"><summary>任务记录与来源</summary><dl><dt>任务 ID</dt><dd>{job.id}</dd><dt>创建时间</dt><dd>{time(job.createdAt)}</dd><dt>结束时间</dt><dd>{time(job.finishedAt)}</dd><dt>功能开关</dt><dd>{Object.entries(job.features).map(([name, value]) => `${name}=${value}`).join(" · ")}</dd><dt>构建产物</dt><dd>{result?.artifact || "无"}</dd><dt>构建图指纹</dt><dd>{result?.buildGraphFingerprint || "未记录"}</dd></dl><p>产物位于 CBT 共享输出目录，后续构建可能覆盖它们。“构建并运行”会先让 CBT 校验当前输入，不会直接启动历史任务中的旧程序。</p>{job.source.dirty && <p>本次源码含有未提交的修改，未保存为可复现的固定快照。</p>}</details>
  </section>;
}

export function WorkbenchPage() {
  const [known, setKnown] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [capabilities, setCapabilities] = useState<BuildCapabilities | null>(null);
  const [target, setTarget] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [platform, setPlatform] = useState("");
  const [features, setFeatures] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState(4);
  const [busy, setBusy] = useState<"" | "connecting" | "starting">("");
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [history, setHistory] = useState<BuildJobView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [entry, setEntry] = useState<BuildJobView | null>(null);
  const [description, setDescription] = useState<{ key: string; value: BuildDescription } | null>(null);
  const [descriptionError, setDescriptionError] = useState("");
  const [confirmRun, setConfirmRun] = useState(false);
  const [runProject, setRunProject] = useState("");
  const [runProjects, setRunProjects] = useState<ProjectView[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const connectionId = useRef(0);
  const selection = useRef("");
  selection.current = selectedId;

  const connect = useCallback(async (root: string) => {
    const attempt = ++connectionId.current;
    setBusy("connecting"); setError(""); setCapabilities(null); setEntry(null); setHistory([]); setSelectedId(""); setDescription(null); setConfirmRun(false);
    try {
      const value = unwrap(await window.crownHost.workbench.connect(root));
      if (connectionId.current !== attempt) return;
      setCapabilities(value); setWorkspace(value.workspace); setTarget(defaultBuildTarget(value.targets));
      setConfiguration(value.configurations.find(item => item === "Shipping") || value.configurations[0] || ""); setPlatform(value.platforms[0] || "");
      setFeatures(Object.fromEntries(value.features.map(feature => [feature.name, feature.defaultValue])));
      setKnown(previous => [value.workspace, ...previous.filter(item => item !== value.workspace)]);
    } catch (cause) { if (connectionId.current === attempt) setError(message(cause)); }
    finally { if (connectionId.current === attempt) setBusy(""); }
  }, []);

  useEffect(() => {
    let mounted = true;
    void window.crownHost.workbench.getWorkspaces().then(result => {
      if (!mounted) return;
      try { const values = unwrap(result); setKnown(values); if (values[0]) { setWorkspace(values[0]); void connect(values[0]); } } catch (cause) { setError(message(cause)); }
    });
    return () => { mounted = false; ++connectionId.current; };
  }, [connect]);

  const request: BuildRequest = { workspace: capabilities?.workspace || "", target, configuration, platform, features, jobs, operation: "build" };
  const requestKey = JSON.stringify(request);
  useEffect(() => {
    if (!capabilities || !target) return;
    let current = true;
    setDescriptionError(""); setConfirmRun(false);
    const timer = window.setTimeout(() => {
      void window.crownHost.workbench.describe(JSON.parse(requestKey) as BuildRequest).then(result => {
        if (!current) return;
        if (result.ok) setDescription({ key: requestKey, value: result.value }); else setDescriptionError(result.error);
      }).catch(cause => { if (current) setDescriptionError(message(cause)); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [capabilities, target, requestKey]);

  useEffect(() => {
    if (!capabilities) return;
    let current = true; let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const value = unwrap(await window.crownHost.workbench.history(capabilities.workspace));
        const id = selection.current || value.jobs[0]?.job.id || "";
        const detail = id ? unwrap(await window.crownHost.workbench.job(capabilities.workspace, id)) : null;
        if (!current) return;
        setHistory(value.jobs); setPollError(value.warnings.join("\n"));
        if (!selection.current) setSelectedId(id);
        if (!selection.current || selection.current === id) setEntry(detail);
      } catch (cause) { if (current) setPollError(message(cause)); }
      finally { pending = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 1500);
    return () => { current = false; window.clearInterval(timer); };
  }, [capabilities, selectedId]);

  const start = async (operation: "build" | "run") => {
    setBusy("starting"); setError(""); setConfirmRun(false);
    try { const result = unwrap(await window.crownHost.workbench.start({ ...request, operation, ...(operation === "run" && capability?.runRequiresProject ? { runProject: runProject.trim() } : {}) })); setSelectedId(result.jobId); setEntry(null); }
    catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  };
  const cancel = async () => {
    if (!entry || !capabilities) return;
    try { unwrap(await window.crownHost.workbench.cancel(capabilities.workspace, entry.job.id)); setEntry({ ...entry, cancellationRequested: true }); }
    catch (cause) { setError(message(cause)); }
  };
  const reveal = async (item: "log" | "artifact") => {
    if (!entry || !capabilities) return;
    try { unwrap(await window.crownHost.workbench.reveal(capabilities.workspace, entry.job.id, item)); } catch (cause) { setError(message(cause)); }
  };
  const ready = capabilities && workspace === capabilities.workspace && description?.key === requestKey && !descriptionError && !busy;
  const capability = capabilities?.targets.find(item => item.name === target);
  const prepareRun = async () => {
    setConfirmRun(true); setError("");
    if (!capability?.runRequiresProject) return;
    setLoadingProjects(true);
    try { setRunProjects(unwrap(await window.crownHost.launcher.getSnapshot()).projects.filter(project => project.health === "ready")); }
    catch (cause) { setError(message(cause)); }
    finally { setLoadingProjects(false); }
  };
  return <main className="workbench-page" lang="zh-CN">
    <header className="page-heading"><div><h1>构建工作台</h1><p>管理工作区、构建配置与结果，由 CBT 驱动。</p></div><span className="build-engine-tag">Crown Build Tool</span></header>
    <div className="build-workspace"><FolderIcon /><input className="text-field" aria-label="源码工作区" list="build-workspaces" placeholder="选择 CrownEngine 源码工作区…" value={workspace} disabled={Boolean(busy)} onChange={event => setWorkspace(event.target.value)} /><datalist id="build-workspaces">{known.map(root => <option key={root} value={root} />)}</datalist><button className="button" disabled={Boolean(busy)} onClick={() => void window.crownHost.workbench.chooseWorkspace().then(result => { const root = unwrap(result); if (root) { setWorkspace(root); void connect(root); } }).catch(cause => setError(message(cause)))}>浏览</button><button className="button" disabled={Boolean(busy) || !workspace.trim()} onClick={() => void connect(workspace)}><RefreshIcon />{busy === "connecting" ? "连接中…" : capabilities ? "重新连接" : "连接"}</button></div>
    {error && <div className="build-error" role="alert">{error}<button aria-label="关闭构建错误提示" onClick={() => setError("")}>×</button></div>}
    {pollError && <div className="build-error" role="alert">无法更新任务状态，当前显示的信息可能已过时。{ "\n" }{pollError}</div>}
    {capabilities && workspace !== capabilities.workspace && <p className="build-notice">下方历史记录属于 {capabilities.workspace}。请先连接修改后的路径，再在新工作区构建。</p>}
    {!capabilities ? <section className="build-welcome"><h2>{busy === "connecting" ? "正在连接 CBT…" : "连接源码工作区"}</h2><p>选择包含 CrownBuild.ps1 的 CrownEngine 目录。请仅连接可信的源码：CBT 会编译并执行其中的构建规则。</p><p>连接只会查询目标与配置，不会构建引擎或运行 Standard。</p></section> : <div className="build-layout">
      <aside className="build-sidebar"><section className="build-config"><div className="build-config-fields"><h2>构建配置</h2><div className="build-source"><span>{capabilities.source.branch || "分离 HEAD"}</span><code>{capabilities.source.commit.slice(0, 8)}</code>{capabilities.source.dirty && <small>有未提交的修改</small>}</div>
        <BuildTargetPicker targets={capabilities.targets} selected={target} onSelect={setTarget} />
        <div className="build-field-grid"><div><label htmlFor="build-configuration">配置</label><select id="build-configuration" className="text-field" value={configuration} onChange={event => setConfiguration(event.target.value)}>{capabilities.configurations.map(value => <option key={value}>{value}</option>)}</select></div><div><label htmlFor="build-jobs">并行任务数</label><input id="build-jobs" className="text-field" type="number" min={1} max={64} value={jobs} onChange={event => setJobs(Number(event.target.value))} /></div></div>
        <label htmlFor="build-platform">平台</label><select id="build-platform" className="text-field" value={platform} onChange={event => setPlatform(event.target.value)}>{capabilities.platforms.map(value => <option key={value}>{value}</option>)}</select>
        <details className="build-features"><summary>功能开关 <small>已启用 {Object.values(features).filter(value => value === "true").length} / {capabilities.features.length}</small></summary>{capabilities.features.map(feature => <label className="build-feature" key={feature.name}><input type="checkbox" checked={features[feature.name] === "true"} onChange={event => setFeatures(previous => ({ ...previous, [feature.name]: String(event.target.checked) }))} /><span><strong>{feature.name}</strong><small>{featureDescription(feature.description)}</small></span></label>)}</details>
        {descriptionError ? <p className="build-inline-error">{descriptionError}</p> : description?.key === requestKey ? <details className="build-plan"><summary>{description.value.modules.length} 个模块 · {description.value.modules.reduce((sum, module) => sum + module.sources, 0)} 个源文件条目</summary><p>CBT 会在校验输入时决定复用缓存或重新构建。选择配置不会开始准备依赖。</p><ul>{description.value.modules.map(module => <li key={module.name}>{module.name}<span>{module.sources}</span></li>)}</ul></details> : <p className="build-plan-pending">正在解析配置…</p>}
        </div><div className="build-start-actions"><button className="button button-accent" disabled={!ready} onClick={() => void start("build")}>{busy === "starting" ? "启动中…" : "构建"}</button><button className="button" disabled={!ready || !capability?.canRun} onClick={() => void prepareRun()}>构建并运行</button></div>
        {confirmRun && <div className="build-run-confirm"><p>按当前配置构建并启动 {target}。程序退出后任务才会结束，取消任务也会停止它启动的程序。</p>{capability?.runRequiresProject && <div className="build-run-project"><label htmlFor="build-run-project">运行项目</label>{runProjects.length > 0 && <select className="text-field" aria-label="选择已有项目" value={runProjects.some(project => project.path === runProject) ? runProject : ""} onChange={event => setRunProject(event.target.value)}><option value="">选择已有项目…</option>{runProjects.map(project => <option key={project.path} value={project.path}>{project.name}</option>)}</select>}<input id="build-run-project" className="text-field" value={runProject} placeholder="包含 .crownproject 的项目目录" onChange={event => setRunProject(event.target.value)} /><button className="button" disabled={loadingProjects} onClick={() => void window.crownHost.launcher.chooseDirectory(runProject).then(result => { const directory = unwrap(result); if (directory) setRunProject(directory); }).catch(cause => setError(message(cause)))}>浏览项目…</button><small>使用本次构建的 Editor 打开该项目；不会切换 Launcher 的全局 Editor 设置。</small></div>}{capability && targetWarning(capability) && <p className="target-warning">{targetWarning(capability)}</p>}<button className="button button-accent" disabled={!ready || loadingProjects || Boolean(capability?.runRequiresProject && !runProject.trim())} onClick={() => void start("run")}>开始</button><button className="button" onClick={() => setConfirmRun(false)}>返回</button></div>}
        <p className="build-policy">不会自动运行 Standard 或其他测试。构建与测试结果分别记录。</p>
      </section><section className="build-history"><h2>任务历史 <small>{history.length}</small></h2>{history.length === 0 && <p>此工作区暂无构建记录。</p>}{history.map(item => <button className={`build-history-item ${item.job.id === selectedId ? "selected" : ""}`} key={item.job.id} onClick={() => { setSelectedId(item.job.id); setEntry(item); }}><span><strong>{item.job.target}</strong><small>{item.job.configuration} · {buildOrigins[item.job.origin]}</small></span><i className={`build-status ${item.job.state}`}>{buildStates[item.job.state]}</i></button>)}</section></aside>
      <BuildTaskDetails entry={entry} onCancel={() => void cancel()} onReveal={item => void reveal(item)} />
    </div>}
    <footer className="build-footer">Launcher 发起的任务在窗口关闭后仍会运行，重新打开此工作区即可继续查看。取消操作仅停止选中的任务。</footer>
  </main>;
}
