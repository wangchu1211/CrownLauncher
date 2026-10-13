import { Component, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { BuildJobView, ExecutionGraph } from "../Shared/workbench";
import { actionDuration, actionLabels, kindLabels, layoutGraph, matchesFilter, moduleViews, nodeHeight, nodeWidth, relatedNodes, type GraphFilter, type ModuleView } from "./executionGraph";
import "./build-execution-graph.css";

// A canvas render failure must not unmount the Launcher chrome or task logs.
// Keep recovery local: remounting this view never starts or cancels a build.
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="execution-empty" role="alert"><h3>画布显示遇到问题</h3><p>构建任务不受影响，仍可查看摘要和日志。重载只恢复画布，不会重新构建。</p><button className="button" onClick={() => this.setState({ failed: false })}>重载画布</button></div> : this.props.children;
  }
}

function zoomAt(previous: { x: number; y: number; scale: number }, factor: number, x: number, y: number) {
  const scale = Math.max(.12, Math.min(2, previous.scale * factor)), ratio = scale / previous.scale;
  return { scale, x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio };
}

export function ModuleDetails({ node, graph, onClose }: { node: ModuleView; graph: ExecutionGraph; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const actions = node.actions.filter(action => (!onlyActive || ["running", "failed", "blocked"].includes(action.state)) && (action.label + action.id).toLowerCase().includes(query.trim().toLowerCase()));
  const byId = new Map(graph.actions.map(action => [action.id, action]));
  return <aside className="execution-inspector" aria-label="模块子任务">
    <header><div><small>{node.kind === "module" ? "MODULE" : "构建阶段"}</small><h3>{node.name}</h3></div><button className="icon-button" aria-label="关闭模块详情" title="关闭模块详情（Esc）" onClick={onClose}>×</button></header>
    <p><span className={"execution-state " + node.state}>{actionLabels[node.state]}</span> · {node.actions.length} 个子任务</p>
    <p className="execution-detail-note">依赖：{node.dependencies.map(id => graph.modules.find(module => module.id === id)?.name ?? id).join("、") || "无"}。模块连线不代表源文件必须串行编译。</p>
    <input className="text-field" aria-label="搜索模块子任务" placeholder="搜索源文件或子任务…" value={query} onChange={event => setQuery(event.target.value)} />
    <label className="execution-active-filter"><input type="checkbox" checked={onlyActive} onChange={event => setOnlyActive(event.target.checked)} />仅执行中 / 失败 / 受阻</label>
    <div className="execution-action-list">{actions.length === 0 && <p className="execution-detail-note">没有匹配的子任务。</p>}{actions.map(action => <details className={"execution-action " + action.state} key={action.id}>
      <summary><span><small>{kindLabels[action.kind] ?? action.kind} · {actionLabels[action.state]}</small><strong title={action.label}>{action.label.replaceAll("\\", "/").split("/").at(-1)}</strong></span><time>{actionDuration(action, Date.now())}</time></summary>
      <p className="execution-path">{action.label}</p>
      <p>{action.exitCode != null ? "退出码：" + action.exitCode : action.state === "prepared" ? "在进入本编译图之前已准备；不推断是否重新构建。" : action.state === "reused" ? "Ninja 成功结束，本动作无需执行。" : action.needsBuild ? "本次计划需要重新构建。" : "已校验缓存；是否执行以实际事件为准。"}</p>
      <p>动作依赖：{action.dependencies.length === 0 ? "无" : ""}</p><ul>{action.dependencies.map(id => <li key={id}>{byId.get(id)?.label ?? id} · {byId.has(id) ? actionLabels[byId.get(id)!.state] : "外部依赖"}</li>)}</ul>
    </details>)}</div>
  </aside>;
}

function ExecutionCanvas({ graph }: { graph: ExecutionGraph }) {
  const nodes = useMemo(() => moduleViews(graph), [graph]);
  const layout = useMemo(() => layoutGraph(graph.modules), [graph.id]);
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState<GraphFilter>("all");
  const [view, setView] = useState(() => ({ x: (700 - layout.width) / 2, y: (380 - layout.height) / 2, scale: 1 }));
  const [panning, setPanning] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; buttons: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const arrow = useId().replaceAll(":", "");
  const [dimensions, setDimensions] = useState({ width: 700, height: 380 });
  const previousDimensions = useRef(dimensions);
  const selectedNode = nodes.find(node => node.id === selected);
  const related = selectedNode ? relatedNodes(nodes, selected) : null;
  useEffect(() => {
    const element = viewport.current!;
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (width > 0 && height > 0) setDimensions({ width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      // React's delegated wheel listener is passive. This local non-passive
      // listener owns scrolling only over the canvas, without stealing focus
      // or intercepting the neighboring configuration / module detail panes.
      event.preventDefault(); event.stopPropagation();
      if (drag.current || !Number.isFinite(event.deltaY)) return;
      const bounds = element.getBoundingClientRect();
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      const factor = Math.exp(-Math.max(-240, Math.min(240, delta)) * .002);
      setView(previous => zoomAt(previous, factor, x, y));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const fit = () => {
    const scale = Math.min(1, Math.max(.12, Math.min((dimensions.width - 32) / layout.width, (dimensions.height - 32) / layout.height)));
    setView({ scale, x: (dimensions.width - layout.width * scale) / 2, y: (dimensions.height - layout.height * scale) / 2 });
  };
  useEffect(() => {
    const previous = previousDimensions.current;
    previousDimensions.current = dimensions;
    // Preserve the user's zoom and graph point at the viewport center when
    // resizing / expanding. The floating inspector never resizes the viewport.
    // Fit-to-view is an explicit action.
    const x = (dimensions.width - previous.width) / 2, y = (dimensions.height - previous.height) / 2;
    if (x || y) setView(view => ({ ...view, x: view.x + x, y: view.y + y }));
  }, [dimensions.width, dimensions.height]);
  const zoom = (factor: number) => setView(previous => zoomAt(previous, factor, dimensions.width / 2, dimensions.height / 2));
  const closeDetails = () => {
    setSelected("");
    viewport.current?.focus({ preventScroll: true });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const focusRunning = () => {
    const live = nodes.filter(node => node.running > 0);
    if (!live.length) return;
    const points = live.map(node => layout.positions.get(node.id)!);
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length + nodeWidth / 2;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length + nodeHeight / 2;
    setFilter("all"); setView(previous => ({ ...previous, x: dimensions.width / 2 - x * previous.scale, y: dimensions.height / 2 - y * previous.scale }));
  };
  const complete = graph.actions.filter(action => ["succeeded", "reused", "prepared"].includes(action.state)).length;
  const running = graph.actions.filter(action => action.state === "running").length;
  return <div className="execution-graph" onKeyDown={event => {
    if (event.key === "Escape" && selectedNode) {
      // Close the local inspector before letting Esc collapse an expanded canvas.
      event.preventDefault(); event.stopPropagation(); closeDetails();
    }
  }}>
    <div className="execution-toolbar">
      <div className="execution-filters" role="group" aria-label="构建图筛选">{([["all", "全部"], ["running", "执行中"], ["problems", "异常"], ["changed", "本次重建"]] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div className="execution-zoom"><button aria-label="缩小构建图" onClick={() => zoom(1 / 1.2)}>−</button><span>{Math.round(view.scale * 100)}%</span><button aria-label="放大构建图" onClick={() => zoom(1.2)}>＋</button><button onClick={fit}>适应全图</button><button disabled={!running} onClick={focusRunning}>定位执行中</button></div>
    </div>
    <div className="execution-stats" role="status"><span>{nodes.filter(node => node.kind === "module").length} 个 Module</span><span>{running} 个子任务执行中</span><span>{complete} / {graph.actions.length} 项已就绪</span><small>含复用和已准备；不是时间进度</small></div>
    <div className="execution-body">
      <div className={"execution-viewport" + (panning ? " panning" : "")} ref={viewport} tabIndex={0} aria-label="Module 依赖图，悬停滚轮缩放，中键拖动平移，也可左键拖动空白处" onPointerDown={event => {
        if ((event.button !== 0 && event.button !== 1) || drag.current) return;
        if (event.button === 0 && (event.target as Element).closest("button")) return;
        // Middle-drag works over nodes too. Cancel native autoscroll / selection
        // while retaining left-click on nodes for their module details.
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        drag.current = { pointerId: event.pointerId, buttons: event.button === 1 ? 4 : 1, x: event.clientX, y: event.clientY, originX: view.x, originY: view.y };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPanning(true);
      }} onPointerMove={event => {
        const gesture = drag.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        // Chorded mouse buttons emit pointerup only after the last release.
        // Stop as soon as the button that started this pan is no longer held.
        if (!(event.buttons & gesture.buttons)) { endDrag(event); return; }
        // React may run this updater after pointerup/cancel clears the ref.
        // Snapshot coordinates now so the queued update never reads mutable drag state.
        const x = gesture.originX + event.clientX - gesture.x, y = gesture.originY + event.clientY - gesture.y;
        setView(previous => ({ ...previous, x, y }));
      }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const delta = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key];
        if (delta) { event.preventDefault(); setView(previous => ({ ...previous, x: previous.x + delta[0]!, y: previous.y + delta[1]! })); }
      }}>
        <div className="execution-surface" style={{ width: layout.width, height: layout.height, transform: "translate(" + view.x + "px, " + view.y + "px) scale(" + view.scale + ")" }}>
          <svg width={layout.width} height={layout.height} aria-hidden="true">
            <defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
            {nodes.flatMap(node => node.dependencies.map(dependency => {
              const a = layout.positions.get(dependency), b = layout.positions.get(node.id);
              if (!a || !b) return null;
              const dim = related && (!related.has(dependency) || !related.has(node.id));
              const x1 = a.x + nodeWidth, y1 = a.y + nodeHeight / 2, x2 = b.x, y2 = b.y + nodeHeight / 2;
              return <path key={dependency + ":" + node.id} className={"execution-edge " + (dim ? "dim" : "")} d={"M" + x1 + "," + y1 + " C" + (x1 + 32) + "," + y1 + " " + (x2 - 32) + "," + y2 + " " + x2 + "," + y2} markerEnd={"url(#" + arrow + ")"} />;
            }))}
          </svg>
          {nodes.map(node => {
            const position = layout.positions.get(node.id)!;
            const dim = !matchesFilter(node, filter) || related && !related.has(node.id);
            return <button key={node.id} className={["execution-node", node.state, node.id === selected ? "selected" : "", dim ? "dim" : ""].join(" ")} style={{ left: position.x, top: position.y, width: nodeWidth, height: nodeHeight }} aria-label={node.name + " · " + actionLabels[node.state] + " · " + node.running + " 个执行中"} aria-pressed={node.id === selected} onClick={() => setSelected(node.id === selected ? "" : node.id)}>
              <span className="execution-node-top"><small>{node.kind === "module" ? "MODULE" : "STAGE"}</small><i className={"execution-state " + node.state}>{actionLabels[node.state]}</i></span>
              <strong title={node.name}>{node.name}</strong><span className="execution-node-counts">{node.running > 0 ? node.running + " 执行中 · " : ""}{node.completed} 完成{node.reused > 0 ? " · " + node.reused + " 复用" : ""}<small>{node.actions.length} 项</small></span>
            </button>;
          })}
        </div>
      </div>
      {selectedNode && <ModuleDetails key={selectedNode.id} node={selectedNode} graph={graph} onClose={closeDetails} />}
    </div>
    <footer className="execution-legend"><span><i className="running" />执行中</span><span><i className="succeeded" />完成</span><span><i className="reused" />复用</span><span><i className="failed" />失败 / 受阻</span><small>依赖 → 使用者 · 点击节点查看子任务 · 中键拖动 / 左键拖动空白处平移 · 悬停滚轮缩放</small></footer>
  </div>;
}

export function BuildExecutionGraph({ entry }: { entry: BuildJobView }) {
  const [expanded, setExpanded] = useState(false);
  const [chosen, setChosen] = useState("");
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    if (expanded) window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [expanded]);
  const graphs = entry.execution?.graphs ?? [];
  // Dependency products publish separate graphs before the requested Target.
  // Never replace the user's view with the latest arrival during polling.
  const mainGraph = graphs.filter(item => item.target === entry.job.target).at(-1);
  const graph = chosen ? graphs.find(item => item.id === chosen) : mainGraph;
  const waiting = entry.job.state === "running" || entry.job.state === "queued";
  const showSelector = graphs.some(item => item.id !== mainGraph?.id);
  return <section className={"execution-panel " + (expanded ? "expanded" : "")} aria-label="单次构建内部进展">
    <div className="execution-panel-heading"><span>{graph?.target ?? entry.job.target}<small>单次构建 · Module 依赖图</small></span><button className="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "收起画布" : "展开画布"}</button></div>
    {showSelector && <div className="execution-target-picker"><label className="execution-target-select"><span>查看目标</span><select className="text-field" aria-label="查看构建目标图" value={chosen} onChange={event => setChosen(event.target.value)}><option value="">{entry.job.target}（主目标{mainGraph ? "" : "，等待构建图"}）</option>{graphs.filter(item => item.id !== mainGraph?.id).map(item => <option key={item.id} value={item.id}>{item.target}（依赖产品）</option>)}</select></label><small>同一任务会先构建依赖产品，再构建主目标；此处只切换视图，不自动跳图。</small></div>}
    {entry.execution?.warnings.map(warning => <p className="build-notice" key={warning}>{warning}</p>)}
    {graph ? <CanvasBoundary key={graph.id}><ExecutionCanvas graph={graph} /></CanvasBoundary> : <div className="execution-empty"><h3>{waiting ? "等待主目标构建图" : "此目标没有构建图记录"}</h3><p>{waiting ? "CBT 正在准备依赖。主目标的实际执行计划生成后将在此显示，也可手动查看已生成的依赖产品图。" : "没有已记录的实际执行计划，不从当前源码推算历史图。"}</p>{waiting && entry.progress?.target && <p>当前处理：{entry.progress.target}</p>}</div>}
  </section>;
}
