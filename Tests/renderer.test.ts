import { Children, createElement, isValidElement, type ComponentProps, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectInspector, ProjectRow, ProjectsPage, SamplesPage, Sidebar } from "../Source/Renderer/App";
import type { LauncherSnapshot, ProjectView } from "../Source/Shared/contracts";

const noop = () => {};
const project: ProjectView = {
  projectId: "test-project", name: "LookDev 项目", path: "D:/Crown/项目/LookDev", health: "ready",
  message: "", pinned: false, lastOpenedAt: "2026-10-12T08:00:00Z", lastOpenedLabel: "Today",
  scripting: true, manifest: "LookDev.crownproject", editorVersion: "Current",
};
const snapshot: LauncherSnapshot = {
  projects: [project], templates: [{ id: "empty", displayName: "Empty", description: "Empty project", supportsScripting: true }],
  samples: [{ id: "lookdev-gallery", displayName: "LookDev Gallery", description: "Materials and lighting.", category: "Rendering", scripting: false }],
  editor: { ready: true, executable: "D:/Editor/crown_editor_qt.exe", version: "Current", error: "" },
  settings: { defaultProjectDirectory: "D:/Projects", editorExecutable: "" },
};
const size = { status: "idle" as const, label: "Calculate", title: "Calculate project size" };
const pageProps: ComponentProps<typeof ProjectsPage> = {
  snapshot, selected: project, projectSize: size, search: "", setSearch: noop, onSelect: noop,
  onImport: noop, onNew: noop, onCreateSample: noop, onOpen: noop, onPin: noop, onReveal: noop,
  onCalculateSize: noop, onRelink: noop, onRemove: noop, onDelete: noop, onConfigure: noop,
};

describe("Launcher presentation", () => {
  it.each([true, false])("keeps Editor readiness in the settings description and tooltip: %s", ready => {
    const html = renderToStaticMarkup(createElement(Sidebar, {
      page: "projects", snapshot: { ...snapshot, editor: { ...snapshot.editor, ready } },
      onPage: noop, onSettings: noop,
    }));
    const description = `CrownEditor · ${ready ? "Ready to launch" : "Setup required"}`;
    expect(html).toContain(`aria-description="${description}"`);
    expect(html).toContain(`<small>${description}</small>`);
    expect(html.includes('class="connected"')).toBe(ready);
  });

  it.each(["projects", "samples", "build"] as const)("renders a single icon rail with accessible hover labels on %s", page => {
    const html = renderToStaticMarkup(createElement(Sidebar, {
      page, snapshot, onPage: noop, onSettings: noop,
    }));
    expect(html.match(/<nav\b/g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(4);
    for (const label of ["Projects", "Samples", "Build", "Settings"]) {
      expect(html.match(new RegExp(`aria-label="${label}"`, "g"))).toHaveLength(1);
      expect(html).toContain(`class="nav-tooltip" aria-hidden="true">${label}`);
    }
    // Use one styled tooltip, not a second delayed native title tooltip.
    expect(html).not.toContain('title="');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="${page[0]!.toUpperCase() + page.slice(1)}" aria-current="page"`);
    expect(html).not.toContain("sidebar-projects");
    expect(html).not.toContain("sidebar-toggle");
    expect(html).not.toContain(project.name);
  });

  it("keeps icon navigation and settings as separate actions", () => {
    const onPage = vi.fn(), onSettings = vi.fn();
    const tree = Sidebar({ page: "build", snapshot, onPage, onSettings });
    type NodeProps = { children?: ReactNode; onClick?: () => void; label?: string; className?: string; "aria-label"?: string };
    const nodes: ReactElement<NodeProps>[] = [];
    const visit = (children: ReactNode) => Children.forEach(children, child => {
      if (!isValidElement<NodeProps>(child)) return;
      nodes.push(child);
      visit(child.props.children);
    });
    visit(tree);
    const click = (matches: (node: ReactElement<NodeProps>) => boolean) => {
      const matching = nodes.filter(matches);
      expect(matching).toHaveLength(1);
      expect(matching[0]!.props.onClick).toBeTypeOf("function");
      matching[0]!.props.onClick!();
    };
    for (const label of ["Projects", "Samples", "Build"]) click(node => node.props.label === label);
    expect(onPage.mock.calls).toEqual([["projects"], ["samples"], ["build"]]);
    expect(onSettings).not.toHaveBeenCalled();
    click(node => node.props.label === "Settings");
    expect(onSettings).toHaveBeenCalledOnce();
    expect(onPage).toHaveBeenCalledTimes(3);
  });

  it("filters names and paths case-insensitively and reports the filtered count", () => {
    const html = renderToStaticMarkup(createElement(ProjectsPage, { ...pageProps, search: " 项目/LOOKDEV " }));
    expect(html).toContain('role="status">1 project');
    expect(html).toContain('class="project-row selected"');
    expect(html).toContain("Create a copy");
    const empty = renderToStaticMarkup(createElement(ProjectsPage, { ...pageProps, search: "no-match" }));
    expect(empty).toContain("No matching projects");
    expect(empty).toContain('role="status">0 projects');
    expect(empty).not.toContain('class="project-row selected"');
  });

  it("keeps creation disabled without templates and does not invent installed samples", () => {
    const html = renderToStaticMarkup(createElement(ProjectsPage, {
      ...pageProps, snapshot: { ...snapshot, templates: [], samples: [], projects: [] }, selected: null,
    }));
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*><span aria-hidden="true">＋<\/span> New Project/);
    expect(html).toContain("Your next idea starts here");
    expect(html).not.toContain("featured-sample");
  });

  it("shows missing and invalid projects without offering an unsafe Open action", () => {
    const props: ComponentProps<typeof ProjectInspector> = {
      project, projectSize: size, editorReady: true, menuOpen: false, onMenu: noop, onReveal: noop,
      onCalculateSize: noop, onOpen: noop, onRelink: noop, onRemove: noop, onDelete: noop, onConfigure: noop,
    };
    expect(renderToStaticMarkup(createElement(ProjectInspector, props))).toContain("Open in CrownEditor");
    expect(renderToStaticMarkup(createElement(ProjectInspector, { ...props, editorReady: false }))).toContain("Configure CrownEditor");
    const missing = renderToStaticMarkup(createElement(ProjectInspector, { ...props, project: { ...project, health: "missing", message: "Moved folder" } }));
    expect(missing).toContain("Relink Project");
    expect(missing).toContain("Moved folder");
    const invalid = renderToStaticMarkup(createElement(ProjectInspector, { ...props, project: { ...project, health: "invalid" } }));
    expect(invalid).toMatch(/disabled=""[^>]*>Open in CrownEditor/);
  });

  it("keeps keyboard selection separate from opening and ignores nested pin key events", () => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    const row = ProjectRow({ project, selected: true, onOpen, onSelect, onPin: noop }) as ReactElement<{ onKeyDown: (event: KeyboardEvent) => void }>;
    const target = {};
    const preventDefault = vi.fn();
    const event = (key: string, child = false) => ({ key, target: child ? {} : target, currentTarget: target, preventDefault }) as unknown as KeyboardEvent;
    row.props.onKeyDown(event(" "));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    row.props.onKeyDown(event("Enter"));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledTimes(2);
    row.props.onKeyDown(event("Enter", true));
    row.props.onKeyDown(event(" ", true));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("renders sample copy actions and explains unavailable samples", () => {
    const html = renderToStaticMarkup(createElement(SamplesPage, { samples: snapshot.samples, editorReady: true, onRefresh: noop, onCreate: noop }));
    expect(html).toContain("LookDev Gallery");
    expect(html).toContain("Create Copy");
    const empty = renderToStaticMarkup(createElement(SamplesPage, { samples: [], editorReady: false, onRefresh: noop, onCreate: noop }));
    expect(empty).toContain("Configure CrownEditor to discover samples");
  });
});
