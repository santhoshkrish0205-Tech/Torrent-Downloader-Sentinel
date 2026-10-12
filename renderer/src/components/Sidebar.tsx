// renderer/src/components/Sidebar.tsx
import React from "react";
import { useTorrentStore, FilterCategory } from "../store/torrentStore";
import { SpeedGraph } from "./SpeedGraph";
import {
  DownloadIcon,
  UploadIcon,
  CheckIcon,
  PauseIcon,
  ActivityIcon,
  SettingsIcon,
  PlusIcon,
  PeersIcon,
} from "./icons";

export const Sidebar: React.FC = () => {
  const torrents = useTorrentStore((state) => state.torrents);
  const filter = useTorrentStore((state) => state.filter);
  const setFilter = useTorrentStore((state) => state.setFilter);
  const setAddModalOpen = useTorrentStore((state) => state.setAddModalOpen);
  const setSettingsModalOpen = useTorrentStore((state) => state.setSettingsModalOpen);
  const stats = useTorrentStore((state) => state.stats);
  const connected = useTorrentStore((state) => state.connected);

  const counts: Record<FilterCategory, number> = {
    all: torrents.length,
    downloading: torrents.filter((t) => t.state === "downloading").length,
    seeding: torrents.filter((t) => t.state === "seeding").length,
    finished: torrents.filter((t) => t.state === "finished").length,
    paused: torrents.filter((t) => t.state === "paused").length,
  };

  const navItems: { id: FilterCategory; label: string; icon: React.ReactNode }[] = [
    { id: "all", label: "All Torrents", icon: <ActivityIcon size={16} /> },
    { id: "downloading", label: "Downloading", icon: <DownloadIcon size={16} color="var(--accent-azure)" /> },
    { id: "seeding", label: "Seeding", icon: <UploadIcon size={16} color="var(--accent-emerald)" /> },
    { id: "finished", label: "Completed", icon: <CheckIcon size={16} color="var(--accent-emerald)" /> },
    { id: "paused", label: "Paused", icon: <PauseIcon size={16} color="var(--accent-amber)" /> },
  ];

  return (
    <aside className="sidebar" id="sidebar">
      <button
        className="btn btn-primary"
        id="btn-sidebar-add"
        style={{ width: "100%", justifyContent: "center" }}
        onClick={() => setAddModalOpen(true)}
      >
        <PlusIcon size={16} />
        <span>Add Torrent</span>
      </button>

      <div>
        <div className="sidebar-section-title">Swarm Transfers</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {navItems.map((item) => (
            <div
              key={item.id}
              id={`nav-${item.id}`}
              className={`nav-item ${filter === item.id ? "active" : ""}`}
              onClick={() => setFilter(item.id)}
            >
              <div className="nav-item-left">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <span className="nav-counter font-mono">{counts[item.id]}</span>
            </div>
          ))}
        </nav>
      </div>

      <div className="sidebar-widget">
        <SpeedGraph />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <div className="status-pill" id="dht-counter" title="DHT Routing Table Nodes">
            <PeersIcon size={14} color="var(--text-muted)" />
            <span>DHT: <strong className="font-mono" style={{ color: "var(--text-main)" }}>{stats.dht_nodes}</strong></span>
          </div>

          <div className="status-pill" id="engine-status" title={connected ? "Engine Connected" : "Simulation Mode"}>
            <div className={`status-dot ${connected ? "" : "offline"}`} />
            <span>{connected ? "Engine Live" : "Preview"}</span>
          </div>
        </div>

        <button
          className="btn btn-secondary"
          id="btn-sidebar-settings"
          style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
          onClick={() => setSettingsModalOpen(true)}
        >
          <SettingsIcon size={15} />
          <span>Preferences</span>
        </button>
      </div>
    </aside>
  );
};
