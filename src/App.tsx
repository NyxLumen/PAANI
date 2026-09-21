import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Experience } from './core/Experience';
import { StoryPhase } from './story/StoryDirector';
import { QualityTier } from './core/QualityManager';
import { ExperienceUI } from './components/ExperienceUI';
import { DebugUI } from './components/DebugUI';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<Experience | null>(null);

  const [phase, setPhase] = useState<StoryPhase>('OPENING');
  const [caption, setCaption] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [debugStats, setDebugStats] = useState<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize the pure 3D / GLSL procedural Experience
    const exp = new Experience(canvas, {
      onPhaseChange: (newPhase) => setPhase(newPhase),
      onCaptionChange: (newCap) => setCaption(newCap),
    });
    experienceRef.current = exp;
    exp.start();

    // Telemetry polling interval for debug panel
    const statsInterval = setInterval(() => {
      if (experienceRef.current) {
        setDebugStats(experienceRef.current.getStats());
      }
    }, 200);

    // Keyboard shortcut for debug panel ('D')
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        setIsDebugOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(statsInterval);
      window.removeEventListener('keydown', handleKeyDown);
      exp.destroy();
      experienceRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    if (experienceRef.current) {
      experienceRef.current.startStory();
    }
  }, []);

  const handleRestart = useCallback(() => {
    if (experienceRef.current) {
      experienceRef.current.resetStory();
    }
  }, []);

  const handleSetTier = useCallback((tier: QualityTier) => {
    if (experienceRef.current) {
      experienceRef.current.setQualityTier(tier);
    }
  }, []);

  return (
    <main className="paani-root-container">
      {/* 3D WebGL2 Canvas */}
      <canvas ref={canvasRef} className="webgl3d-canvas" />

      {/* Subtle Physical Surface Crossing Vignette Flash */}
      <div
        className={`surface-crossing-flash ${debugStats?.isUnderwater ? 'underwater' : ''}`}
      />

      {/* Cinematic Typography & UI Overlay */}
      <ExperienceUI
        phase={phase}
        caption={caption}
        onStart={handleStart}
        onRestart={handleRestart}
        onToggleDebug={() => setIsDebugOpen((prev) => !prev)}
      />

      {/* Developer Debug Telemetry Panel */}
      <DebugUI
        stats={debugStats}
        isVisible={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        onSetTier={handleSetTier}
      />
    </main>
  );
};
export default App;
