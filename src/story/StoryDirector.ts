import { DropCamera } from '../drop/DropCamera';
import { DropPhysics } from '../drop/DropPhysics';
import { WaterInteraction } from '../water/WaterInteraction';
import { ImpactEvent } from '../water/ImpactEvent';

export type StoryPhase = 'OPENING' | 'REVEAL' | 'DESCENT' | 'IMPACT' | 'UNDERWATER';

export interface StoryCallbacks {
  onPhaseChange?: (phase: StoryPhase) => void;
  onCaptionChange?: (caption: string | null) => void;
}

export class StoryDirector {
  public phase: StoryPhase = 'OPENING';
  private camera: DropCamera;
  private physics: DropPhysics;
  private interaction: WaterInteraction;
  private callbacks: StoryCallbacks;
  private timer: number = 0;

  constructor(
    camera: DropCamera,
    physics: DropPhysics,
    interaction: WaterInteraction,
    callbacks: StoryCallbacks = {}
  ) {
    this.camera = camera;
    this.physics = physics;
    this.interaction = interaction;
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: StoryCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public start() {
    if (this.phase === 'OPENING') {
      this.setPhase('REVEAL');
      this.camera.startDropReveal();
      this.timer = 0;
      this.emitCaption('A single drop holds the memory of oceans.');
    }
  }

  public reset() {
    this.phase = 'OPENING';
    this.timer = 0;
    this.physics.reset();
    this.camera.reset();
    this.interaction.reset();
    this.emitPhase('OPENING');
    this.emitCaption(null);
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

  public update(delta: number) {
    if (delta <= 0) return;
    this.timer += delta;

    if (this.phase === 'REVEAL') {
      if (this.timer > 3.2) {
        this.setPhase('DESCENT');
        this.physics.startFall();
        this.emitCaption('Drawn back to the source.');
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
