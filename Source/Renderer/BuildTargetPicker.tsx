import { useEffect, useRef, useState } from "react";
import { ChevronIcon, CloseIcon, SearchIcon } from "./icons";
import { groupedTargets, initialTargetFilter, targetCategories, targetCategory, targetDescription, targetHint, targetWarning, type BuildTarget, type TargetFilter } from "./buildTargets";
import "./build-target-picker.css";

type TargetProps = { targets: readonly BuildTarget[]; selected: string; onSelect: (name: string) => void };

export function TargetResults({ targets, selected, onSelect, filter, query }: TargetProps & { filter: TargetFilter; query: string }) {
  const groups = groupedTargets(targets, filter, query);
  const count = groups.reduce((sum, group) => sum + group.targets.length, 0);
  return <>
    <p className="target-result-count" role="status">{count} 个目标{query.trim() ? ` · 搜索“${query.trim()}”` : ""}</p>
    <div className="target-results">
      {groups.length === 0 && <div className="target-empty"><strong>没有匹配的构建目标</strong><p>试试其他关键词，或切换到“全部”。</p></div>}
      {groups.map(group => <section key={group.id} aria-label={group.label}>
        <h3>{group.label}<span>{group.targets.length}</span></h3>
        <ul>{group.targets.map(target => <li key={target.name}>
          <button type="button" className={`target-option ${target.name === selected ? "selected" : ""}`} aria-current={target.name === selected ? "true" : undefined} onClick={() => onSelect(target.name)}>
            <span className="target-option-title"><strong>{target.name}</strong><small>{target.name === selected ? "当前选中" : target.kind}</small></span>
            <span className="target-option-description">{targetDescription(target)}</span>
            <span className={targetWarning(target) ? "target-warning" : "target-option-hint"}>{targetWarning(target) || targetHint(target)}</span>
          </button>
        </li>)}</ul>
      </section>)}
    </div>
  </>;
}

export function BuildTargetDialog({ targets, selected, onSelect, onDismiss }: TargetProps & { onDismiss: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<TargetFilter>(() => initialTargetFilter(targets, selected));
  const [query, setQuery] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    // The input mounts before the native dialog opens, so React autoFocus alone
    // leaves focus on the first button. Focus search after entering the top layer.
    searchRef.current?.focus();
    return () => dialog.close();
  }, []);
  const close = () => dialogRef.current?.close();
  return <dialog className="build-target-dialog" ref={dialogRef} aria-labelledby="target-dialog-title" aria-describedby="target-dialog-description" onClose={onDismiss} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="target-dialog-content">
      <header><div><h2 id="target-dialog-title">选择构建目标</h2><p id="target-dialog-description">日常使用选常用产品；模块和辅助工具按需构建。</p></div><button type="button" className="icon-button" aria-label="关闭目标选择" onClick={close}><CloseIcon /></button></header>
      <div className="target-search"><SearchIcon /><input ref={searchRef} type="search" className="text-field" aria-label="搜索构建目标" placeholder="搜索名称或中文用途，如 Terrain、地形…" value={query} onChange={event => {
        const next = event.target.value;
        // Start searches across the complete CBT catalog, not only the three
        // common products. Users can narrow categories after entering a query.
        if (!query.trim() && next.trim()) setFilter("all");
        setQuery(next);
      }} /></div>
      <div className="target-filters" role="group" aria-label="目标分类">
        {targetCategories.map(category => <button type="button" key={category.id} aria-pressed={filter === category.id} onClick={() => setFilter(category.id)}>{category.label}<span>{targets.filter(target => targetCategory(target) === category.id).length}</span></button>)}
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>全部<span>{targets.length}</span></button>
      </div>
      <TargetResults targets={targets} selected={selected} filter={filter} query={query} onSelect={name => { onSelect(name); close(); }} />
      <footer>选择只会更新下一次构建的配置，不会开始构建，也不会切换右侧的历史任务。</footer>
    </div>
  </dialog>;
}

export function BuildTargetPicker({ targets, selected, onSelect }: TargetProps) {
  const [open, setOpen] = useState(false);
  const target = targets.find(item => item.name === selected);
  return <div className="build-target-picker">
    <label id="build-target-label" htmlFor="build-target">构建目标</label>
    <button type="button" id="build-target" className="text-field build-target-trigger" aria-haspopup="dialog" aria-labelledby="build-target-label build-target-name" aria-describedby="build-target-help" onClick={() => setOpen(true)}>
      <span id="build-target-name">{target?.name || "选择构建目标…"}</span><ChevronIcon />
    </button>
    {target && <div id="build-target-help" className="build-target-help"><p>{targetDescription(target)}</p><small className={targetWarning(target) ? "target-warning" : ""}>{targetWarning(target) || targetHint(target)}</small></div>}
    {open && <BuildTargetDialog targets={targets} selected={selected} onSelect={onSelect} onDismiss={() => setOpen(false)} />}
  </div>;
}
