import { useCallback, useEffect, useRef, useState } from "react";
import type { Result } from "../Shared/contracts";
import type { BuildCapabilities, BuildDescription, BuildJobView, BuildRequest } from "../Shared/workbench";
import { FolderIcon, RefreshIcon } from "./icons";
import "./workbench.css";

function unwrap<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error); return result.value; }
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const active = (job: BuildJobView) => job.job.state === "queued" || job.job.state === "running";
const phases: Record<string, string> = { planning: "Resolving build graph", "waiting-for-lock": "Waiting for CBT build lock", preparing: "Preparing dependencies and tools", validating: "Validating inputs and cache", building: "Compiling and linking", publishing: "Verifying and publishing", "running-product": "Product running" };
function time(value: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

export function BuildTaskDetails({ entry, onCancel, onReveal }: { entry: BuildJobView | null; onCancel: () => void; onReveal: (item: "log" | "artifact") => void }) {
  const logRef = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => { if (follow.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [entry?.log]);
  useEffect(() => { follow.current = true; }, [entry?.job.id]);
  if (!entry) return <section className="build-task build-no-task"><FolderIcon /><h2>No build selected</h2><p>Choose a workspace and configuration, then start a build.</p><p>CLI builds from this workspace appear here too.</p></section>;
  const { job, progress, result } = entry;
  const end = active(entry) ? Date.now() : new Date(job.finishedAt || job.heartbeatAt || job.createdAt).getTime();
  const elapsed = Math.max(0, Math.floor((end - new Date(job.startedAt || job.createdAt).getTime()) / 1000));
  const duration = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
  return <section className="build-task">
    <header className="build-task-heading"><div><div className="build-eyebrow">{job.origin === "cli" ? "COMMAND LINE" : "LAUNCHER"} · {job.command === "run" ? "BUILD & RUN" : "BUILD"}</div><h2>{job.target}</h2></div><span className={`build-status ${job.state}`}>{job.state}</span>{active(entry) && <button className="button" disabled={entry.cancellationRequested} onClick={onCancel}>{entry.cancellationRequested ? "Cancelling…" : "Cancel task"}</button>}</header>
    <div className="build-task-meta"><span>{job.platform} / {job.configuration}</span><span>{duration}</span><span title={job.source.commit}>{job.source.branch || "Detached / unknown"} · {job.source.commit.slice(0, 8) || "unknown"}</span>{job.source.dirty && <span className="build-dirty">Uncommitted changes</span>}</div>
    <div className="build-phase"><i className={active(entry) ? "active" : ""} /><span>{active(entry) ? (phases[progress?.phase || ""] || "Starting CBT task") : job.state === "succeeded" ? "Task completed" : job.state === "cancelled" ? "Task cancelled" : job.state === "interrupted" ? "Task interrupted" : "Task failed"}</span>{progress && active(entry) && progress.target !== job.target && <small>{progress.target}</small>}</div>
    <div className="build-evidence"><div><small>BUILD</small><strong>{result ? "Verified build" : active(entry) ? "In progress" : "Not verified"}</strong></div><div><small>AUTOMATED TESTS</small><strong>Not run</strong></div><div><small>HUMAN ACCEPTANCE</small><strong>Pending</strong></div></div>
    {progress?.plannedActions != null && <p className="build-counts">{progress.target}: {progress.plannedActions} planned actions{progress.invalidatedActions != null ? ` · ${progress.invalidatedActions} invalidated receipts` : ""}. This is a plan count, not a completed percentage.</p>}
    {job.error && <div className="build-error" role="alert">{job.error}</div>}
    {progress?.phase === "running-product" && active(entry) && <p className="build-notice">The product is running. This task completes when it exits; cancellation also stops this task’s product process.</p>}
    <div className="build-log-heading"><span>Live output <small>Latest 64 KiB</small></span><button className="button" onClick={() => onReveal("log")}>Log file</button>{result && <button className="button" onClick={() => onReveal("artifact")}>Artifact folder</button>}</div>
    <pre className="build-log" ref={logRef} tabIndex={0} aria-label="Build output" onScroll={event => { const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40; }}>{entry.log || (active(entry) ? "Waiting for CBT output…" : "No output was recorded.")}</pre>
    <details className="build-record"><summary>Task record and provenance</summary><dl><dt>Task</dt><dd>{job.id}</dd><dt>Created</dt><dd>{time(job.createdAt)}</dd><dt>Finished</dt><dd>{time(job.finishedAt)}</dd><dt>Features</dt><dd>{Object.entries(job.features).map(([name, value]) => `${name}=${value}`).join(" · ")}</dd><dt>Artifact</dt><dd>{result?.artifact || "None"}</dd><dt>Graph</dt><dd>{result?.buildGraphFingerprint || "Not recorded"}</dd></dl><p>Artifacts are shared CBT output. A later build may replace them. Build & Run always asks CBT to validate current inputs; it does not launch an old executable from history.</p>{job.source.dirty && <p>This source tree contained uncommitted changes and was not frozen as a reproducible snapshot.</p>}</details>
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
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [history, setHistory] = useState<BuildJobView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [entry, setEntry] = useState<BuildJobView | null>(null);
  const [description, setDescription] = useState<{ key: string; value: BuildDescription } | null>(null);
  const [descriptionError, setDescriptionError] = useState("");
  const [confirmRun, setConfirmRun] = useState(false);
  const connectionId = useRef(0);
  const selection = useRef("");
  selection.current = selectedId;

  const connect = useCallback(async (root: string) => {
    const attempt = ++connectionId.current;
    setBusy("Connecting to CBT…"); setError(""); setCapabilities(null); setEntry(null); setHistory([]); setSelectedId(""); setDescription(null); setConfirmRun(false);
    try {
      const value = unwrap(await window.crownHost.workbench.connect(root));
      if (connectionId.current !== attempt) return;
      setCapabilities(value); setWorkspace(value.workspace); setTarget(value.targets.find(item => item.name === "CrownEditor")?.name || value.targets[0]?.name || "");
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
    setBusy("Starting task…"); setError(""); setConfirmRun(false);
    try { const result = unwrap(await window.crownHost.workbench.start({ ...request, operation })); setSelectedId(result.jobId); setEntry(null); }
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
  return <main className="workbench-page">
    <header className="page-heading"><div><h1>Build</h1><p>Your workspace, configuration and build results. Powered by CBT.</p></div><span className="build-engine-tag">Crown Build Tool</span></header>
    <div className="build-workspace"><FolderIcon /><input className="text-field" aria-label="Source workspace" list="build-workspaces" placeholder="Choose a CrownEngine source workspace…" value={workspace} disabled={Boolean(busy)} onChange={event => setWorkspace(event.target.value)} /><datalist id="build-workspaces">{known.map(root => <option key={root} value={root} />)}</datalist><button className="button" disabled={Boolean(busy)} onClick={() => void window.crownHost.workbench.chooseWorkspace().then(result => { const root = unwrap(result); if (root) { setWorkspace(root); void connect(root); } }).catch(cause => setError(message(cause)))}>Browse</button><button className="button" disabled={Boolean(busy) || !workspace.trim()} onClick={() => void connect(workspace)}><RefreshIcon />{busy.startsWith("Connecting") ? "Connecting…" : capabilities ? "Reconnect" : "Connect"}</button></div>
    {error && <div className="build-error" role="alert">{error}<button aria-label="Dismiss build error" onClick={() => setError("")}>×</button></div>}
    {pollError && <div className="build-error" role="alert">Status unavailable: {pollError}. Last displayed information may be stale.</div>}
    {capabilities && workspace !== capabilities.workspace && <p className="build-notice">History below belongs to {capabilities.workspace}. Connect the edited path before building there.</p>}
    {!capabilities ? <section className="build-welcome"><h2>{busy || "Connect your source workspace"}</h2><p>Choose the CrownEngine folder containing CrownBuild.ps1. Only connect source trees you trust: CBT compiles and executes their build rules.</p><p>Connecting queries targets and configurations; it does not build the engine or run Standard.</p></section> : <div className="build-layout">
      <aside className="build-sidebar"><section className="build-config"><div className="build-config-fields"><h2>Configuration</h2><div className="build-source"><span>{capabilities.source.branch || "Detached HEAD"}</span><code>{capabilities.source.commit.slice(0, 8)}</code>{capabilities.source.dirty && <small>Uncommitted changes</small>}</div>
        <label htmlFor="build-target">Target</label><select id="build-target" className="text-field" value={target} onChange={event => setTarget(event.target.value)}>{capabilities.targets.map(item => <option key={item.name} value={item.name}>{item.name} · {item.kind}</option>)}</select>
        <div className="build-field-grid"><div><label htmlFor="build-configuration">Configuration</label><select id="build-configuration" className="text-field" value={configuration} onChange={event => setConfiguration(event.target.value)}>{capabilities.configurations.map(value => <option key={value}>{value}</option>)}</select></div><div><label htmlFor="build-jobs">Parallel jobs</label><input id="build-jobs" className="text-field" type="number" min={1} max={64} value={jobs} onChange={event => setJobs(Number(event.target.value))} /></div></div>
        <label htmlFor="build-platform">Platform</label><select id="build-platform" className="text-field" value={platform} onChange={event => setPlatform(event.target.value)}>{capabilities.platforms.map(value => <option key={value}>{value}</option>)}</select>
        <details className="build-features"><summary>Features <small>{Object.values(features).filter(value => value === "true").length} / {capabilities.features.length} enabled</small></summary>{capabilities.features.map(feature => <label className="build-feature" key={feature.name}><input type="checkbox" checked={features[feature.name] === "true"} onChange={event => setFeatures(previous => ({ ...previous, [feature.name]: String(event.target.checked) }))} /><span><strong>{feature.name}</strong><small>{feature.description}</small></span></label>)}</details>
        {descriptionError ? <p className="build-inline-error">{descriptionError}</p> : description?.key === requestKey ? <details className="build-plan"><summary>{description.value.modules.length} modules · {description.value.modules.reduce((sum, module) => sum + module.sources, 0)} source entries</summary><p>CBT determines reuse and rebuilds during input validation. Selecting a configuration does not prepare dependencies.</p><ul>{description.value.modules.map(module => <li key={module.name}>{module.name}<span>{module.sources}</span></li>)}</ul></details> : <p className="build-plan-pending">Resolving configuration…</p>}
        </div><div className="build-start-actions"><button className="button button-accent" disabled={!ready} onClick={() => void start("build")}>{busy === "Starting task…" ? "Starting…" : "Build"}</button><button className="button" disabled={!ready || !capability?.canRun} onClick={() => setConfirmRun(true)}>Build & Run</button></div>
        {confirmRun && <div className="build-run-confirm"><p>Build and launch {target} using this configuration. The task stays active until the product exits. Cancelling it also stops the launched product.</p><button className="button button-accent" disabled={!ready} onClick={() => void start("run")}>Start</button><button className="button" onClick={() => setConfirmRun(false)}>Back</button></div>}
        <p className="build-policy">No automatic Standard or other test profile. Builds and tests are separate results.</p>
      </section><section className="build-history"><h2>Task history <small>{history.length}</small></h2>{history.length === 0 && <p>No recorded builds in this workspace.</p>}{history.map(item => <button className={`build-history-item ${item.job.id === selectedId ? "selected" : ""}`} key={item.job.id} onClick={() => { setSelectedId(item.job.id); setEntry(item); }}><span><strong>{item.job.target}</strong><small>{item.job.configuration} · {item.job.origin.toUpperCase()}</small></span><i className={`build-status ${item.job.state}`}>{item.job.state}</i></button>)}</section></aside>
      <BuildTaskDetails entry={entry} onCancel={() => void cancel()} onReveal={item => void reveal(item)} />
    </div>}
    <footer className="build-footer">Tasks keep running when Launcher closes. Reopen this workspace to follow them. Cancel only stops the selected task.</footer>
  </main>;
}
