import { useState } from "react";
import type { BuildJobView } from "../Shared/workbench";
import { buildDiagnostic } from "../Shared/buildDiagnostics";
import { taskDiagnostic } from "./workbenchLabels";

export function BuildDiagnostic({ entry, onLog }: { entry: BuildJobView; onLog: () => void }) {
  const [message, setMessage] = useState("");
  const diagnosis = buildDiagnostic(entry);
  if (!diagnosis) return null;
  const copy = async () => {
    try {
      const result = await window.crownHost.workbench.copyDiagnostics(entry.job.workspace, entry.job.id);
      setMessage(result.ok ? "已复制诊断信息" : result.error);
    } catch (error) { setMessage(String(error)); }
  };
  return <section className={`build-diagnostic ${entry.job.state}`} aria-label="任务诊断">
    <div className="diagnostic-heading"><h3>{diagnosis.title}</h3><button className="button" onClick={() => void copy()}>复制诊断信息</button><button className="button" onClick={onLog}>查看完整日志</button></div>
    <p>{diagnosis.note}</p>
    {entry.job.error && <p title={entry.job.error}>{taskDiagnostic(entry.job.error)}</p>}
    <dl><dt>阶段 / 目标</dt><dd>{diagnosis.stage} · {diagnosis.target}</dd><dt>{diagnosis.codeSource}</dt><dd>{diagnosis.code}</dd>
      {diagnosis.action && <><dt>最早失败动作</dt><dd>{diagnosis.action.module} · {diagnosis.action.label}{diagnosis.failedCount > 1 && `（共 ${diagnosis.failedCount} 个失败动作）`}</dd></>}</dl>
    {diagnosis.errors.length ? <><small>{diagnosis.errorSource}；首条已识别错误</small><pre>{diagnosis.errors[0]}</pre>{diagnosis.errors.length > 1 && <details><summary>其余诊断（{diagnosis.errors.length - 1}）</summary><pre>{diagnosis.errors.slice(1).join("\n")}</pre></details>}</> : <p>没有识别到原始错误行。{entry.job.error || "请查看完整日志。"}</p>}
    <small>复制内容包含本地路径、源码版本和错误摘录；仅写入剪贴板，不自动上传。</small>
    {message && <p role="status">{message}</p>}
  </section>;
}
