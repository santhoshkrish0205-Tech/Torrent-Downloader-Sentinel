// renderer/src/components/AddTorrentModal.tsx
import React, { useState } from "react";
import { useTorrentStore } from "../store/torrentStore";
import { apiClient } from "../api/client";
import {
  CloseIcon,
  MagnetIcon,
  FileIcon,
  FolderIcon,
  PlusIcon,
} from "./icons";

export const AddTorrentModal: React.FC = () => {
  const isOpen = useTorrentStore((state) => state.isAddModalOpen);
  const setOpen = useTorrentStore((state) => state.setAddModalOpen);
  const defaultSavePath = useTorrentStore((state) => state.settings.default_save_path) || "/home/user/Downloads";

  const [activeTab, setActiveTab] = useState<"magnet" | "file">("magnet");
  const [magnetUri, setMagnetUri] = useState("");
  const [selectedFileB64, setSelectedFileB64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [savePath, setSavePath] = useState(defaultSavePath);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleBrowsePath = async () => {
    if (window.sentinelAPI?.chooseSavePath) {
      const chosen = await window.sentinelAPI.chooseSavePath();
      if (chosen) setSavePath(chosen);
    }
  };

  const handleBrowseTorrentFile = async () => {
    setError(null);
    if (window.sentinelAPI?.readTorrentFile) {
      try {
        const b64 = await window.sentinelAPI.readTorrentFile();
        if (b64) {
          setSelectedFileB64(b64);
          setFileName("Selected .torrent file");
        }
      } catch (err: any) {
        setError(err.message || "Failed to read torrent file");
      }
    } else {
      // In web/dev mode, open HTML input
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".torrent";
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          setFileName(file.name);
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const b64 = result.split(",")[1] || result;
            setSelectedFileB64(b64);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (activeTab === "magnet") {
        if (!magnetUri.trim().startsWith("magnet:?")) {
          throw new Error("Please enter a valid magnet:? URI");
        }
        await apiClient.addMagnet(magnetUri.trim(), savePath);
      } else {
        if (!selectedFileB64) {
          throw new Error("Please select a valid .torrent file");
        }
        await apiClient.addTorrentFile(selectedFileB64, savePath);
      }
      setMagnetUri("");
      setSelectedFileB64(null);
      setOpen(false);
    } catch (err: any) {
      setError(err.message || "Could not add torrent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" id="modal-add-torrent">
      <div className="modal-dialog">
        <div className="modal-header">
          <div className="modal-title">
            <PlusIcon size={18} color="var(--accent-azure)" />
            <span>Add New Torrent</span>
          </div>
          <button
            className="control-btn"
            id="btn-close-add-modal"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#fca5a5",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                id="tab-magnet"
                className={`btn ${activeTab === "magnet" ? "btn-primary" : "btn-secondary"}`}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setActiveTab("magnet")}
              >
                <MagnetIcon size={16} />
                <span>Magnet URI</span>
              </button>
              <button
                type="button"
                id="tab-file"
                className={`btn ${activeTab === "file" ? "btn-primary" : "btn-secondary"}`}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setActiveTab("file")}
              >
                <FileIcon size={16} />
                <span>Torrent File</span>
              </button>
            </div>

            {activeTab === "magnet" ? (
              <div className="form-group">
                <label className="form-label">Magnet Link or Info-Hash</label>
                <input
                  type="text"
                  id="input-magnet"
                  className="form-input font-mono"
                  placeholder="magnet:?xt=urn:btih:..."
                  value={magnetUri}
                  onChange={(e) => setMagnetUri(e.target.value)}
                  autoFocus
                />
              </div>
            ) : (
              <div className="drop-zone" id="btn-browse-file" onClick={handleBrowseTorrentFile}>
                <FileIcon size={32} color="var(--accent-azure)" />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {fileName || "Click to browse .torrent file"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                    Standard BitTorrent metadata format (.torrent)
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Download Destination</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  className="form-input font-mono"
                  style={{ flex: 1 }}
                  value={savePath}
                  onChange={(e) => setSavePath(e.target.value)}
                />
                <button
                  type="button"
                  id="btn-browse-save-path"
                  className="btn btn-secondary"
                  onClick={handleBrowsePath}
                  title="Choose destination directory"
                >
                  <FolderIcon size={16} />
                  <span>Browse</span>
                </button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              id="btn-cancel-add-torrent"
              className="btn btn-secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-submit-add-torrent"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Adding..." : "Start Download"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
