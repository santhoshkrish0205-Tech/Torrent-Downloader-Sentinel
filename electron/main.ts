/**
 * electron/main.ts
 * Application entry point. Creates the BrowserWindow, starts the engine,
 * and coordinates the application lifecycle.
 */
import { app, BrowserWindow, nativeTheme } from "electron";
import path from "path";
import { startEngine, stopEngine, getEnginePort } from "./engine-manager";
import { registerIpcHandlers } from "./ipc-handlers";

const isDev = process.env.NODE_ENV === "development";

nativeTheme.themeSource = "dark";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:          1280,
    height:         820,
    minWidth:       900,
    minHeight:      600,
    frame:          false,        // Custom title bar
    titleBarStyle:  "hidden",
    backgroundColor: "#0a0e1a",
    show:           false,        // Show after ready-to-show
    icon:           path.join(__dirname, "../renderer/public/icon.png"),
    webPreferences: {
      preload:            path.join(__dirname, "preload.js"),
      nodeIntegration:    false,  // SECURITY: disabled
      contextIsolation:   true,   // SECURITY: enabled
      sandbox:            true,   // SECURITY: Chromium sandbox
      webSecurity:        true,
    },
  });

  // Load the renderer
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/dist/index.html"));
  }

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`[Electron] Failed to load renderer: ${errorCode} ${errorDescription}`);
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow!.show();
  });

  // Fallback to ensure window is visible even on slower display drivers
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 2000);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  registerIpcHandlers(mainWindow);
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Start the Python engine immediately
  startEngine();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopEngine();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopEngine();
});

// Prevent navigation to external URLs (security)
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (e, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      e.preventDefault();
    }
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});
