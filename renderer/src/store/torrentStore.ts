// renderer/src/store/torrentStore.ts
import { create } from "zustand";
import { Torrent, SessionStats, GlobalSettings } from "../types/torrent";

export type FilterCategory = "all" | "downloading" | "seeding" | "finished" | "paused";

interface SpeedPoint {
  timestamp: number;
  dl: number;
  ul: number;
}

interface TorrentStoreState {
  torrents: Torrent[];
  selectedHash: string | null;
  filter: FilterCategory;
  searchQuery: string;
  stats: SessionStats;
  speedHistory: SpeedPoint[];
  activeDetailsTab: "overview" | "pieces" | "files" | "peers" | "trackers";
  isAddModalOpen: boolean;
  isSettingsModalOpen: boolean;
  connected: boolean;
  engineError: string | null;
  settings: GlobalSettings;

  // Actions
  setTorrents: (torrents: Torrent[]) => void;
  updateTorrent: (torrent: Torrent) => void;
  setSelectedHash: (hash: string | null) => void;
  setFilter: (filter: FilterCategory) => void;
  setSearchQuery: (query: string) => void;
  setStats: (stats: SessionStats) => void;
  pushSpeedPoint: (dl: number, ul: number) => void;
  setActiveDetailsTab: (tab: "overview" | "pieces" | "files" | "peers" | "trackers") => void;
  setAddModalOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setConnected: (connected: boolean) => void;
  setEngineError: (error: string | null) => void;
  setSettings: (settings: Partial<GlobalSettings>) => void;
}

const DEFAULT_STATS: SessionStats = {
  total_download_rate: 0,
  total_upload_rate: 0,
  dht_nodes: 0,
  active_torrents: 0,
  total_torrents: 0,
};

const DEFAULT_SETTINGS: GlobalSettings = {
  download_limit: -1,
  upload_limit: -1,
  max_connections: 200,
  default_save_path: null,
};

export const useTorrentStore = create<TorrentStoreState>((set) => ({
  torrents: [],
  selectedHash: null,
  filter: "all",
  searchQuery: "",
  stats: DEFAULT_STATS,
  speedHistory: Array.from({ length: 30 }, (_, i) => ({
    timestamp: Date.now() - (29 - i) * 1000,
    dl: 0,
    ul: 0,
  })),
  activeDetailsTab: "overview",
  isAddModalOpen: false,
  isSettingsModalOpen: false,
  connected: false,
  engineError: null,
  settings: DEFAULT_SETTINGS,

  setTorrents: (torrents) =>
    set((state) => {
      // Keep selection if it still exists, otherwise select the first if none selected
      const selectedExists = torrents.some((t) => t.hash === state.selectedHash);
      const selectedHash = selectedExists ? state.selectedHash : (torrents[0]?.hash ?? null);
      return { torrents, selectedHash };
    }),

  updateTorrent: (torrent) =>
    set((state) => {
      const exists = state.torrents.some((t) => t.hash === torrent.hash);
      const torrents = exists
        ? state.torrents.map((t) => (t.hash === torrent.hash ? torrent : t))
        : [torrent, ...state.torrents];
      return { torrents };
    }),

  setSelectedHash: (selectedHash) => set({ selectedHash }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStats: (stats) => set({ stats }),

  pushSpeedPoint: (dl, ul) =>
    set((state) => {
      const next = [...state.speedHistory.slice(1), { timestamp: Date.now(), dl, ul }];
      return { speedHistory: next };
    }),

  setActiveDetailsTab: (activeDetailsTab) => set({ activeDetailsTab }),
  setAddModalOpen: (isAddModalOpen) => set({ isAddModalOpen }),
  setSettingsModalOpen: (isSettingsModalOpen) => set({ isSettingsModalOpen }),
  setConnected: (connected) => set({ connected }),
  setEngineError: (engineError) => set({ engineError }),
  setSettings: (newSettings) =>
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),
}));
