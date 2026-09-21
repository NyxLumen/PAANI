import React from 'react';
import { QualityTier } from '../core/QualityManager';

interface DebugStats {
  fps: number;
  frameTimeMs: string;
  tier: QualityTier;
  dpr: number;
  drawCalls: number;
  triangles: number;
  dropY: string;
  isUnderwater: boolean;
}

interface DebugUIProps {
  stats: DebugStats | null;
  isVisible: boolean;
  onClose: () => void;
  onSetTier: (tier: QualityTier) => void;
}

export const DebugUI: React.FC<DebugUIProps> = ({ stats, isVisible, onClose, onSetTier }) => {
  if (!isVisible || !stats) return null;

  return (
    <aside className="debug-telemetry-panel" aria-label="Engine Performance Telemetry">
      <div className="debug-header">
        <span className="debug-title">ENGINE TELEMETRY</span>
        <button className="debug-close-btn" onClick={onClose}>×</button>
      </div>

      <div className="debug-grid">
        <div className="debug-item">
          <span className="debug-label">FPS</span>
          <span className={`debug-value ${stats.fps < 45 ? 'warn' : 'good'}`}>{stats.fps}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Frame Time</span>
          <span className="debug-value">{stats.frameTimeMs} ms</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Quality Tier</span>
          <span className="debug-value highlight">{stats.tier}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">DPR Cap</span>
          <span className="debug-value">{stats.dpr.toFixed(2)}x</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Draw Calls</span>
          <span className="debug-value">{stats.drawCalls}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Triangles</span>
          <span className="debug-value">{stats.triangles.toLocaleString()}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Drop Y</span>
          <span className="debug-value">{stats.dropY} m</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Medium</span>
          <span className="debug-value">{stats.isUnderwater ? 'UNDERWATER' : 'AIR'}</span>
        </div>
      </div>

      <div className="debug-tier-selector">
        <span className="debug-label">Override Tier:</span>
        <div className="tier-buttons">
          {(['HIGH', 'MEDIUM', 'LOW'] as QualityTier[]).map((t) => (
            <button
              key={t}
              className={`tier-btn ${stats.tier === t ? 'active' : ''}`}
              onClick={() => onSetTier(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};
