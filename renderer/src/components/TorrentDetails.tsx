// renderer/src/components/TorrentDetails.tsx
import React from "react";
import { useTorrentStore } from "../store/torrentStore";
import {
  formatBytes,
  formatSpeed,
  formatEta,
  stateLabel,
} from "../types/torrent";
import { HardDriveIcon, PeersIcon, ActivityIcon } from "./icons";
import { PieceMap } from "./PieceMap";

export const TorrentDetails: React.FC = () => {
  const selectedHash = useTorrentStore((state) => state.selectedHash);
  const torrents = useTorrentStore((state) => state.torrents);
  const activeTab = useTorrentStore((state) => state.activeDetailsTab);
  const setActiveTab = useTorrentStore((state) => state.setActiveDetailsTab);

  const selectedTorrent = torrents.find((t) => t.hash === selectedHash);

  if (!selectedTorrent) {
    return null;
  }

  const tabs: { id: "overview" | "pieces" | "files" | "peers" | "trackers"; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "pieces", label: "Piece Map" },
    { id: "files", label: "Files" },
    { id: "peers", label: `Peers (${selectedTorrent.peers})` },
    { id: "trackers", label: "Trackers" },
  ];

  return (
    <div className="details-panel" id="details-panel">
      <div className="details-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`details-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div className="details-content">
        {activeTab === "overview" && (
          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">Info Hash</span>
              <span className="meta-value font-mono" style={{ fontSize: 11, color: "var(--accent-azure)" }}>
                {selectedTorrent.hash}
              </span>
            </div>

            <div className="meta-item">
              <span className="meta-label">Save Directory</span>
              <span className="meta-value font-mono" style={{ fontSize: 11 }} title={selectedTorrent.save_path}>
                {selectedTorrent.save_path}
              </span>
            </div>

            <div className="meta-item">
              <span className="meta-label">Completed / Total</span>
              <span className="meta-value font-mono">
                {formatBytes(selectedTorrent.size * selectedTorrent.progress)} / {formatBytes(selectedTorrent.size)}
              </span>
            </div>

            <div className="meta-item">
              <span className="meta-label">Download Speed</span>
              <span className="meta-value font-mono" style={{ color: "var(--accent-azure)" }}>
                {formatSpeed(selectedTorrent.download_rate)}
              </span>
            </div>

            <div className="meta-item">
              <span className="meta-label">Upload Speed</span>
              <span className="meta-value font-mono" style={{ color: "var(--accent-emerald)" }}>
                {formatSpeed(selectedTorrent.upload_rate)}
              </span>
            </div>

            <div className="meta-item">
              <span className="meta-label">Estimated Time</span>
              <span className="meta-value font-mono">
                {formatEta(selectedTorrent.eta_seconds)}
              </span>
            </div>

            <div className="meta-item">
              <span className="meta-label">Swarm Seeds / Peers</span>
              <span className="meta-value font-mono">
                {selectedTorrent.seeds} seeds / {selectedTorrent.peers} connected
              </span>
            </div>

            <div className="meta-item">
              <span className="meta-label">State</span>
              <span className="meta-value" style={{ textTransform: "capitalize" }}>
                {stateLabel(selectedTorrent.state)}
              </span>
            </div>
          </div>
        )}

        {activeTab === "pieces" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <PieceMap torrent={selectedTorrent} />
          </div>
        )}

        {activeTab === "files" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 14px",
                background: "rgba(255, 255, 255, 0.03)",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <HardDriveIcon size={14} color="var(--accent-azure)" />
                <span style={{ fontWeight: 500 }}>{selectedTorrent.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <span className="font-mono" style={{ color: "var(--text-dim)" }}>
                  {formatBytes(selectedTorrent.size)}
                </span>
                <span className="font-mono" style={{ color: "var(--accent-emerald)", width: 45, textAlign: "right" }}>
                  {Math.round(selectedTorrent.progress * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "peers" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center", alignItems: "center", color: "var(--text-dim)" }}>
            <PeersIcon size={28} color="var(--accent-azure)" />
            <div style={{ fontSize: 13, color: "var(--text-main)" }}>
              {selectedTorrent.peers > 0
                ? `${selectedTorrent.peers} Active Peers Connected (${selectedTorrent.seeds} Seeds)`
                : "No Peer Connections Established"}
            </div>
            <div style={{ fontSize: 11 }}>
              {selectedTorrent.peers > 0
                ? "BitTorrent peer protocol data transfer in progress"
                : "Discovering peers via DHT routing table and tracker announce"}
            </div>
          </div>
        )}

        {activeTab === "trackers" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center", alignItems: "center", color: "var(--text-dim)" }}>
            <ActivityIcon size={28} color="var(--accent-emerald)" />
            <div style={{ fontSize: 13, color: "var(--text-main)" }}>
              Announce & Peer Exchange
            </div>
            <div style={{ fontSize: 11 }}>
              Distributed Hash Table (DHT) & Local Service Discovery (LSD) enabled for this swarm
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
