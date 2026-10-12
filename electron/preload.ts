/**
 * electron/preload.ts
 * Context bridge — the ONLY surface the renderer process can call.
 * nodeIntegration is false; contextIsolation is true.
 * All args are validated in ipc-handlers.ts before reaching the engine.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sentinelAPI", {
  // ── Engine connectivity ────────────────────────────────────────────────
  getEnginePort:   () => ipcRenderer.invoke("engine:getPort"),
  getEngineToken:  () => ipcRenderer.invoke("engine:getToken"),
  getEngineStatus: () => ipcRenderer.invoke("engine:getStatus"),

  // ── Torrent operations ─────────────────────────────────────────────────
  addMagnet:      (uri: string, savePath?: string) =>
                    ipcRenderer.invoke("torrent:addMagnet", uri, savePath),
  addTorrentFile: (b64: string, savePath?: string) =>
                    ipcRenderer.invoke("torrent:addFile", b64, savePath),
  pauseTorrent:   (hash: string) => ipcRenderer.invoke("torrent:pause", hash),
  resumeTorrent:  (hash: string) => ipcRenderer.invoke("torrent:resume", hash),
  removeTorrent:  (hash: string, withData: boolean) =>
                    ipcRenderer.invoke("torrent:remove", hash, withData),

  // ── File system ────────────────────────────────────────────────────────
  chooseSavePath: ()           => ipcRenderer.invoke("fs:chooseSavePath"),
  openFolder:     (path: string) => ipcRenderer.invoke("fs:openFolder", path),
  readTorrentFile: ()          => ipcRenderer.invoke("fs:readTorrentFile"),

  // ── Settings ───────────────────────────────────────────────────────────
  getSettings:    () => ipcRenderer.invoke("settings:get"),
  saveSettings:   (s: unknown) => ipcRenderer.invoke("settings:save", s),

  // ── Window controls ────────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow:    () => ipcRenderer.invoke("window:close"),
  isMaximized:    () => ipcRenderer.invoke("window:isMaximized"),

  // ── Platform info ──────────────────────────────────────────────────────
  platform: process.platform,
});
