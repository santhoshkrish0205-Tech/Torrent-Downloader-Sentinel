// renderer/src/components/PieceMap.tsx
import React, { useEffect, useRef } from "react";
import { Torrent } from "../types/torrent";

interface PieceMapProps {
  torrent: Torrent;
}

export const PieceMap: React.FC<PieceMapProps> = ({ torrent }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Number of visual piece blocks to draw (e.g. 200 blocks across 5 rows)
    const totalBlocks = 200;
    const cols = 40;
    const rows = 5;
    const blockWidth = (width - (cols - 1) * 2) / cols;
    const blockHeight = (height - (rows - 1) * 2) / rows;

    const completedBlocks = Math.floor(torrent.progress * totalBlocks);
    const isDownloading = torrent.state === "downloading";

    for (let i = 0; i < totalBlocks; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (blockWidth + 2);
      const y = row * (blockHeight + 2);

      if (i < completedBlocks) {
        ctx.fillStyle = "#10b981"; // verified piece (emerald)
      } else if (isDownloading && i === completedBlocks) {
        ctx.fillStyle = "#00d2ff"; // active piece in flight (cyan)
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)"; // pending piece (slate)
      }

      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, blockWidth, blockHeight, 2) : ctx.rect(x, y, blockWidth, blockHeight);
      ctx.fill();
    }
  }, [torrent.progress, torrent.state]);

  const pieceCount = Math.max(1, Math.round(torrent.size / (1024 * 1024 * 2))); // approx 2MB pieces
  const verifiedPieces = Math.round(pieceCount * torrent.progress);

  return (
    <div className="piece-map-container" id="piece-map-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-dim)" }}>
        <span>BITFIELD PIECE MAP (2 MB CHUNKS)</span>
        <div style={{ display: "flex", gap: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#10b981", display: "inline-block" }} />
            <strong className="font-mono" style={{ color: "var(--text-main)" }}>{verifiedPieces}</strong> / {pieceCount} Verified
          </span>
          {torrent.state === "downloading" && (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#00d2ff", display: "inline-block" }} />
              Active Buffer
            </span>
          )}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={760}
        height={70}
        className="piece-map-canvas"
      />
    </div>
  );
};
