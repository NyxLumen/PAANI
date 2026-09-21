import { DropCamera } from '../drop/DropCamera';
import { DropPhysics } from '../drop/DropPhysics';
import { WaterInteraction } from '../water/WaterInteraction';
import { ImpactEvent } from '../water/ImpactEvent';
import { Rainforest } from '../world/rainforest/Rainforest';
import { EnvironmentManager } from '../environment/EnvironmentManager';

export type StoryLifecycle = 'WAITING_FOR_START' | 'ACTIVE' | 'COMPLETE';
export type StoryPhase =
  | 'OPENING'
  | 'REVEAL'
  | 'DESCENT'
  | 'IMPACT'
  | 'UNDERWATER'
  | 'RAINFOREST_TRANSITION'
  | 'RAINFOREST_CANOPY'
  | 'RAINFOREST_LEAF'
  | 'RAINFOREST_PUDDLE';

export interface StoryCallbacks {
  onPhaseChange?: (phase: StoryPhase) => void;
  onCaptionChange?: (caption: string | null) => void;
  onLifecycleChange?: (lifecycle: StoryLifecycle) => void;
}

export class StoryDirector {
  public lifecycle: StoryLifecycle = 'WAITING_FOR_START';
  public phase: StoryPhase = 'OPENING';
  private camera: DropCamera;
  private physics: DropPhysics;
  private interaction: WaterInteraction;
  private callbacks: StoryCallbacks;
  private timer: number = 0;

  private envManager?: EnvironmentManager;
  private rainforest?: Rainforest;

  constructor(
    camera: DropCamera,
    physics: DropPhysics,
    interaction: WaterInteraction,
    callbacks: StoryCallbacks = {},
    envManager?: EnvironmentManager,
    rainforest?: Rainforest
  ) {
    this.camera = camera;
    this.physics = physics;
    this.interaction = interaction;
    this.callbacks = callbacks;
    this.envManager = envManager;
    this.rainforest = rainforest;
  }

  public setEnvironmentContext(envManager: EnvironmentManager, rainforest: Rainforest) {
    this.envManager = envManager;
    this.rainforest = rainforest;
  }

  public setCallbacks(callbacks: StoryCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public start() {
    if (this.lifecycle === 'WAITING_FOR_START') {
      this.lifecycle = 'ACTIVE';
      this.setPhase('REVEAL');
      this.camera.startDropReveal();
      this.timer = 0;
      this.emitCaption('A single drop holds the memory of oceans.');
      if (this.callbacks.onLifecycleChange) {
        this.callbacks.onLifecycleChange(this.lifecycle);
      }
    }
  }

  public reset() {
    this.lifecycle = 'WAITING_FOR_START';
    this.phase = 'OPENING';
    this.timer = 0;
    this.physics.reset();
    this.camera.reset();
    this.interaction.reset();
    if (this.rainforest) {
      this.rainforest.interaction.reset();
    }
    if (this.envManager) {
      this.envManager.transitionTo('ocean', 0.5);
    }
    this.emitPhase('OPENING');
    this.emitCaption(null);
    if (this.callbacks.onLifecycleChange) {
      this.callbacks.onLifecycleChange(this.lifecycle);
    }
  }

  public handleImpact(event: ImpactEvent) {
    this.setPhase('IMPACT');
    this.interaction.dispatchImpact(event);
    this.emitCaption('The boundary dissolves.');
  }

  public handleSubmerged() {
    this.setPhase('UNDERWATER');
    this.camera.setMode('UNDERWATER');
    this.emitCaption('In the deep, all water is one.');
  }

  public startRainforestJourney() {
    this.setPhase('RAINFOREST_TRANSITION');
    this.camera.setMode('RAINFOREST_TRANSITION');
    this.emitCaption('Water rises as morning vapor, drawn into the breathing canopy.');

    if (this.envManager) {
      this.envManager.transitionTo('rainforest', 3.5);
    }
  }

  public jumpToRainforest() {
    this.lifecycle = 'ACTIVE';
    if (this.envManager) {
      this.envManager.transitionTo('rainforest', 0.1);
    }
    this.setPhase('RAINFOREST_CANOPY');
    this.camera.setMode('RAINFOREST_CANOPY');
    this.emitCaption('High above the forest floor, life gathers every molecule.');
  }

  public startLeafInteraction() {
    this.setPhase('RAINFOREST_LEAF');
    this.camera.setMode('RAINFOREST_LEAF');
    this.emitCaption('A drop condenses upon the ancient leaf.');
    if (this.rainforest) {
      this.rainforest.interaction.start();
    }
  }

  public update(delta: number) {
    if (delta <= 0) return;

    // While waiting for user to click START, do NOT advance any story timers or sequences
    if (this.lifecycle === 'WAITING_FOR_START') return;

    this.timer += delta;

    if (this.phase === 'REVEAL') {
      if (this.timer > 3.2) {
        this.setPhase('DESCENT');
        this.physics.startFall();
        this.emitCaption('Drawn back to the source.');
      }
    } else if (this.phase === 'UNDERWATER') {
      // After ~7 seconds underwater, offer or automatically transition to rainforest
      if (this.timer > 7.5) {
        this.startRainforestJourney();
      }
    } else if (this.phase === 'RAINFOREST_TRANSITION') {
      // Transition from ocean/shoreline to canopy
      if (this.timer > 3.8) {
        this.setPhase('RAINFOREST_CANOPY');
        this.camera.setMode('RAINFOREST_CANOPY');
        this.emitCaption('High above the forest floor, life gathers every molecule.');
      }
    } else if (this.phase === 'RAINFOREST_CANOPY') {
      // After gazing through canopy sunbeams, transition to the hero leaf
      if (this.timer > 4.5) {
        this.startLeafInteraction();
      }
    } else if (this.phase === 'RAINFOREST_LEAF') {
      // Track the hero drop on the leaf
      if (this.rainforest) {
        const leafState = this.rainforest.interaction.state;
        if (leafState === 'SLIDING_ON_LEAF' && this.timer > 1.2 && this.timer < 3.0) {
          this.emitCaption("Guided along the spine, drawn by gravity.");
        } else if (leafState === 'TIP_ACCUMULATION') {
          this.emitCaption("At the edge of falling.");
        } else if (leafState === 'PUDDLE_IMPACT' || leafState === 'RESTING_IN_PUDDLE') {
          this.setPhase('RAINFOREST_PUDDLE');
          this.camera.setMode('RAINFOREST_PUDDLE');
          this.emitCaption("Dissolving into the forest pool. The cycle deepens.");
          this.lifecycle = 'COMPLETE';
          if (this.callbacks.onLifecycleChange) {
            this.callbacks.onLifecycleChange(this.lifecycle);
          }
        }
      }
    }
  }

  private setPhase(newPhase: StoryPhase) {
    this.phase = newPhase;
    this.timer = 0;
    this.emitPhase(newPhase);
  }

  private emitPhase(phase: StoryPhase) {
    if (this.callbacks.onPhaseChange) {
      this.callbacks.onPhaseChange(phase);
    }
  }

  private emitCaption(caption: string | null) {
    if (this.callbacks.onCaptionChange) {
      this.callbacks.onCaptionChange(caption);
    }
  }
}
