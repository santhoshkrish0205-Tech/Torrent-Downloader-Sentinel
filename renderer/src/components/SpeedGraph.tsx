// renderer/src/components/SpeedGraph.tsx
import React from "react";
import { useTorrentStore } from "../store/torrentStore";
import { formatSpeed } from "../types/torrent";

export const SpeedGraph: React.FC = () => {
  const speedHistory = useTorrentStore((state) => state.speedHistory);
  const stats = useTorrentStore((state) => state.stats);

  const width = 230;
  const height = 75;

  // Find max rate for scaling with a minimum floor of 1 MB/s
  const maxDl = Math.max(...speedHistory.map((p) => p.dl), 1024 * 1024);
  const maxUl = Math.max(...speedHistory.map((p) => p.ul), 512 * 1024);
  const maxRate = Math.max(maxDl, maxUl);

  const getPoints = (key: "dl" | "ul") => {
    return speedHistory.map((point, index) => {
      const x = (index / (speedHistory.length - 1)) * width;
      const val = point[key];
      const y = height - (val / maxRate) * (height - 8) - 4;
      return { x, y };
    });
  };

  const dlPoints = getPoints("dl");
  const ulPoints = getPoints("ul");

  const makePath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    return points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, "");
  };

  const makeAreaPath = (points: { x: number; y: number }[]) => {
    const line = makePath(points);
    if (!line) return "";
    return `${line} L ${width} ${height} L 0 ${height} Z`;
  };

  return (
    <div className="speed-graph-container" id="speed-graph">
      <div className="speed-graph-title">
        <span>SWARM BANDWIDTH</span>
        <span className="font-mono" style={{ color: "var(--accent-azure)" }}>
          {formatSpeed(stats.total_download_rate)}
        </span>
      </div>

      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Upload curve under */}
        <path d={makeAreaPath(ulPoints)} fill="url(#ulGrad)" />
        <path d={makePath(ulPoints)} fill="none" stroke="#10b981" strokeWidth="1.5" />

        {/* Download curve */}
        <path d={makeAreaPath(dlPoints)} fill="url(#dlGrad)" />
        <path d={makePath(dlPoints)} fill="none" stroke="#00d2ff" strokeWidth="2" />
      </svg>
    </div>
  );
};
