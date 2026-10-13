import { useCallback, useEffect, useState } from "react";
import type { BuildArtifact, BuildJobView } from "../Shared/workbench";
import type { ProjectView, Result } from "../Shared/contracts";

function unwrap<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error); return result.value; }
export function artifactBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; ++unit; }
  return `${value.toFixed(2)} ${units[unit]}`;
}
export function buildDuration(ms: number | null | undefined): string {
  if (ms == null) return "历史任务未记录";
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}
const date = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "历史任务未记录";
const identityLabels = { matched: "与本次任务产物一致", replaced: "已被其他发布替换", missing: "产物不存在", damaged: "产物内容不一致", unknown: "暂时无法确认归属" };

export function BuildArtifacts({ entry, onReveal }: { entry: BuildJobView; onReveal: () => void }) {
  const [artifact, setArtifact] = useState<BuildArtifact | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState<number | null>(null);
  const [project, setProject] = useState(entry.job.runProject || "");
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { workspace, id } = entry.job;
  useEffect(() => {
    if (!entry.result) return;
    let current = true;
    setLoading(true); setError(""); setArtifact(null); setConfirm(false);
    void window.crownHost.workbench.artifact(workspace, id).then(result => {
      if (current) setArtifact(unwrap(result));
    }).catch(cause => { if (current) setError(String(cause instanceof Error ? cause.message : cause)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [workspace, id, Boolean(entry.result), refreshKey]);
  const prepare = async () => {
    setConfirm(true); setLaunched(null); setError("");
    if (!artifact?.runRequiresProject) return;
    try { setProjects(unwrap(await window.crownHost.launcher.getSnapshot()).projects.filter(value => value.health === "ready")); }
    catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
  };
  const run = useCallback(async () => {
    setLaunching(true); setError("");
    try {
      const result = unwrap(await window.crownHost.workbench.launchArtifact(workspace, id, artifact?.runRequiresProject ? project.trim() : undefined, artifact?.identity.fingerprint ?? undefined));
      setLaunched(result.processId); setConfirm(false);
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
    finally { setLaunching(false); }
  }, [workspace, id, artifact?.runRequiresProject, artifact?.identity.fingerprint, project]);
  if (!entry.result) return <div className="artifact-empty"><h3>尚无已验证产物</h3><p>构建通过后，此处显示产物大小、时间和运行入口。</p></div>;
  return <section className="build-artifacts" aria-label="构建产物">
    <div className="artifact-heading"><div><h3>{entry.job.target}</h3><p>当前发布目录 · {entry.job.platform} / {entry.job.configuration}</p></div><button className="button" disabled={loading || launching} onClick={() => setRefreshKey(value => value + 1)}>{loading ? "正在核对…" : "刷新产物"}</button></div>
    {error && <div className="build-error" role="alert">{error}</div>}
    {artifact && <>
      <div className={`artifact-identity ${artifact.identity.state}`} role="status"><strong>{identityLabels[artifact.identity.state]}</strong><p>{artifact.identity.detail}</p>{artifact.identity.fingerprint && <small>已核对发布清单中的 {artifact.identity.verifiedFiles} 个文件 · 指纹 {artifact.identity.fingerprint.slice(0, 12)}</small>}</div>
      <div className="artifact-actions"><button className="button button-accent" disabled={!artifact.canRun || loading || launching || ["running", "queued"].includes(entry.job.state)} onClick={() => void prepare()}>直接运行</button><button className="button" onClick={onReveal}>打开产物目录</button></div>
      <p className="artifact-note">直接运行不会重新构建，也不验证当前源码。这里是共享产物目录，后续构建可能覆盖它，并非此历史任务的独立快照。启动不会改写本次构建结果；需要验证最新源码时，请使用“构建并运行”。</p>
      {!artifact.canRun && <p className="artifact-note">产物缺失、未通过完整性核对或没有可用的运行约定，不能直接运行；请重新构建或重新连接 CBT。</p>}
      {confirm && <div className="artifact-run-confirm"><h4>运行当前产物</h4>{artifact.runRequiresProject && <div className="build-run-project"><label htmlFor="artifact-project">运行项目</label>{projects.length > 0 && <select className="text-field" aria-label="产物运行项目" value={projects.some(value => value.path === project) ? project : ""} onChange={event => setProject(event.target.value)}><option value="">选择已有项目…</option>{projects.map(value => <option key={value.path} value={value.path}>{value.name}</option>)}</select>}<input id="artifact-project" className="text-field" value={project} placeholder="包含 .crownproject 的项目目录" onChange={event => setProject(event.target.value)} /><button className="button" onClick={() => void window.crownHost.launcher.chooseDirectory(project).then(result => { const value = unwrap(result); if (value) setProject(value); }).catch(cause => setError(String(cause)))}>浏览项目…</button></div>}<p>运行此目录中当前的程序，不重新编译，不切换全局 Editor 设置。</p><div className="artifact-actions"><button className="button button-accent" disabled={launching || Boolean(artifact.runRequiresProject && !project.trim())} onClick={() => void run()}>{launching ? "启动中…" : "启动产物"}</button><button className="button" disabled={launching} onClick={() => setConfirm(false)}>返回</button></div></div>}
      {launched != null && <p className="artifact-launched" role="status">已启动（PID {launched}）。程序独立运行；这里只确认启动成功，不代表运行验收通过。</p>}
      <div className="artifact-provenance"><h4>当前产物 · 最近验证记录</h4>{artifact.identity.latestVerification ? <>
        <p>{artifact.identity.latestVerification.source.branch || "未知分支"} · {artifact.identity.latestVerification.source.commit.slice(0, 12) || "未知提交"} · {artifact.identity.latestVerification.configuration}{artifact.identity.latestVerification.source.dirty ? " · 有未提交修改" : " · 请求时工作区干净"}</p>
        <p>{Object.entries(artifact.identity.latestVerification.features).map(([name, value]) => `${name}=${value}`).join(" · ")}</p>
        <p>验证时间：{date(artifact.identity.latestVerification.completedAt)} · 任务 {artifact.identity.latestVerification.jobId.slice(0, 8)}</p>
      </> : <p>最近 100 条任务中没有可关联的验证记录，不能推断当前程序的源码版本。</p>}<small>源码信息采集于该任务请求时，不是冻结的源码快照；匹配产物不等于验证了此刻的工作区。</small></div>
      <div className="artifact-metrics"><div><small>当前产物目录大小</small><strong>{artifactBytes(artifact.bytes)}</strong></div><div><small>当前主产物文件大小</small><strong>{artifactBytes(artifact.executableBytes)}</strong></div></div>
      <div className="artifact-task-timing"><h4>选中任务 · 构建记录</h4><p>{entry.job.source.branch || "未知分支"} · {entry.job.source.commit.slice(0, 12) || "未知提交"} · {entry.job.source.dirty ? "有未提交修改" : "请求时工作区干净"}</p><div className="artifact-metrics"><div><small>本次构建耗时</small><strong>{buildDuration(artifact.buildDurationMs)}</strong></div><div><small>构建完成时间</small><strong>{date(artifact.buildCompletedAt)}</strong></div></div></div>
      <p className="artifact-note">目录大小为文件逻辑大小总和，包含 DLL、资源、符号和发布元数据；不含目录外的 SDK、编译缓存，不跟随目录联接。构建耗时包含依赖准备、编译、链接与发布，不含程序运行时长。</p>
      <dl className="artifact-paths"><dt>主产物</dt><dd>{artifact.path}</dd><dt>所在目录</dt><dd>{artifact.directory}</dd><dt>文件更新时间</dt><dd>{date(artifact.modifiedAt)}</dd><dt>大小统计时间</dt><dd>{date(artifact.measuredAt)}</dd></dl>
    </>}
  </section>;
}
