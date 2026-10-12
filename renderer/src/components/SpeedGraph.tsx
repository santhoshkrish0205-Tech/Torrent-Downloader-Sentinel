// renderer/src/components/SpeedGraph.tsx
import React, { useMemo } from "react";
import { useTorrentStore } from "../store/torrentStore";
import { formatSpeed } from "../types/torrent";
import { ActivityIcon } from "./icons";

export const SpeedGraph: React.FC = () => {
  const speedHistory = useTorrentStore((state) => state.speedHistory);
  const stats = useTorrentStore((state) => state.stats);

  const viewBoxWidth = 220;
  const viewBoxHeight = 56;

  // Scale with minimum floor of 1 MB/s so flatline sits cleanly at bottom
  const maxDl = Math.max(...speedHistory.map((p) => p.dl), 1024 * 1024);
  const maxUl = Math.max(...speedHistory.map((p) => p.ul), 512 * 1024);
  const maxRate = Math.max(maxDl, maxUl);

  // Peak rate in current history window
  const peakDl = useMemo(() => Math.max(...speedHistory.map((p) => p.dl), 0), [speedHistory]);

  const getPoints = (key: "dl" | "ul") => {
    return speedHistory.map((point, index) => {
      const x = (index / (speedHistory.length - 1)) * viewBoxWidth;
      const val = point[key];
      const y = viewBoxHeight - (val / maxRate) * (viewBoxHeight - 8) - 4;
      return { x, y };
    });
  };

  const dlPoints = getPoints("dl");
  const ulPoints = getPoints("ul");

  // Smooth Catmull-Rom to Cubic Bezier curve
  const makeSmoothPath = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return "";
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const makeSmoothAreaPath = (points: { x: number; y: number }[]) => {
    const line = makeSmoothPath(points);
    if (!line) return "";
    return `${line} L ${viewBoxWidth} ${viewBoxHeight} L 0 ${viewBoxHeight} Z`;
  };

  const isSwarmActive = stats.total_download_rate > 0 || stats.total_upload_rate > 0;

  return (
    <div className="speed-graph-container" id="speed-graph">
      {/* Header with Title and Live Activity Indicator */}
      <div className="speed-graph-header">
        <div className="speed-graph-title-box">
          <ActivityIcon size={12} color="var(--accent-azure)" />
          <span className="speed-graph-label">SWARM BANDWIDTH</span>
        </div>
        <div className="speed-live-badge">
          <span className={`pulse-dot ${isSwarmActive ? "active" : ""}`} />
          <span className="pulse-text">{isSwarmActive ? "LIVE" : "IDLE"}</span>
        </div>
      </div>

      {/* Dedicated Dual Metrics Row (Clean side-by-side pills) */}
      <div className="speed-graph-metrics">
        <div className="speed-metric dl" title={`Download Rate: ${formatSpeed(stats.total_download_rate)}`}>
          <div className="speed-metric-tag">
            <span className="speed-metric-arrow">↓</span>
            <span className="speed-metric-code">DL</span>
          </div>
          <span className="speed-metric-val font-mono tabular-nums">
            {formatSpeed(stats.total_download_rate)}
          </span>
        </div>

        <div className="speed-metric ul" title={`Upload Rate: ${formatSpeed(stats.total_upload_rate)}`}>
          <div className="speed-metric-tag">
            <span className="speed-metric-arrow">↑</span>
            <span className="speed-metric-code">UL</span>
          </div>
          <span className="speed-metric-val font-mono tabular-nums">
            {formatSpeed(stats.total_upload_rate)}
          </span>
        </div>
      </div>

      {/* High-tech Canvas Sparkline */}
      <div className="speed-graph-chart-box">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="none"
          className="speed-graph-svg"
        >
          <defs>
            <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Guide grid lines */}
          <line
            x1="0"
            y1={viewBoxHeight * 0.33}
            x2={viewBoxWidth}
            y2={viewBoxHeight * 0.33}
            stroke="rgba(255, 255, 255, 0.04)"
            strokeDasharray="2 3"
          />
          <line
            x1="0"
            y1={viewBoxHeight * 0.66}
            x2={viewBoxWidth}
            y2={viewBoxHeight * 0.66}
            stroke="rgba(255, 255, 255, 0.04)"
            strokeDasharray="2 3"
          />

          {/* Upload smooth curve under */}
          <path d={makeSmoothAreaPath(ulPoints)} fill="url(#ulGrad)" />
          <path
            d={makeSmoothPath(ulPoints)}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Download smooth curve over */}
          <path d={makeSmoothAreaPath(dlPoints)} fill="url(#dlGrad)" />
          <path
            d={makeSmoothPath(dlPoints)}
            fill="none"
            stroke="#00d2ff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Peak overlay footer inside chart box */}
        <div className="speed-chart-footer">
          <span>PEAK:</span>
          <span className="font-mono tabular-nums">{formatSpeed(peakDl)}</span>
        </div>
      </div>
    </div>
  );
};
