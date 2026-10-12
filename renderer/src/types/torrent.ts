// renderer/src/types/torrent.ts
// Shared TypeScript types mirroring the Python Pydantic schemas.

export type TorrentState =
  | "queued"
  | "checking"
  | "downloading_metadata"
  | "downloading"
  | "finished"
  | "seeding"
  | "paused"
  | "error";

export interface Torrent {
  hash:          string;
  name:          string;
  size:          number;        // bytes
  progress:      number;        // 0.0 – 1.0
  download_rate: number;        // bytes/s
  upload_rate:   number;        // bytes/s
  state:         TorrentState;
  peers:         number;
  seeds:         number;
  eta_seconds:   number;        // -1 = unknown
  save_path:     string;
  added_at:      number;        // Unix timestamp
  error_message?: string | null;
}

export interface SessionStats {
  total_download_rate: number;
  total_upload_rate:   number;
  dht_nodes:           number;
  active_torrents:     number;
  total_torrents:      number;
}

export interface GlobalSettings {
  download_limit:    number;    // bytes/s; -1 = unlimited
  upload_limit:      number;
  max_connections:   number;
  default_save_path: string | null;
}

// ── Formatters ──────────────────────────────────────────────────────────────
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number): string {
  if (seconds < 0 || seconds > 86400 * 365) return "∞";
  if (seconds === 0) return "Done";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function stateLabel(state: TorrentState): string {
  const labels: Record<TorrentState, string> = {
    queued:               "Queued",
    checking:             "Checking",
    downloading_metadata: "Getting Metadata",
    downloading:          "Downloading",
    finished:             "Finished",
    seeding:              "Seeding",
    paused:               "Paused",
    error:                "Error",
  };
  return labels[state] ?? state;
}

export function stateColor(state: TorrentState): string {
  switch (state) {
    case "downloading": return "#3b82f6";
    case "seeding":     return "#10b981";
    case "finished":    return "#10b981";
    case "paused":      return "#f59e0b";
    case "error":       return "#ef4444";
    case "checking":    return "#8b5cf6";
    default:            return "#6b7280";
  }
}
