import * as THREE from 'three';
import { skyVertexShader, skyFragmentShader } from '../shaders/atmosphere/sky';

export class Sky {
  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;
  public sunDirection: THREE.Vector3;

  constructor() {
    this.sunDirection = new THREE.Vector3(0.35, 0.45, -0.82).normalize();

    this.material = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        uSunDirection: { value: this.sunDirection },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    // Sky dome geometry
    const geometry = new THREE.SphereGeometry(1000, 32, 24);
    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  public update(time: number) {
    this.material.uniforms.uTime.value = time;
  }

  public destroy() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
