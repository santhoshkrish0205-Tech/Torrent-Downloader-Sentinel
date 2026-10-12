// renderer/src/App.tsx
import React, { useEffect, useState, useRef } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { TorrentList } from "./components/TorrentList";
import { TorrentDetails } from "./components/TorrentDetails";
import { AddTorrentModal } from "./components/AddTorrentModal";
import { SettingsModal } from "./components/SettingsModal";
import { useTorrentStore } from "./store/torrentStore";
import { apiClient } from "./api/client";
import {
  SearchIcon,
  PlusIcon,
  PlayIcon,
  PauseIcon,
  FileIcon,
} from "./components/icons";

export const App: React.FC = () => {
  const searchQuery = useTorrentStore((state) => state.searchQuery);
  const setSearchQuery = useTorrentStore((state) => state.setSearchQuery);
  const setAddModalOpen = useTorrentStore((state) => state.setAddModalOpen);
  const torrents = useTorrentStore((state) => state.torrents);
  const selectedHash = useTorrentStore((state) => state.selectedHash);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [detailsHeight, setDetailsHeight] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    apiClient.init();

    // Global keyboard shortcuts
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setAddModalOpen(true);
      }
      if (isCmdOrCtrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [setAddModalOpen]);

  // Global Drag & Drop handler for .torrent files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only exit when leaving window boundaries
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      setIsDraggingFile(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.toLowerCase().endsWith(".torrent")) {
          const reader = new FileReader();
          reader.onload = async () => {
            const result = reader.result as string;
            const b64 = result.split(",")[1] || result;
            try {
              await apiClient.addTorrentFile(b64);
            } catch (err: any) {
              alert(`Error adding torrent: ${err.message || err}`);
            }
          };
          reader.readAsDataURL(file);
        } else {
          alert("Only .torrent files can be added via drag and drop.");
        }
      }
    }
  };

  // Resizable details panel splitter
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = window.innerHeight - moveEvent.clientY;
      const clamped = Math.max(120, Math.min(500, newHeight));
      setDetailsHeight(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handlePauseAll = async () => {
    for (const t of torrents) {
      if (t.state === "downloading" || t.state === "seeding") {
        await apiClient.pauseTorrent(t.hash);
      }
    }
  };

  const handleResumeAll = async () => {
    for (const t of torrents) {
      if (t.state === "paused") {
        await apiClient.resumeTorrent(t.hash);
      }
    }
  };

  return (
    <div
      className="app-container"
      id="app-root"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TitleBar />

      <div className="app-content">
        <Sidebar />

        <main className="workspace">
          <div className="toolbar" id="toolbar">
            <div className="toolbar-left">
              <div className="search-box">
                <SearchIcon size={16} color="var(--text-dim)" />
                <input
                  ref={searchInputRef}
                  type="text"
                  id="search-input"
                  className="search-input"
                  placeholder="Filter swarms (Ctrl+F)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="toolbar-right">
              <button
                className="btn btn-secondary"
                id="btn-resume-all"
                onClick={handleResumeAll}
                title="Resume all active transfers"
              >
                <PlayIcon size={14} color="var(--accent-emerald)" />
                <span>Resume All</span>
              </button>
              <button
                className="btn btn-secondary"
                id="btn-pause-all"
                onClick={handlePauseAll}
                title="Pause all transfers"
              >
                <PauseIcon size={14} color="var(--accent-amber)" />
                <span>Pause All</span>
              </button>
              <button
                className="btn btn-primary"
                id="btn-quick-add"
                onClick={() => setAddModalOpen(true)}
                title="Add Torrent (Ctrl+N)"
              >
                <PlusIcon size={15} />
                <span>Add Torrent</span>
              </button>
            </div>
          </div>

          <TorrentList />

          {selectedHash && (
            <>
              <div
                className={`details-splitter ${isResizing ? "active" : ""}`}
                onMouseDown={handleSplitterMouseDown}
                title="Drag to resize panel"
              />
              <div style={{ height: detailsHeight }}>
                <TorrentDetails />
              </div>
            </>
          )}
        </main>
      </div>

      {/* Global Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="drag-drop-overlay" id="drag-drop-overlay">
          <FileIcon size={56} color="var(--accent-azure)" />
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: 18, color: "#fff", marginBottom: 6 }}>Drop .torrent file to download</h2>
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
              Sentinel will automatically parse metadata and initiate swarm connection.
            </p>
          </div>
        </div>
      )}

      <AddTorrentModal />
      <SettingsModal />
    </div>
  );
};
