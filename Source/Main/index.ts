import { app, BrowserWindow, net, protocol, session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpc } from "./ipc";
import { LauncherService } from "./launcherService";
import { WorkbenchService } from "./workbenchService";
import { registerZoomShortcuts } from "./zoomShortcuts";

protocol.registerSchemesAsPrivileged([{
  scheme: "crown",
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

app.setName("CrownLauncher");
if (process.platform === "win32") {
  app.setAppUserModelId("CrownEngine.CrownLauncher");
}

function configDirectory(): string {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "CrownEngine", "CrownLauncher");
  }
  return path.join(app.getPath("appData"), "CrownEngine", "CrownLauncher");
}

function registerAppProtocol(): void {
  const rendererRoot = path.join(app.getAppPath(), "dist", "Renderer");
  protocol.handle("crown", (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const requested = path.resolve(rendererRoot, relative);
    if (requested !== rendererRoot && !requested.startsWith(`${rendererRoot}${path.sep}`)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(requested).toString());
  });
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    thickFrame: true,
    roundedCorners: true,
    backgroundColor: "#181818",
    icon: path.join(app.getAppPath(), "Resources", "app-icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "Preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (process.platform === "win32") {
    // WHY: WS_THICKFRAME follows the user's Windows accent color, which can
    // clash with Crown's neutral chrome. Keep native resize/shadow behavior but
    // make its one-pixel active border match the in-app neutral border.
    window.setAccentColor("#4c4542");
  }

  const service = new LauncherService(
    configDirectory(),
    path.dirname(app.getPath("exe")),
    process.env.CROWN_LAUNCHER_REGISTRY_PATH?.trim(),
  );
  await service.initialize();
  registerIpc(window, service, new WorkbenchService(configDirectory()));
  registerZoomShortcuts(window.webContents);

  window.on("maximize", () => window.webContents.send("window:maximized-changed", true));
  window.on("unmaximize", () => window.webContents.send("window:maximized-changed", false));
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith("crown://launcher/")) {
      event.preventDefault();
    }
  });
  window.once("ready-to-show", () => window.show());
  await window.loadURL("crown://launcher/index.html");
}

app.whenReady().then(async () => {
  registerAppProtocol();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await createWindow();
}).catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});

app.on("window-all-closed", () => app.quit());
