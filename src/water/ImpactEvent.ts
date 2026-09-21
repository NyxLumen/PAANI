import * as THREE from 'three';

/**
 * Standardized water impact contract.
 * Captures all physical and cinematic parameters of an object/droplet striking the water surface.
 */
export interface ImpactEvent {
  /** Exact 3D contact point on the animated ocean surface */
  worldPosition: THREE.Vector3;

  /** 3D velocity vector of the impacting body at contact */
  impactVelocity: THREE.Vector3;

  /** Analytical surface normal of the ocean wave at the contact point */
  surfaceNormal: THREE.Vector3;

  /**
   * Normalized impact energy [0.0 to 2.0+].
   * Derived from kinetic energy and normalized for visual scaling of ripples, crown, and splash.
   */
  impactEnergy: number;

  /** Relative impact speed along the surface normal (m/s) */
  normalSpeed: number;

  /** Droplet or object radius (meters) */
  scale: number;

  /** Timestamp of the impact event (seconds) */
  timestamp: number;

  /** Impact angle in radians relative to surface normal (0 = vertical strike) */
  impactAngle: number;
}
