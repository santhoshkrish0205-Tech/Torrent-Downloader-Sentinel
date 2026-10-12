// renderer/src/components/TorrentList.tsx
import React, { useState, useEffect } from "react";
import { useTorrentStore } from "../store/torrentStore";
import { apiClient } from "../api/client";
import {
  Torrent,
  formatBytes,
  formatSpeed,
  formatEta,
  stateLabel,
  stateColor,
} from "../types/torrent";
import {
  PlayIcon,
  PauseIcon,
  TrashIcon,
  FolderIcon,
  MagnetIcon,
  FileIcon,
} from "./icons";

type SortField = "name" | "progress" | "download_rate" | "upload_rate" | "eta_seconds" | "seeds";

interface ContextMenuState {
  x: number;
  y: number;
  torrent: Torrent;
}

export const TorrentList: React.FC = () => {
  const torrents = useTorrentStore((state) => state.torrents);
  const filter = useTorrentStore((state) => state.filter);
  const searchQuery = useTorrentStore((state) => state.searchQuery);
  const selectedHash = useTorrentStore((state) => state.selectedHash);
  const setSelectedHash = useTorrentStore((state) => state.setSelectedHash);
  const setAddModalOpen = useTorrentStore((state) => state.setAddModalOpen);

  const [sortField, setSortField] = useState<SortField>("progress");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
      if (selectedHash) {
        if (e.key === " " && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
          e.preventDefault();
          const target = torrents.find((t) => t.hash === selectedHash);
          if (target) {
            target.state === "paused"
              ? apiClient.resumeTorrent(target.hash)
              : apiClient.pauseTorrent(target.hash);
          }
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          if (!["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
            e.preventDefault();
            const target = torrents.find((t) => t.hash === selectedHash);
            if (target && window.confirm(`Remove ${target.name} from Sentinel?`)) {
              apiClient.removeTorrent(target.hash, false);
            }
          }
        }
      }
    };

    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedHash, torrents]);

  // Filter torrents
  const filtered = torrents.filter((t) => {
    if (filter === "downloading" && t.state !== "downloading") return false;
    if (filter === "seeding" && t.state !== "seeding") return false;
    if (filter === "finished" && t.state !== "finished") return false;
    if (filter === "paused" && t.state !== "paused") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.hash.toLowerCase().includes(q);
    }
    return true;
  });

  // Sort torrents
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") {
      cmp = a.name.localeCompare(b.name);
    } else {
      cmp = (a[sortField] || 0) - (b[sortField] || 0);
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleHeaderClick = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default to descending for numbers
    }
  };

  const handleContextMenu = (e: React.MouseEvent, torrent: Torrent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedHash(torrent.hash);
    setContextMenu({
      x: Math.min(window.innerWidth - 220, e.clientX),
      y: Math.min(window.innerHeight - 200, e.clientY),
      torrent,
    });
  };

  const handleToggleState = async (e: React.MouseEvent, hash: string, isPaused: boolean) => {
    e.stopPropagation();
    if (isPaused) {
      await apiClient.resumeTorrent(hash);
    } else {
      await apiClient.pauseTorrent(hash);
    }
  };

  const handleOpenFolder = async (e: React.MouseEvent, savePath: string) => {
    e.stopPropagation();
    if (window.sentinelAPI?.openFolder) {
      await window.sentinelAPI.openFolder(savePath);
    }
  };

  const handleRemove = async (e: React.MouseEvent, hash: string) => {
    e.stopPropagation();
    const confirm = window.confirm("Remove this torrent from Sentinel?");
    if (confirm) {
      await apiClient.removeTorrent(hash, false);
    }
  };

  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) return null;
    return <span className="sort-indicator">{sortAsc ? "▲" : "▼"}</span>;
  };

  if (sorted.length === 0) {
    return (
      <div
        className="torrent-list-container"
        id="torrent-list-empty"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          color: "var(--text-dim)",
        }}
      >
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "50%",
            width: 72,
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MagnetIcon size={32} color="var(--accent-azure)" />
        </div>
        <div style={{ textAlign: "center" }}>
          <h3 style={{ color: "var(--text-main)", fontSize: 16, marginBottom: 4 }}>
            {torrents.length === 0 ? "No Active Swarms" : "No Matching Torrents"}
          </h3>
          <p style={{ fontSize: 13, maxWidth: 340 }}>
            {torrents.length === 0
              ? "Drag and drop a .torrent file or paste a magnet link to start high-speed downloading."
              : "Try adjusting your search query or transfer category filter."}
          </p>
        </div>
        {torrents.length === 0 && (
          <button
            className="btn btn-primary"
            id="btn-empty-add"
            onClick={() => setAddModalOpen(true)}
            style={{ marginTop: 8 }}
          >
            <MagnetIcon size={16} />
            <span>Add Magnet Link</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="torrent-list-container" id="torrent-list">
      <table className="torrent-table">
        <thead>
          <tr className="torrent-header">
            <th
              style={{ width: "35%" }}
              className="sortable-header"
              onClick={() => handleHeaderClick("name")}
            >
              Name & State {renderSortArrow("name")}
            </th>
            <th
              style={{ width: "20%" }}
              className="sortable-header"
              onClick={() => handleHeaderClick("progress")}
            >
              Progress / Size {renderSortArrow("progress")}
            </th>
            <th
              style={{ width: "12%" }}
              className="sortable-header"
              onClick={() => handleHeaderClick("download_rate")}
            >
              Down Speed {renderSortArrow("download_rate")}
            </th>
            <th
              style={{ width: "10%" }}
              className="sortable-header"
              onClick={() => handleHeaderClick("upload_rate")}
            >
              Up Speed {renderSortArrow("upload_rate")}
            </th>
            <th
              style={{ width: "8%" }}
              className="sortable-header"
              onClick={() => handleHeaderClick("eta_seconds")}
            >
              ETA {renderSortArrow("eta_seconds")}
            </th>
            <th
              style={{ width: "8%" }}
              className="sortable-header"
              onClick={() => handleHeaderClick("seeds")}
            >
              Seeds/Peers {renderSortArrow("seeds")}
            </th>
            <th style={{ width: "7%", textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const isPaused = t.state === "paused";
            const percent = Math.min(100, Math.round(t.progress * 1000) / 10);
            const isSelected = selectedHash === t.hash;

            return (
              <tr
                key={t.hash}
                id={`torrent-row-${t.hash}`}
                className={`torrent-row ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedHash(t.hash)}
                onContextMenu={(e) => handleContextMenu(e, t)}
              >
                <td>
                  <div className="torrent-name-box">
                    <FileIcon size={20} color={stateColor(t.state)} />
                    <div style={{ overflow: "hidden" }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--text-main)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 320,
                        }}
                        title={t.name}
                      >
                        {t.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span
                          className="state-badge"
                          style={{
                            background: `${stateColor(t.state)}22`,
                            color: stateColor(t.state),
                          }}
                        >
                          {stateLabel(t.state)}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {formatBytes(t.size * t.progress)} / {formatBytes(t.size)}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                <td>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span className="font-mono tabular-nums" style={{ color: "var(--accent-azure)", fontWeight: 600 }}>
                      {percent.toFixed(1)}%
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: "var(--text-dim)" }}>
                      {formatBytes(t.size)}
                    </span>
                  </div>
                  <div className="progress-bar-container">
                    <div
                      className={`progress-bar-fill ${t.state}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </td>

                <td>
                  <span
                    className="font-mono tabular-nums"
                    style={{
                      color: t.download_rate > 0 ? "var(--accent-azure)" : "var(--text-dim)",
                      fontWeight: t.download_rate > 0 ? 600 : 400,
                    }}
                  >
                    {t.download_rate > 0 ? formatSpeed(t.download_rate) : "—"}
                  </span>
                </td>

                <td>
                  <span
                    className="font-mono tabular-nums"
                    style={{
                      color: t.upload_rate > 0 ? "var(--accent-emerald)" : "var(--text-dim)",
                      fontWeight: t.upload_rate > 0 ? 600 : 400,
                    }}
                  >
                    {t.upload_rate > 0 ? formatSpeed(t.upload_rate) : "—"}
                  </span>
                </td>

                <td>
                  <span className="font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {formatEta(t.eta_seconds)}
                  </span>
                </td>

                <td>
                  <span className="font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {t.seeds} / {t.peers}
                  </span>
                </td>

                <td>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                    <button
                      className="control-btn"
                      id={isPaused ? `btn-resume-${t.hash}` : `btn-pause-${t.hash}`}
                      onClick={(e) => handleToggleState(e, t.hash, isPaused)}
                      title={isPaused ? "Resume (Space)" : "Pause (Space)"}
                    >
                      {isPaused ? <PlayIcon size={14} color="var(--accent-emerald)" /> : <PauseIcon size={14} color="var(--accent-amber)" />}
                    </button>
                    <button
                      className="control-btn"
                      id={`btn-folder-${t.hash}`}
                      onClick={(e) => handleOpenFolder(e, t.save_path)}
                      title="Open Download Folder"
                    >
                      <FolderIcon size={14} />
                    </button>
                    <button
                      className="control-btn close"
                      id={`btn-remove-${t.hash}`}
                      onClick={(e) => handleRemove(e, t.hash)}
                      title="Delete Torrent (Del)"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Right-Click Desktop Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          id="torrent-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-item"
            onClick={() => {
              contextMenu.torrent.state === "paused"
                ? apiClient.resumeTorrent(contextMenu.torrent.hash)
                : apiClient.pauseTorrent(contextMenu.torrent.hash);
              setContextMenu(null);
            }}
          >
            {contextMenu.torrent.state === "paused" ? (
              <>
                <PlayIcon size={14} color="var(--accent-emerald)" />
                <span>Resume Swarm</span>
              </>
            ) : (
              <>
                <PauseIcon size={14} color="var(--accent-amber)" />
                <span>Pause Swarm</span>
              </>
            )}
          </div>

          <div
            className="context-item"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.torrent.hash);
              setContextMenu(null);
            }}
          >
            <FileIcon size={14} />
            <span>Copy Info Hash</span>
          </div>

          <div
            className="context-item"
            onClick={() => {
              navigator.clipboard.writeText(`magnet:?xt=urn:btih:${contextMenu.torrent.hash}`);
              setContextMenu(null);
            }}
          >
            <MagnetIcon size={14} />
            <span>Copy Magnet Link</span>
          </div>

          <div
            className="context-item"
            onClick={() => {
              if (window.sentinelAPI?.openFolder) {
                window.sentinelAPI.openFolder(contextMenu.torrent.save_path);
              }
              setContextMenu(null);
            }}
          >
            <FolderIcon size={14} />
            <span>Open Download Directory</span>
          </div>

          <div className="context-divider" />

          <div
            className="context-item danger"
            onClick={() => {
              if (window.confirm(`Remove ${contextMenu.torrent.name} from Sentinel?`)) {
                apiClient.removeTorrent(contextMenu.torrent.hash, false);
              }
              setContextMenu(null);
            }}
          >
            <TrashIcon size={14} />
            <span>Remove from Queue</span>
          </div>

          <div
            className="context-item danger"
            onClick={() => {
              if (window.confirm(`PERMANENTLY DELETE ${contextMenu.torrent.name} and ALL data on disk?`)) {
                apiClient.removeTorrent(contextMenu.torrent.hash, true);
              }
              setContextMenu(null);
            }}
          >
            <TrashIcon size={14} />
            <span>Delete with Data on Disk</span>
          </div>
        </div>
      )}
    </div>
  );
};
