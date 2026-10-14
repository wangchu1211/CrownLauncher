import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { maxCoverBytes, projectCoverFile, readBoundedImage, readProjectCover } from "../Source/Main/Core/projectCover";
import { writeProjectDescriptor } from "../Source/Main/Core/projectDescriptor";
import { LauncherService } from "../Source/Main/launcherService";

const roots: string[] = [];
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
async function temporary() { const root = await mkdtemp(path.join(tmpdir(), "crown-cover-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("reads the portable Editor cover and observes its replacement", async () => {
  const root = await temporary();
  expect(await readProjectCover(root)).toBe("");
  await writeFile(path.join(root, projectCoverFile), jpeg);
  expect(await readProjectCover(root)).toBe(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
  const replacement = Buffer.concat([jpeg, Buffer.from([4])]);
  await writeFile(path.join(root, projectCoverFile), replacement);
  expect(await readProjectCover(root)).toBe(`data:image/jpeg;base64,${replacement.toString("base64")}`);
});

it("falls back for missing, non-JPEG, oversized and directory covers", async () => {
  const root = await temporary(); const target = path.join(root, projectCoverFile);
  expect(await readProjectCover(root)).toBe("");
  await writeFile(target, "not an image"); expect(await readProjectCover(root)).toBe("");
  await writeFile(target, Buffer.alloc(maxCoverBytes + 1)); expect(await readProjectCover(root)).toBe("");
  await rm(target); await mkdir(target); expect(await readProjectCover(root)).toBe("");
});

it("does not read a cover symlink outside the project", async () => {
  const root = await temporary(), outside = await temporary(); const source = path.join(outside, "original.jpg");
  await writeFile(source, jpeg);
  // Windows file symlinks require an account privilege; a junction covers the
  // same reparse-point rejection without changing the machine's permissions.
  await symlink(process.platform === "win32" ? outside : source, path.join(root, projectCoverFile), process.platform === "win32" ? "junction" : "file");
  expect(await readProjectCover(root)).toBe("");
  expect(await readFile(source)).toEqual(jpeg);
});

it("bounds image reads", async () => {
  const root = await temporary(), source = path.join(root, "source.png");
  await writeFile(source, Buffer.alloc(17));
  await expect(readBoundedImage(source, 16)).rejects.toThrow("过大");
  await writeFile(source, Buffer.alloc(0));
  await expect(readBoundedImage(source, 16)).rejects.toThrow("为空");
});

it("includes auto-updated covers only for registered projects with matching identity", async () => {
  const root = await temporary(), project = path.join(root, "项目");
  await mkdir(path.join(project, "Assets"), { recursive: true });
  const descriptor = { schemaVersion: 1 as const, projectId: randomUUID(), displayName: "项目", root: project, manifestPath: path.join(project, "项目.crownproject"), scripting: { enabled: false, projectFile: "", assemblyName: "" } };
  await writeProjectDescriptor(descriptor, descriptor.manifestPath);
  const service = new LauncherService(path.join(root, "config"), path.join(root, "app"));
  await service.importProject(project);
  await writeFile(path.join(project, projectCoverFile), jpeg);
  const snapshot = await service.snapshot();
  expect(snapshot.projects[0]?.coverDataUrl).toContain("data:image/jpeg;base64,");
  await writeProjectDescriptor({ ...descriptor, projectId: randomUUID() }, descriptor.manifestPath);
  expect((await service.snapshot()).projects[0]?.coverDataUrl).toBe("");
});
