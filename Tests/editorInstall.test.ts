import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveEditorInstall } from "../Source/Main/Core/editorInstall";
import { writeProjectDescriptor } from "../Source/Main/Core/projectDescriptor";
import { SettingsStore } from "../Source/Main/Core/settingsStore";
import { LauncherService } from "../Source/Main/launcherService";

const roots: string[] = [];
const executableName = process.platform === "win32" ? "crown_editor_qt.exe" : "crown_editor_qt";
async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "crown-editor-discovery-"));
  roots.push(root);
  return root;
}
async function file(filename: string, contents = "") {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, contents);
  return filename;
}
async function engine(root: string, configurations = ["Shipping"]) {
  await file(path.join(root, "CrownBuild.ps1"));
  await mkdir(path.join(root, "Engine", "Build", "CBT"), { recursive: true });
  const executables = [];
  for (const configuration of configurations) {
    executables.push(await file(path.join(root, "Build", "CBT", "Artifacts", "Ninja", "Win64", configuration, "CrownEditor", executableName)));
  }
  return executables;
}
async function launcher(root: string) {
  await file(path.join(root, "package.json"), JSON.stringify({ name: "crown-launcher" }));
  const app = path.join(root, "Build", "Electron-agent", "win-unpacked");
  await mkdir(app, { recursive: true });
  return app;
}
beforeEach(() => vi.stubEnv("CROWN_EDITOR_EXECUTABLE", ""));
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("Editor resolution", () => {
  it("prefers explicit settings over environment and bundled Editor", async () => {
    const root = await temporaryRoot();
    await file(path.join(root, executableName));
    const environment = await file(path.join(root, "environment", executableName));
    const configured = await file(path.join(root, "configured", executableName));
    vi.stubEnv("CROWN_EDITOR_EXECUTABLE", environment);
    expect((await resolveEditorInstall(root, configured)).executable).toBe(configured);
    expect((await resolveEditorInstall(root, "")).executable).toBe(environment);
  });

  it("does not silently replace missing explicit settings or environment overrides", async () => {
    const root = await temporaryRoot();
    await file(path.join(root, executableName));
    const missing = path.join(root, "missing", executableName);
    const result = await resolveEditorInstall(root, missing);
    expect(result.executable).toBe(missing);
    expect(result.error).toContain("clear the override");
    expect(result.samplesRoot).toBe("");
    vi.stubEnv("CROWN_EDITOR_EXECUTABLE", missing);
    expect((await resolveEditorInstall(root, "")).error).toContain(missing);
  });

  it("keeps version, samples and templates together with the selected Editor", async () => {
    const root = await temporaryRoot();
    const executable = await file(path.join(root, executableName));
    await file(path.join(root, "version.json"), JSON.stringify({ version: "1.2-test" }));
    expect(await resolveEditorInstall(root, "")).toEqual({ root, executable,
      samplesRoot: path.join(root, "Samples"), templatesRoot: path.join(root, "Templates"),
      displayVersion: "1.2-test", error: "" });
  });

  it("returns an actionable empty state without searching arbitrary neighboring folders", async () => {
    const root = await temporaryRoot();
    await engine(path.join(root, "CrownEngine"));
    const app = path.join(root, "unrelated-app");
    const result = await resolveEditorInstall(app, "");
    expect(result.executable).toBe("");
    expect(result.error).toContain("Launcher Settings");
  });
});

describe.skipIf(process.platform !== "win32")("nearby CBT discovery", () => {
  it.each(["Shipping", "Development", "Debug"])("selects the first available configuration starting with %s", async configuration => {
    const root = await temporaryRoot();
    const configurations = ["Shipping", "Development", "Debug"].slice(["Shipping", "Development", "Debug"].indexOf(configuration));
    const [expected] = await engine(path.join(root, "CrownEngine"), configurations);
    const app = await launcher(path.join(root, "CrownLauncher"));
    expect((await resolveEditorInstall(app, "")).executable).toBe(expected);
    // npm start uses the Electron executable under node_modules, not cwd.
    expect((await resolveEditorInstall(path.join(root, "CrownLauncher", "node_modules", "electron", "dist"), "")).executable).toBe(expected);
  });

  it("prefers a bundled Editor to nearby source builds", async () => {
    const root = await temporaryRoot();
    await engine(path.join(root, "CrownEngine"));
    const app = await launcher(path.join(root, "CrownLauncher"));
    const bundled = await file(path.join(app, executableName));
    expect((await resolveEditorInstall(app, "")).executable).toBe(bundled);
  });

  it("finds its enclosing engine and does not escape a nearer unbuilt checkout", async () => {
    const root = await temporaryRoot();
    const [expected] = await engine(root);
    expect((await resolveEditorInstall(path.join(root, "Build", "Launcher"), "")).executable).toBe(expected);
    const nested = path.join(root, "nested-engine");
    await engine(nested, []);
    expect((await resolveEditorInstall(path.join(nested, "Build", "Launcher"), "")).executable).toBe("");
  });

  it("rejects a lookalike artifact folder without engine checkout markers", async () => {
    const root = await temporaryRoot();
    const [executable] = await engine(path.join(root, "CrownEngine"));
    await rm(path.join(root, "CrownEngine", "CrownBuild.ps1"));
    const app = await launcher(path.join(root, "CrownLauncher"));
    expect((await resolveEditorInstall(app, "")).error).not.toBe("");
    // Explicit selection remains available for standalone distributions.
    expect((await resolveEditorInstall(app, executable!)).error).toBe("");
  });

  it("shares installed samples across accounts but never projects or stored Editor overrides", async () => {
    const root = await temporaryRoot();
    const [executable] = await engine(path.join(root, "CrownEngine"));
    const install = path.dirname(executable!);
    const app = await launcher(path.join(root, "CrownLauncher"));
    const sample = path.join(install, "Samples", "LookDev");
    await mkdir(path.join(sample, "Assets"), { recursive: true });
    await writeProjectDescriptor({ schemaVersion: 1, projectId: randomUUID(), displayName: "LookDev",
      scripting: { enabled: false, projectFile: "", assemblyName: "" }, root: sample,
      manifestPath: path.join(sample, "LookDev.crownproject") }, path.join(sample, "LookDev.crownproject"));
    await file(path.join(sample, "sample.json"), JSON.stringify({ schemaVersion: 1, id: "lookdev", displayName: "LookDev" }));
    await file(path.join(install, "Templates", "Empty", "template.json"), JSON.stringify({ id: "empty", displayName: "Empty" }));
    const services = [];
    for (const account of ["account-a", "account-b"]) {
      const config = path.join(root, account);
      await file(path.join(config, "settings.json"), JSON.stringify({ schemaVersion: 1, defaultProjectDirectory: path.join(config, "Projects"), editorExecutable: "" }));
      const service = new LauncherService(config, app);
      await service.initialize();
      services.push(service);
    }
    const created = await services[0]!.createSample({ sampleId: "lookdev", displayName: "My LookDev", parentDirectory: path.join(root, "account-a", "Projects"), openAfterCreate: false });
    const first = await services[0]!.snapshot(), second = await services[1]!.snapshot();
    expect(first.samples).toEqual(second.samples);
    expect(second.samples[0]?.id).toBe("lookdev");
    expect(second.templates[0]?.id).toBe("empty");
    expect(first.projects[0]?.path).toBe(created.path);
    expect(second.projects).toEqual([]);
    expect(second.editor.executable).toBe(executable);
    expect(second.settings.editorExecutable).toBe("");
    expect(JSON.parse(await readFile(path.join(root, "account-b", "settings.json"), "utf8")).editorExecutable).toBe("");
    // An explicit alternate install must not borrow Samples from this engine.
    const alternate = await file(path.join(root, "other-install", executableName));
    await services[1]!.saveSettings({ ...second.settings, editorExecutable: alternate });
    expect((await services[1]!.snapshot()).samples).toEqual([]);
    expect((await services[0]!.snapshot()).samples).toHaveLength(1);
  });
});

describe("automatic Editor settings", () => {
  it.each(["", "   ", "."])("preserves automatic mode when loading %j and saving again", async value => {
    const root = await temporaryRoot();
    const settingsPath = await file(path.join(root, "settings.json"), JSON.stringify({ schemaVersion: 1, defaultProjectDirectory: root, editorExecutable: value }));
    const store = new SettingsStore(settingsPath);
    await store.load();
    expect(store.get().editorExecutable).toBe("");
    await store.update(store.get());
    const restored = new SettingsStore(settingsPath);
    await restored.load();
    expect(restored.get().editorExecutable).toBe("");
  });
});
