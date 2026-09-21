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
  phase?: string;
  environment?: string;

  // Phase 5 Water Interaction Telemetry
  impactEnergy?: string;
  impactSpeed?: string;
  surfaceNormal?: string;
  activeRipples?: number;
  activeMicroDroplets?: number;
  activeMesoLobes?: number;
  activeBubbles?: number;
}

interface DebugUIProps {
  stats: DebugStats | null;
  isVisible: boolean;
  onClose: () => void;
  onSetTier: (tier: QualityTier) => void;
  onJumpOcean?: () => void;
  onJumpRainforest?: () => void;
  onJumpLeaf?: () => void;
}

export const DebugUI: React.FC<DebugUIProps> = ({
  stats,
  isVisible,
  onClose,
  onSetTier,
  onJumpOcean,
  onJumpRainforest,
  onJumpLeaf,
}) => {
  if (!isVisible || !stats) return null;

  return (
    <aside className="debug-telemetry-panel" aria-label="Engine Performance Telemetry">
      <div className="debug-header">
        <span className="debug-title">ENGINE & WATER TELEMETRY</span>
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
          <span className="debug-label">Environment</span>
          <span className="debug-value highlight">{stats.environment ?? 'Ocean'}</span>
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

        {/* Phase 5 Interaction Metrics */}
        <div className="debug-item">
          <span className="debug-label">Impact Energy</span>
          <span className="debug-value highlight">{stats.impactEnergy ?? '0.00'}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Normal Speed</span>
          <span className="debug-value">{stats.impactSpeed ? `${stats.impactSpeed} m/s` : '0.0 m/s'}</span>
        </div>
        <div className="debug-item span-2">
          <span className="debug-label">Surface Normal</span>
          <span className="debug-value small-text">{stats.surfaceNormal ?? '(0, 1, 0)'}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Active Ripples</span>
          <span className="debug-value">{stats.activeRipples ?? 0}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Micro Droplets</span>
          <span className="debug-value">{stats.activeMicroDroplets ?? 0}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Meso Lobes</span>
          <span className="debug-value">{stats.activeMesoLobes ?? 0}</span>
        </div>
        <div className="debug-item">
          <span className="debug-label">Active Bubbles</span>
          <span className="debug-value">{stats.activeBubbles ?? 0}</span>
        </div>
      </div>

      <div className="debug-tier-selector">
        <span className="debug-label">Jump Scene:</span>
        <div className="tier-buttons" style={{ marginBottom: '8px' }}>
          {onJumpOcean && (
            <button className="tier-btn" onClick={onJumpOcean}>
              Ocean
            </button>
          )}
          {onJumpRainforest && (
            <button className="tier-btn" onClick={onJumpRainforest}>
              Canopy
            </button>
          )}
          {onJumpLeaf && (
            <button className="tier-btn" onClick={onJumpLeaf}>
              Hero Leaf
            </button>
          )}
        </div>

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
