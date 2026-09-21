import React, { useEffect, useRef, useState } from 'react';
import { SceneId } from './types/story';
import { environments, scenes } from './data/storyGraph';
import { WebGLRenderer } from './webgl/Renderer';
import { CameraController } from './animation/CameraController';
import { OpeningUI } from './components/OpeningUI';
import { IntroUI } from './components/IntroUI';
import { ChoiceUI } from './components/ChoiceUI';
import { DestinationUI } from './components/DestinationUI';

export type FlowPhase = 'opening' | 'diving' | 'intro' | 'choice' | 'branching' | 'destination';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<CameraController | null>(null);

  const [currentScene, setCurrentScene] = useState<SceneId>('ocean');
  const [phase, setPhase] = useState<FlowPhase>('opening');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Initialize WebGL Renderer
    const renderer = new WebGLRenderer(canvas);
    rendererRef.current = renderer;

    // 2. Pre-register media environments
    const mediaMgr = renderer.getMediaManager();
    mediaMgr.register('ocean', environments.ocean);
    mediaMgr.register('underwater', environments.underwater);
    mediaMgr.register('shore', environments.shore);
    mediaMgr.register('deep', environments.deep);

    // 3. Initialize Camera Controller
    const camera = new CameraController(renderer);
    cameraRef.current = camera;

    // 4. Start Render Loop
    renderer.start();

    return () => {
      camera.destroy();
      renderer.destroy();
    };
  }, []);

  // START -> DIVE Transition
  const handleStart = () => {
    if (!cameraRef.current) return;
    setPhase('diving');

    cameraRef.current.executeDive({
      onSubmerged: () => {
        // Under the surface
      },
      onComplete: () => {
        setCurrentScene('underwater');
        setPhase('intro');
      },
    });
  };

  // INTRO -> FIRST CHOICE
  const handleIntroComplete = () => {
    setCurrentScene('choice');
    setPhase('choice');
  };

  // CHOICE HOVER REACTION
  const handleChoiceHover = (direction: 'left' | 'down' | null) => {
    if (!cameraRef.current) return;
    cameraRef.current.setChoiceHover(direction);
  };

  // FIRST CHOICE -> SHORE or DEEP
  const handleSelectChoice = (choice: 'shore' | 'deep') => {
    if (!cameraRef.current) return;
    setPhase('branching');

    cameraRef.current.executeBranchTransition(choice, () => {
      setCurrentScene(choice);
      setPhase('destination');
    });
  };

  // RESTART LOOP
  const handleRestart = () => {
    if (!cameraRef.current) return;
    cameraRef.current.resetToOcean();
    setCurrentScene('ocean');
    setPhase('opening');
  };

  const currentSceneConfig = scenes[currentScene];

  return (
    <main className="paani-experience">
      {/* WebGL Canvas */}
      <canvas ref={canvasRef} className="webgl-canvas" />

      {/* Cinematic Overlays */}
      <div className="film-grain-overlay" />
      <div className="vignette-overlay" />

      {/* Interactive UI Layers */}
      <div className="ui-layer">
        {/* Phase 1: Ocean Opening */}
        <OpeningUI
          isVisible={phase === 'opening'}
          onStart={handleStart}
        />

        {/* Phase 2: Underwater Intro Narrative */}
        {phase === 'intro' && currentSceneConfig.narrative && (
          <IntroUI
            text={currentSceneConfig.narrative.text}
            holdDuration={currentSceneConfig.narrative.holdDuration}
            onComplete={handleIntroComplete}
          />
        )}

        {/* Phase 3: The First Choice */}
        {phase === 'choice' && (
          <ChoiceUI
            onHoverChoice={handleChoiceHover}
            onSelectChoice={handleSelectChoice}
          />
        )}

        {/* Phase 4: Branch Destinations (Shore / Deep) */}
        {phase === 'destination' && (currentScene === 'shore' || currentScene === 'deep') && (
          <DestinationUI
            sceneId={currentScene}
            onRestart={handleRestart}
          />
        )}
      </div>
    </main>
  );
};
