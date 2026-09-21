import * as THREE from 'three';

interface MicroDroplet {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
}

export class Splash {
  public group: THREE.Group;
  private dropletMesh: THREE.InstancedMesh;
  private crownMesh: THREE.Mesh;
  private crownMaterial: THREE.MeshBasicMaterial;
  private droplets: MicroDroplet[] = [];
  private readonly maxDroplets = 48;
  private dummy = new THREE.Object3D();
  private isCrownActive = false;
  private crownTimer = 0;

  constructor() {
    this.group = new THREE.Group();

    // Micro droplets instanced mesh (tiny glass-like beads)
    const dropGeom = new THREE.SphereGeometry(0.022, 10, 8);
    const dropMat = new THREE.MeshBasicMaterial({
      color: 0xd6f0ff,
      transparent: true,
      opacity: 0.85,
    });
    this.dropletMesh = new THREE.InstancedMesh(dropGeom, dropMat, this.maxDroplets);
    this.dropletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.dropletMesh);

    // Subtle splash crown ring
    const crownGeom = new THREE.CylinderGeometry(0.35, 0.18, 0.22, 24, 1, true);
    this.crownMaterial = new THREE.MeshBasicMaterial({
      color: 0xcde8fa,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.crownMesh = new THREE.Mesh(crownGeom, this.crownMaterial);
    this.crownMesh.visible = false;
    this.group.add(this.crownMesh);

    // Hide all droplets initially
    for (let i = 0; i < this.maxDroplets; i++) {
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.dropletMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.dropletMesh.instanceMatrix.needsUpdate = true;
  }

  public trigger(position: THREE.Vector3) {
    this.droplets = [];

    // Spawn subtle crown
    this.crownMesh.position.copy(position).add(new THREE.Vector3(0, 0.06, 0));
    this.crownMesh.scale.set(0.2, 0.2, 0.2);
    this.crownMesh.visible = true;
    this.crownMaterial.opacity = 0.65;
    this.isCrownActive = true;
    this.crownTimer = 0;

    // Spawn realistic micro-droplets in an upward splashing cone
    for (let i = 0; i < this.maxDroplets; i++) {
      const angle = (i / this.maxDroplets) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speedOut = 0.8 + Math.random() * 1.5;
      const speedUp = 1.4 + Math.random() * 2.2;

      this.droplets.push({
        position: position.clone().add(new THREE.Vector3(
          Math.cos(angle) * 0.08,
          0.02,
          Math.sin(angle) * 0.08
        )),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speedOut,
          speedUp,
          Math.sin(angle) * speedOut
        ),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        scale: 0.5 + Math.random() * 0.8,
      });
    }
  }

  public update(delta: number) {
    if (delta <= 0) return;

    // Animate subtle crown
    if (this.isCrownActive) {
      this.crownTimer += delta;
      const t = this.crownTimer / 0.32;
      if (t >= 1.0) {
        this.isCrownActive = false;
        this.crownMesh.visible = false;
      } else {
        const expand = 0.2 + t * 0.9;
        this.crownMesh.scale.set(expand, 0.4 * (1.0 - t), expand);
        this.crownMaterial.opacity = 0.65 * (1.0 - t);
      }
    }

    // Animate ballistic micro-droplets
    for (let i = 0; i < this.maxDroplets; i++) {
      const d = this.droplets[i];
      if (d && d.life < d.maxLife) {
        d.life += delta;
        d.velocity.y -= 9.81 * delta; // Gravity
        d.velocity.x *= Math.exp(-1.8 * delta); // Air drag
        d.velocity.z *= Math.exp(-1.8 * delta);
        d.position.addScaledVector(d.velocity, delta);

        const fade = 1.0 - d.life / d.maxLife;
        const currentScale = d.scale * fade;

        this.dummy.position.copy(d.position);
        this.dummy.scale.set(currentScale, currentScale, currentScale);
        this.dummy.updateMatrix();
        this.dropletMesh.setMatrixAt(i, this.dummy.matrix);
      } else {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.dropletMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.dropletMesh.instanceMatrix.needsUpdate = true;
  }

  public destroy() {
    this.dropletMesh.geometry.dispose();
    (this.dropletMesh.material as THREE.Material).dispose();
    this.crownMesh.geometry.dispose();
    this.crownMaterial.dispose();
  }
}
