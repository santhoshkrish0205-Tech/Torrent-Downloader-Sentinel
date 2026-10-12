// renderer/src/components/SettingsModal.tsx
import React, { useState, useEffect } from "react";
import { useTorrentStore } from "../store/torrentStore";
import { apiClient } from "../api/client";
import {
  CloseIcon,
  SettingsIcon,
  FolderIcon,
  ShieldIcon,
} from "./icons";

export const SettingsModal: React.FC = () => {
  const isOpen = useTorrentStore((state) => state.isSettingsModalOpen);
  const setOpen = useTorrentStore((state) => state.setSettingsModalOpen);
  const settings = useTorrentStore((state) => state.settings);

  const [dlLimitKb, setDlLimitKb] = useState<string>("");
  const [ulLimitKb, setUlLimitKb] = useState<string>("");
  const [maxConn, setMaxConn] = useState<string>("200");
  const [defaultSavePath, setDefaultSavePath] = useState<string>("");
  const [dhtEnabled, setDhtEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDlLimitKb(settings.download_limit <= 0 ? "0" : String(Math.round(settings.download_limit / 1024)));
      setUlLimitKb(settings.upload_limit <= 0 ? "0" : String(Math.round(settings.upload_limit / 1024)));
      setMaxConn(String(settings.max_connections || 200));
      setDefaultSavePath(settings.default_save_path || "/home/user/Downloads");
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleBrowseDefaultPath = async () => {
    if (window.sentinelAPI?.chooseSavePath) {
      const chosen = await window.sentinelAPI.chooseSavePath();
      if (chosen) setDefaultSavePath(chosen);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const dlVal = parseInt(dlLimitKb, 10);
    const ulVal = parseInt(ulLimitKb, 10);
    const connVal = parseInt(maxConn, 10);

    const newSettings = {
      download_limit: isNaN(dlVal) || dlVal <= 0 ? -1 : dlVal * 1024,
      upload_limit: isNaN(ulVal) || ulVal <= 0 ? -1 : ulVal * 1024,
      max_connections: isNaN(connVal) || connVal <= 0 ? 200 : connVal,
      default_save_path: defaultSavePath.trim() || null,
    };

    await apiClient.saveSettings(newSettings);
    setSaving(false);
    setOpen(false);
  };

  return (
    <div className="modal-overlay" id="modal-settings">
      <div className="modal-dialog">
        <div className="modal-header">
          <div className="modal-title">
            <SettingsIcon size={18} color="var(--accent-azure)" />
            <span>Sentinel Preferences</span>
          </div>
          <button
            className="control-btn"
            id="btn-close-settings-modal"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Download Rate Limit</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    id="input-dl-limit"
                    className="form-input font-mono"
                    placeholder="0 (Unlimited)"
                    value={dlLimitKb}
                    onChange={(e) => setDlLimitKb(e.target.value)}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>KB/s</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Upload Rate Limit</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    id="input-ul-limit"
                    className="form-input font-mono"
                    placeholder="0 (Unlimited)"
                    value={ulLimitKb}
                    onChange={(e) => setUlLimitKb(e.target.value)}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>KB/s</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Max Peer Connections</label>
              <input
                type="number"
                id="input-max-conn"
                className="form-input font-mono"
                value={maxConn}
                onChange={(e) => setMaxConn(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Default Save Directory</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  id="input-default-path"
                  className="form-input font-mono"
                  style={{ flex: 1 }}
                  value={defaultSavePath}
                  onChange={(e) => setDefaultSavePath(e.target.value)}
                />
                <button
                  type="button"
                  id="btn-browse-default-path"
                  className="btn btn-secondary"
                  onClick={handleBrowseDefaultPath}
                >
                  <FolderIcon size={16} />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            <div
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldIcon size={14} color="var(--accent-emerald)" />
                <span>Protocol Extensions</span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={dhtEnabled}
                  onChange={(e) => setDhtEnabled(e.target.checked)}
                />
                <span>Enable Distributed Hash Table (DHT) & Peer Exchange (PEX)</span>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              id="btn-cancel-settings"
              className="btn btn-secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-save-settings"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
