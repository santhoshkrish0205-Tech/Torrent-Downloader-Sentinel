export interface EngineStatusInfo {
  running: boolean;
  port: number | null;
  error: string | null;
  resolvedPath: string | null;
}

export interface SentinelAPI {
  getEnginePort: () => Promise<number>;
  getEngineToken: () => Promise<string>;
  getEngineStatus: () => Promise<EngineStatusInfo>;
  addMagnet: (uri: string, savePath?: string) => Promise<{ uri: string; savePath?: string }>;
  addTorrentFile: (b64: string, savePath?: string) => Promise<{ b64: string; savePath?: string }>;
  pauseTorrent: (hash: string) => Promise<{ hash: string }>;
  resumeTorrent: (hash: string) => Promise<{ hash: string }>;
  removeTorrent: (hash: string, withData: boolean) => Promise<{ hash: string; withData: boolean }>;
  chooseSavePath: () => Promise<string | null>;
  openFolder: (path: string) => Promise<void>;
  readTorrentFile: () => Promise<string | null>;
  getSettings: () => Promise<unknown>;
  saveSettings: (s: unknown) => Promise<unknown>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  platform: string;
}

declare global {
  interface Window {
    sentinelAPI?: SentinelAPI;
  }
}
