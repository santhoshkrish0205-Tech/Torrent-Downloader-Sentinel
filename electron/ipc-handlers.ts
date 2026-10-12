/**
 * electron/ipc-handlers.ts
 * All ipcMain.handle() registrations with input validation.
 * Data from the renderer is treated as untrusted.
 */
import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import { getEnginePort, ENGINE_TOKEN, getEngineStatus } from "./engine-manager";

const MAGNET_RE = /^magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,40}/i;

export function registerIpcHandlers(mainWindow: BrowserWindow): void {

  // ── Engine connectivity ──────────────────────────────────────────────────
  ipcMain.handle("engine:getPort",   () => getEnginePort());
  ipcMain.handle("engine:getToken",  () => ENGINE_TOKEN);
  ipcMain.handle("engine:getStatus", () => getEngineStatus());

  // ── Torrent operations ───────────────────────────────────────────────────
  ipcMain.handle("torrent:addMagnet", async (_e, uri: unknown, savePath: unknown) => {
    if (typeof uri !== "string" || !MAGNET_RE.test(uri.trim())) {
      throw new Error("Invalid magnet URI");
    }
    return { uri: uri.trim(), savePath: validatePath(savePath) };
  });

  ipcMain.handle("torrent:addFile", async (_e, b64: unknown, savePath: unknown) => {
    if (typeof b64 !== "string" || b64.length === 0) {
      throw new Error("Invalid torrent data");
    }
    return { b64, savePath: validatePath(savePath) };
  });

  ipcMain.handle("torrent:pause",  (_e, hash: unknown) => ({ hash: validateHash(hash) }));
  ipcMain.handle("torrent:resume", (_e, hash: unknown) => ({ hash: validateHash(hash) }));

  ipcMain.handle("torrent:remove", (_e, hash: unknown, withData: unknown) => ({
    hash: validateHash(hash),
    withData: Boolean(withData),
  }));

  // ── File system ──────────────────────────────────────────────────────────
  ipcMain.handle("fs:chooseSavePath", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose Download Destination",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("fs:openFolder", async (_e, folderPath: unknown) => {
    const p = validatePath(folderPath);
    if (!p) return;
    await shell.openPath(p);
  });

  ipcMain.handle("fs:readTorrentFile", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Torrent Files", extensions: ["torrent"] }],
      title: "Open Torrent File",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    // Security: ensure the file has a .torrent extension
    if (!filePath.toLowerCase().endsWith(".torrent")) {
      throw new Error("Selected file is not a .torrent file");
    }
    const data = fs.readFileSync(filePath);
    return data.toString("base64");
  });

  // ── Settings passthrough ─────────────────────────────────────────────────
  ipcMain.handle("settings:get",  () => null);  // handled by renderer direct HTTP
  ipcMain.handle("settings:save", () => null);  // handled by renderer direct HTTP

  // ── Window controls ──────────────────────────────────────────────────────
  ipcMain.handle("window:minimize",   () => mainWindow.minimize());
  ipcMain.handle("window:maximize",   () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.handle("window:close",      () => mainWindow.close());
  ipcMain.handle("window:isMaximized",() => mainWindow.isMaximized());
}

// ── Validation helpers ────────────────────────────────────────────────────────
function validateHash(h: unknown): string {
  if (typeof h !== "string" || !/^[a-f0-9]{40,64}$/i.test(h)) {
    throw new Error("Invalid torrent hash");
  }
  return h.toLowerCase();
}

function validatePath(p: unknown): string | undefined {
  if (p === null || p === undefined) return undefined;
  if (typeof p !== "string") throw new Error("Path must be a string");
  // Resolve to absolute; reject empty strings
  const resolved = path.resolve(p.trim());
  return resolved || undefined;
}
