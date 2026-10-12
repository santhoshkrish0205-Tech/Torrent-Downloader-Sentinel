// renderer/src/api/client.ts
import { useTorrentStore } from "../store/torrentStore";
import { GlobalSettings } from "../types/torrent";

class EngineApiClient {
  private host: string = "127.0.0.1";
  private port: number = 54321;
  private token: string = "dev-token-insecure";
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;

  public async init() {
    // 1. Detect if running inside Electron or Web Browser
    if (window.sentinelAPI?.getEnginePort) {
      try {
        this.port = await window.sentinelAPI.getEnginePort();
      } catch (err) {
        console.warn("[ApiClient] Could not get port from Electron, falling back to 54321:", err);
      }
    } else if (typeof window !== "undefined" && window.location) {
      // Running as a web application in browser!
      this.host = window.location.hostname || "127.0.0.1";
      if (window.location.port && window.location.port !== "5173") {
        this.port = parseInt(window.location.port, 10);
      }
    }

    if (window.sentinelAPI?.getEngineToken) {
      try {
        this.token = await window.sentinelAPI.getEngineToken();
      } catch (err) {
        console.warn("[ApiClient] Could not get token from Electron:", err);
      }
    }

    // 2. Connect WebSocket to live engine
    this.connectWs();

    // 3. Initial settings fetch
    this.fetchSettings();
  }

  private connectWs() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }

    const wsUrl = `ws://${this.host}:${this.port}/ws/stats`;
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[ApiClient] Connected to engine WebSocket at ${wsUrl}`);
        useTorrentStore.getState().setConnected(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data.torrents)) {
            useTorrentStore.getState().setTorrents(data.torrents);
          }
          if (data.stats) {
            useTorrentStore.getState().setStats(data.stats);
            useTorrentStore.getState().pushSpeedPoint(
              data.stats.total_download_rate || 0,
              data.stats.total_upload_rate || 0
            );
          }
        } catch (e) {
          console.error("[ApiClient] Error parsing WebSocket message:", e);
        }
      };

      this.ws.onclose = () => {
        useTorrentStore.getState().setConnected(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, 2500);
  }

  private getBaseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  // ── Torrent API actions ──

  public async addMagnet(uri: string, savePath?: string): Promise<void> {
    if (!useTorrentStore.getState().connected) {
      throw new Error("Sentinel Engine is currently disconnected. Please start the backend service.");
    }

    const res = await fetch(`${this.getBaseUrl()}/torrents/magnet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentinel-Token": this.token,
      },
      body: JSON.stringify({ magnet_uri: uri, save_path: savePath }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to add magnet link" }));
      throw new Error(err.detail || "Failed to add magnet link");
    }
  }

  public async addTorrentFile(b64: string, savePath?: string): Promise<void> {
    if (!useTorrentStore.getState().connected) {
      throw new Error("Sentinel Engine is currently disconnected. Please start the backend service.");
    }

    const res = await fetch(`${this.getBaseUrl()}/torrents/file`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentinel-Token": this.token,
      },
      body: JSON.stringify({ torrent_b64: b64, save_path: savePath }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to add torrent file" }));
      throw new Error(err.detail || "Failed to add torrent file");
    }
  }

  public async pauseTorrent(hash: string): Promise<void> {
    if (!useTorrentStore.getState().connected) return;

    await fetch(`${this.getBaseUrl()}/torrents/${hash}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentinel-Token": this.token,
      },
      body: JSON.stringify({ action: "pause" }),
    });
  }

  public async resumeTorrent(hash: string): Promise<void> {
    if (!useTorrentStore.getState().connected) return;

    await fetch(`${this.getBaseUrl()}/torrents/${hash}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentinel-Token": this.token,
      },
      body: JSON.stringify({ action: "resume" }),
    });
  }

  public async removeTorrent(hash: string, withData: boolean = false): Promise<void> {
    if (!useTorrentStore.getState().connected) return;

    await fetch(`${this.getBaseUrl()}/torrents/${hash}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentinel-Token": this.token,
      },
      body: JSON.stringify({ action: withData ? "remove_with_data" : "remove" }),
    });

    const store = useTorrentStore.getState();
    store.setTorrents(store.torrents.filter((t) => t.hash !== hash));
  }

  public async fetchSettings(): Promise<void> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/settings/`, {
        headers: { "X-Sentinel-Token": this.token },
      });
      if (res.ok) {
        const settings = await res.json();
        useTorrentStore.getState().setSettings(settings);
      }
    } catch {
      // Backend not yet available
    }
  }

  public async saveSettings(settings: Partial<GlobalSettings>): Promise<void> {
    const current = useTorrentStore.getState().settings;
    const merged = { ...current, ...settings };
    useTorrentStore.getState().setSettings(merged);

    try {
      await fetch(`${this.getBaseUrl()}/settings/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Sentinel-Token": this.token,
        },
        body: JSON.stringify(merged),
      });
    } catch (err) {
      console.warn("[ApiClient] Failed to save settings to engine:", err);
    }
  }
}

export const apiClient = new EngineApiClient();
