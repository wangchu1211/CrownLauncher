import { createElement, type ComponentProps, type KeyboardEvent, type ReactElement } from "react";
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
  it("renders real sidebar projects and installation state, without a placeholder Build entry", () => {
    const html = renderToStaticMarkup(createElement(Sidebar, {
      page: "projects", snapshot: { ...snapshot, projects: [{ ...project, pinned: true }] },
      selectedPath: project.path, onPage: noop, onSelect: noop, onSettings: noop,
    }));
    expect(html).toContain("Pinned");
    expect(html.match(/LookDev 项目/g)).toHaveLength(1);
    expect(html).toContain("Ready to launch");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain(">Build<");
    const empty = renderToStaticMarkup(createElement(Sidebar, {
      page: "samples", snapshot: { ...snapshot, projects: [], editor: { ...snapshot.editor, ready: false } },
      selectedPath: "", onPage: noop, onSelect: noop, onSettings: noop,
    }));
    expect(empty).toContain("Your projects will appear here.");
    expect(empty).toContain("Setup required");
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
