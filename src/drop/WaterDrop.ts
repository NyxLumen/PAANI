import * as THREE from 'three';
import { dropVertexShader, dropFragmentShader } from '../shaders/drop/drop';

export class WaterDrop {
  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;
  public radius: number = 0.32;

  // Trailing micro-bubble particles underwater
  public bubbleGroup: THREE.Group;
  private bubbleMesh: THREE.InstancedMesh;
  private readonly maxBubbles = 32;
  private bubbles: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number; scale: number }[] = [];
  private dummy = new THREE.Object3D();

  constructor(sunDirection: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(this.radius, 96, 64);

    this.material = new THREE.ShaderMaterial({
      vertexShader: dropVertexShader,
      fragmentShader: dropFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3() },
        uDeformState: { value: 0 },
        uVelocity: { value: new THREE.Vector3(0, 0, 0) },
        uImpactSquash: { value: 0.0 },
        uSubmerged: { value: 0.0 },
        uSurfaceNormal: { value: new THREE.Vector3(0, 1, 0) },
        uMergeProgress: { value: 0.0 },
        uWaterHeight: { value: 0.0 },
      },
      transparent: true,
      depthWrite: true,
      depthTest: true,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);

    this.bubbleGroup = new THREE.Group();
    const bGeom = new THREE.SphereGeometry(0.024, 8, 8);
    const bMat = new THREE.MeshBasicMaterial({
      color: 0xdbf3ff,
      transparent: true,
      opacity: 0.8,
    });
    this.bubbleMesh = new THREE.InstancedMesh(bGeom, bMat, this.maxBubbles);
    this.bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bubbleGroup.add(this.bubbleMesh);

    for (let i = 0; i < this.maxBubbles; i++) {
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.bubbleMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  public setPosition(pos: THREE.Vector3) {
    this.mesh.position.copy(pos);
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position;
  }

  public setDeformState(state: number) {
    this.material.uniforms.uDeformState.value = state;
  }

  public setVelocity(vel: THREE.Vector3) {
    this.material.uniforms.uVelocity.value.copy(vel);
  }

  public setImpactSquash(squash: number) {
    this.material.uniforms.uImpactSquash.value = squash;
  }

  public setSubmerged(submerged: number) {
    this.material.uniforms.uSubmerged.value = submerged;
  }

  public setSurfaceNormal(normal: THREE.Vector3) {
    this.material.uniforms.uSurfaceNormal.value.copy(normal);
  }

  public setMergeProgress(progress: number) {
    this.material.uniforms.uMergeProgress.value = progress;
  }

  public setWaterHeight(height: number) {
    this.material.uniforms.uWaterHeight.value = height;
  }

  public emitBubble(pos: THREE.Vector3) {
    if (this.bubbles.length < this.maxBubbles) {
      this.bubbles.push({
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.15
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          0.4 + Math.random() * 0.6,
          (Math.random() - 0.5) * 0.1
        ),
        life: 0,
        maxLife: 1.2 + Math.random() * 0.8,
        scale: 0.6 + Math.random() * 0.8,
      });
    }
  }

  public update(time: number, cameraPos: THREE.Vector3, delta: number) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPosition.value.copy(cameraPos);

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life += delta;
      if (b.life >= b.maxLife) {
        this.bubbles.splice(i, 1);
      } else {
        b.pos.addScaledVector(b.vel, delta);
        b.vel.y += 0.5 * delta;
      }
    }

    for (let i = 0; i < this.maxBubbles; i++) {
      if (i < this.bubbles.length) {
        const b = this.bubbles[i];
        const progress = b.life / b.maxLife;
        const currentScale = b.scale * (1.0 - progress * 0.5);
        this.dummy.position.copy(b.pos);
        this.dummy.scale.set(currentScale, currentScale, currentScale);
        this.dummy.updateMatrix();
        this.bubbleMesh.setMatrixAt(i, this.dummy.matrix);
      } else {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.bubbleMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  public destroy() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.bubbleMesh.geometry.dispose();
    (this.bubbleMesh.material as THREE.Material).dispose();
  }
}
