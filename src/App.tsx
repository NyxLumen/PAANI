import React, { useEffect, useRef, useState } from 'react';
import { SceneId } from './types/story';
import { environments, scenes } from './data/storyGraph';
import { WebGLRenderer } from './webgl/Renderer';
import { CameraController } from './animation/CameraController';
import { OpeningUI } from './components/OpeningUI';
import { IntroUI } from './components/IntroUI';
import { ChoiceUI } from './components/ChoiceUI';
import { DestinationUI } from './components/DestinationUI';
import { CycleUI } from './components/CycleUI';

export type FlowPhase =
  | 'opening'
  | 'diving'
  | 'intro'
  | 'choice'
  | 'branching'
  | 'destination'
  | 'cycle';

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

    // 2. Pre-register all media environments
    const mediaMgr = renderer.getMediaManager();
    mediaMgr.register('ocean', environments.ocean);
    mediaMgr.register('underwater', environments.underwater);
    mediaMgr.register('shore', environments.shore);
    mediaMgr.register('deep', environments.deep);
    mediaMgr.register('cloudAscent', environments.cloudAscent);
    mediaMgr.register('clouds', environments.clouds);
    mediaMgr.register('rain', environments.rain);

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
      onSubmerged: () => {},
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

  // SHORE -> CLOUD ASCENT (Evaporation)
  const handleRise = () => {
    if (!cameraRef.current) return;
    setPhase('cycle');

    cameraRef.current.executeAscent(() => {
      setCurrentScene('cloudAscent');
    });
  };

  // CLOUD ASCENT -> CLOUDS
  const handleAdvanceFromCloudAscent = () => {
    if (!cameraRef.current) return;

    cameraRef.current.executeClouds(() => {
      setCurrentScene('clouds');
    });
  };

  // CLOUDS -> RAIN
  const handleAdvanceFromClouds = () => {
    if (!cameraRef.current) return;

    cameraRef.current.executeRain(() => {
      setCurrentScene('rain');
    });
  };

  // RAIN -> OCEAN (Cycle reconnects to canonical ocean)
  const handleAdvanceFromRain = () => {
    if (!cameraRef.current) return;

    cameraRef.current.executeRainToOcean(() => {
      setCurrentScene('ocean');
      setPhase('opening');
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
        {/* Phase 1: Ocean Opening & Dive Recession */}
        <OpeningUI
          isVisible={phase === 'opening' || phase === 'diving'}
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
            onRise={currentScene === 'shore' ? handleRise : undefined}
          />
        )}

        {/* Phase 5: The Extended Cycle (Cloud Ascent -> Clouds -> Rain) */}
        {phase === 'cycle' && (
          <>
            {currentScene === 'cloudAscent' && (
              <CycleUI
                sceneId="cloudAscent"
                onAdvance={handleAdvanceFromCloudAscent}
              />
            )}
            {currentScene === 'clouds' && (
              <CycleUI
                sceneId="clouds"
                onAdvance={handleAdvanceFromClouds}
              />
            )}
            {currentScene === 'rain' && (
              <CycleUI
                sceneId="rain"
                onAdvance={handleAdvanceFromRain}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
};
