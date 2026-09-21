import React from 'react';
import { StoryPhase } from '../story/StoryDirector';

interface ExperienceUIProps {
  phase: StoryPhase;
  caption: string | null;
  onStart: () => void;
  onRestart: () => void;
  onContinueToRainforest?: () => void;
  onReplayLeaf?: () => void;
  onToggleDebug: () => void;
}

export const ExperienceUI: React.FC<ExperienceUIProps> = ({
  phase,
  caption,
  onStart,
  onRestart,
  onContinueToRainforest,
  onReplayLeaf,
  onToggleDebug,
}) => {
  return (
    <div className="experience-ui-container">
      {/* 1. Opening Screen */}
      {phase === 'OPENING' && (
        <div className="opening-screen-wrap animate-fade-in">
          <div className="title-block">
            <h1 className="cinematic-title">PĀNI</h1>
            <p className="cinematic-tagline">one drop. infinite journeys.</p>
          </div>

          <div className="start-btn-container">
            <button className="cinematic-start-btn" onClick={onStart}>
              <span className="start-btn-text">start</span>
              <svg className="start-btn-scribble" viewBox="0 0 140 32" fill="none">
                <path
                  d="M6 22 C 30 10, 70 8, 134 20 C 105 28, 45 26, 12 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 2. Poetic Narrative Captions */}
      {phase !== 'OPENING' && caption && (
        <div className="caption-container animate-fade-in" key={caption}>
          <p className="caption-text">{caption}</p>
        </div>
      )}

      {/* 3. Underwater Controls: Re-emerge or Ascend into Rainforest */}
      {phase === 'UNDERWATER' && (
        <div className="underwater-controls animate-fade-in">
          <button className="replay-cycle-btn" onClick={onRestart}>
            <span className="replay-icon">↻</span>
            <span className="replay-text">re-emerge</span>
          </button>
          {onContinueToRainforest && (
            <button
              className="replay-cycle-btn"
              onClick={onContinueToRainforest}
              style={{ marginLeft: '12px', background: 'rgba(20, 55, 35, 0.45)' }}
            >
              <span className="replay-icon">↗</span>
              <span className="replay-text">rainforest canopy</span>
            </button>
          )}
        </div>
      )}

      {/* 4. Rainforest Puddle Completion Controls */}
      {phase === 'RAINFOREST_PUDDLE' && (
        <div className="underwater-controls animate-fade-in">
          <button className="replay-cycle-btn" onClick={onRestart}>
            <span className="replay-icon">↻</span>
            <span className="replay-text">return to ocean</span>
          </button>
          {onReplayLeaf && (
            <button
              className="replay-cycle-btn"
              onClick={onReplayLeaf}
              style={{ marginLeft: '12px', background: 'rgba(20, 55, 35, 0.45)' }}
            >
              <span className="replay-icon">💧</span>
              <span className="replay-text">replay leaf drop</span>
            </button>
          )}
        </div>
      )}

      {/* 4. Subtle Developer Debug Toggle */}
      <div className="debug-toggle-wrapper">
        <button
          className="debug-toggle-btn"
          onClick={onToggleDebug}
          title="Toggle Performance Telemetry (D)"
        >
          DEBUG [D]
        </button>
      </div>
    </div>
  );
};
