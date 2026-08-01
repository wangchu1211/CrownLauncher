import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectSampleInfo, ProjectTemplateInfo } from "./catalogs";
import { inspectProject, writeProjectDescriptor, type ProjectDescriptor } from "./projectDescriptor";
import { isPathWithin, isSafeRelativePath, normalizeAbsolutePath } from "./paths";

const invalidProjectName = /[<>:"/\\|?*]/;

export function isValidProjectDirectoryName(value: string): boolean {
  const name = value.trim();
  return Boolean(name && name !== "." && name !== ".." && !invalidProjectName.test(name)
    && !name.endsWith(" ") && !name.endsWith("."));
}

async function ensureParent(parentDirectory: string): Promise<string> {
  const parent = await normalizeAbsolutePath(parentDirectory);
  try {
    if (!(await stat(parent)).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new Error("The selected project parent directory does not exist.");
  }
  return parent;
}

async function copyTree(
  sourceRoot: string,
  destinationRoot: string,
  shouldSkip: (relativePath: string) => boolean = () => false,
): Promise<void> {
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    const relative = entry.name;
    if (!isSafeRelativePath(relative) || shouldSkip(relative)) {
      continue;
    }
    const source = path.join(sourceRoot, relative);
    const destination = path.join(destinationRoot, relative);
    if (!isPathWithin(destination, destinationRoot)) {
      throw new Error("A project source path escapes its destination root.");
    }
    if (entry.isSymbolicLink()) {
      throw new Error("Project sources cannot contain symbolic links.");
    }
    if (entry.isDirectory()) {
      await mkdir(destination, { recursive: true });
      await copyTree(source, destination, (child) => shouldSkip(path.join(relative, child)));
    } else if (entry.isFile()) {
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
  }
}

function scriptProjectContent(assemblyName: string): string {
  return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <AssemblyName>${assemblyName}</AssemblyName>
    <RootNamespace>${assemblyName}</RootNamespace>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <CrownManagedApiDirectory>$([System.IO.Path]::GetDirectoryName('$(CrownManagedApiPath)'))</CrownManagedApiDirectory>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="Crown.Managed"><HintPath>$(CrownManagedApiPath)</HintPath><Private>false</Private></Reference>
    <Reference Include="Crown.Managed.Core"><HintPath>$(CrownManagedApiDirectory)\\Crown.Managed.Core.dll</HintPath><Private>false</Private></Reference>
    <Reference Include="Crown.Managed.Rendering"><HintPath>$(CrownManagedApiDirectory)\\Crown.Managed.Rendering.dll</HintPath><Private>false</Private></Reference>
    <Reference Include="Crown.Managed.Animation"><HintPath>$(CrownManagedApiDirectory)\\Crown.Managed.Animation.dll</HintPath><Private>false</Private></Reference>
    <Reference Include="Crown.Managed.Physics"><HintPath>$(CrownManagedApiDirectory)\\Crown.Managed.Physics.dll</HintPath><Private>false</Private></Reference>
  </ItemGroup>
</Project>
`;
}

export async function createProject(input: {
  displayName: string;
  parentDirectory: string;
  template: ProjectTemplateInfo;
  enableScripting: boolean;
}): Promise<ProjectDescriptor> {
  const name = input.displayName.trim();
  if (!isValidProjectDirectoryName(name)) {
    throw new Error("Project names cannot be empty or contain < > : \" / \\ | ? *.");
  }
  if (input.enableScripting && !input.template.supportsScripting) {
    throw new Error("The selected template does not support C# scripting.");
  }
  const parent = await ensureParent(input.parentDirectory);
  const finalRoot = path.join(parent, name);
  try {
    await stat(finalRoot);
    throw new Error("The project destination already exists.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const projectId = randomUUID();
  const stagingRoot = path.join(parent, `.crown-create-${projectId}`);
  await mkdir(stagingRoot);
  try {
    for (const relative of input.template.directories) {
      const destination = path.join(stagingRoot, relative);
      if (!isSafeRelativePath(relative) || !isPathWithin(destination, stagingRoot)) {
        throw new Error("A template directory escapes the project root.");
      }
      await mkdir(destination, { recursive: true });
    }
    const filesRoot = path.join(input.template.root, "Files");
    try {
      if ((await stat(filesRoot)).isDirectory()) {
        await copyTree(filesRoot, stagingRoot);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    for (const relative of input.template.textFiles) {
      const filePath = path.join(stagingRoot, relative);
      if (!isPathWithin(filePath, stagingRoot)) {
        throw new Error("A template text file escapes the project root.");
      }
      const expanded = (await readFile(filePath, "utf8"))
        .replaceAll("{{PROJECT_NAME}}", name)
        .replaceAll("{{PROJECT_ID}}", projectId)
        .replaceAll("{{SCRIPT_ASSEMBLY}}", `${name}.Scripts`);
      await writeFile(filePath, expanded, "utf8");
    }

    const projectFile = input.enableScripting ? `${name}.Scripts.csproj` : "";
    if (input.enableScripting) {
      await writeFile(path.join(stagingRoot, projectFile), scriptProjectContent(`${name}.Scripts`), "utf8");
    }
    const descriptor: ProjectDescriptor = {
      schemaVersion: 1,
      projectId,
      displayName: name,
      scripting: {
        enabled: input.enableScripting,
        projectFile,
        assemblyName: input.enableScripting ? `${name}.Scripts` : "",
      },
      root: stagingRoot,
      manifestPath: path.join(stagingRoot, `${name}.crownproject`),
    };
    await writeProjectDescriptor(descriptor, descriptor.manifestPath);
    const inspection = await inspectProject(stagingRoot);
    if (inspection.health !== "ready") {
      throw new Error(`The generated project failed validation: ${inspection.message}`);
    }
    await rename(stagingRoot, finalRoot);
    return { ...descriptor, root: finalRoot, manifestPath: path.join(finalRoot, path.basename(descriptor.manifestPath)) };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

const generatedSampleRoots = new Set([".git", "bin", "build", "library", "logs", "obj"]);

export async function createProjectFromSample(input: {
  displayName: string;
  parentDirectory: string;
  sample: ProjectSampleInfo;
}): Promise<ProjectDescriptor> {
  const name = input.displayName.trim();
  if (!isValidProjectDirectoryName(name)) {
    throw new Error("Project names cannot be empty or contain < > : \" / \\ | ? *.");
  }
  const sourceInspection = await inspectProject(input.sample.root);
  if (sourceInspection.health !== "ready") {
    throw new Error(`The installed sample is invalid: ${sourceInspection.message}`);
  }
  const parent = await ensureParent(input.parentDirectory);
  const finalRoot = path.join(parent, name);
  try {
    await stat(finalRoot);
    throw new Error("The project destination already exists.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const projectId = randomUUID();
  const stagingRoot = path.join(parent, `.crown-sample-${projectId}`);
  await mkdir(stagingRoot);
  try {
    await copyTree(input.sample.root, stagingRoot, (relative) => {
      const parts = relative.split(path.sep);
      const first = (parts[0] ?? "").toLocaleLowerCase("en-US");
      const basename = path.basename(relative).toLocaleLowerCase("en-US");
      return generatedSampleRoots.has(first)
        || basename === "sample.json"
        || (parts.length === 1 && (basename === "cmakelists.txt" || path.extname(basename) === ".crownproject"));
    });
    const source = sourceInspection.descriptor;
    const descriptor: ProjectDescriptor = {
      ...source,
      projectId,
      displayName: name,
      root: stagingRoot,
      manifestPath: path.join(stagingRoot, `${name}.crownproject`),
    };
    await writeProjectDescriptor(descriptor, descriptor.manifestPath);
    const generated = await inspectProject(stagingRoot);
    if (generated.health !== "ready") {
      throw new Error(`The generated sample failed validation: ${generated.message}`);
    }
    await rename(stagingRoot, finalRoot);
    return { ...descriptor, root: finalRoot, manifestPath: path.join(finalRoot, path.basename(descriptor.manifestPath)) };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
