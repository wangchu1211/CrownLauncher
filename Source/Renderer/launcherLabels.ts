// Installed catalogs are shared with the Editor. Translate only known authored
// display text here, without renaming project data or overriding custom/new copy.
const catalogLabels: Readonly<Record<string, string>> = {
  "Empty": "空项目",
  "An empty Crown project with no startup scene.": "不包含启动场景的空白 Crown 项目。",
  "Blank 3D": "基础 3D",
  "A minimal 3D scene with a camera, sun, environment and ground.": "包含相机、太阳光、环境和地面的基础 3D 场景。",
  "LookDev Sample": "LookDev 示例",
  "An interactive gallery for Crown rendering, animation, terrain and physics features.": "交互式体验 Crown 的渲染、动画、地形和物理功能。",
  "Engine Features": "引擎功能",
  "Rendering": "渲染",
};

export function catalogText(value: string): string {
  return Object.hasOwn(catalogLabels, value) ? catalogLabels[value]! : value;
}
