// renderer/src/components/TitleBar.tsx
import React, { useState, useEffect } from "react";
import { useTorrentStore } from "../store/torrentStore";
import { formatSpeed } from "../types/torrent";
import {
  DownloadIcon,
  UploadIcon,
  MinimizeIcon,
  MaximizeIcon,
  CloseIcon,
  ShieldIcon,
} from "./icons";

export const TitleBar: React.FC = () => {
  const stats = useTorrentStore((state) => state.stats);
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    const checkMax = async () => {
      if (window.sentinelAPI?.isMaximized) {
        const val = await window.sentinelAPI.isMaximized();
        setIsMax(val);
      }
    };
    checkMax();
  }, []);

  const handleMinimize = () => window.sentinelAPI?.minimizeWindow();
  const handleMaximize = async () => {
    if (window.sentinelAPI?.maximizeWindow) {
      await window.sentinelAPI.maximizeWindow();
      const val = await window.sentinelAPI.isMaximized();
      setIsMax(val);
    }
  };
  const handleClose = () => window.sentinelAPI?.closeWindow();

  return (
    <header className="titlebar" id="titlebar">
      <div className="titlebar-logo">
        <div className="logo-badge">
          <ShieldIcon size={14} color="#ffffff" />
        </div>
        <span>SENTINEL</span>
      </div>

      <div className="titlebar-stats titlebar-no-drag">
        <div className="speed-chip download" id="chip-dl-speed" title="Global Download Rate">
          <DownloadIcon size={13} color="var(--accent-azure)" />
          <span className="font-mono">{formatSpeed(stats.total_download_rate)}</span>
        </div>
        <div className="speed-chip upload" id="chip-ul-speed" title="Global Upload Rate">
          <UploadIcon size={13} color="var(--accent-emerald)" />
          <span className="font-mono">{formatSpeed(stats.total_upload_rate)}</span>
        </div>
      </div>

      <div className="window-controls titlebar-no-drag">
        <button
          className="control-btn"
          id="btn-minimize"
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize"
        >
          <MinimizeIcon size={14} />
        </button>
        <button
          className="control-btn"
          id="btn-maximize"
          onClick={handleMaximize}
          title={isMax ? "Restore" : "Maximize"}
          aria-label={isMax ? "Restore" : "Maximize"}
        >
          <MaximizeIcon size={13} />
        </button>
        <button
          className="control-btn close"
          id="btn-close"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
        >
          <CloseIcon size={14} />
        </button>
      </div>
    </header>
  );
};
