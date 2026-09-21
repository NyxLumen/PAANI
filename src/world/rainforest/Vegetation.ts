import * as THREE from 'three';
import { foliageVertexShader, foliageFragmentShader } from '../../shaders/rainforest/foliage';
import { RainforestTerrain } from './Terrain';
import { QualityTier } from '../../core/QualityManager';

export class RainforestVegetation {
  public group: THREE.Group;

  // Foliage materials
  public foliageMaterial: THREE.ShaderMaterial;
  public trunkMaterial: THREE.MeshStandardMaterial;

  // Meshes
  private treesGroup: THREE.Group;
  private broadleafInstanced: THREE.InstancedMesh;
  private fernInstanced: THREE.InstancedMesh;
  private sporeParticles: THREE.Points;
  public heroLeafMesh: THREE.Mesh; // The specific hero leaf the droplet lands on

  constructor(sunDirection: THREE.Vector3) {
    this.group = new THREE.Group();

    // 1. Foliage Custom GLSL Shader Material
    this.foliageMaterial = new THREE.ShaderMaterial({
      vertexShader: foliageVertexShader,
      fragmentShader: foliageFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3() },
        uTransitionWeight: { value: 1.0 },
        uWetness: { value: 0.9 },
        uWindStrength: { value: 1.0 },
        uLeafColorBase: { value: new THREE.Color(0x194d1a) }, // Deep jungle green
        uLeafColorTranslucent: { value: new THREE.Color(0x6be028) }, // Radiant backlit lime-emerald
      },
      defines: {
        USE_INSTANCING: '',
      },
    });

    // 2. Wet Bark Trunk Material
    this.trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a4332,
      roughness: 0.82,
      metalness: 0.04,
      emissive: new THREE.Color(0x1a2618), // subtle warm mossy bark bounce
    });

    // 3. Build Macro Canopy Trees
    this.treesGroup = new THREE.Group();
    this.buildTrees();
    this.group.add(this.treesGroup);

    // 4. Build Meso Tropical Broadleaves (Monstera / Elephant Ear)
    const broadleafGeo = this.createBroadleafGeometry();
    const broadleafCount = 140;
    this.broadleafInstanced = new THREE.InstancedMesh(broadleafGeo, this.foliageMaterial, broadleafCount);
    this.populateBroadleaves(broadleafCount);
    this.group.add(this.broadleafInstanced);

    // 5. Build Meso Tree Ferns
    const fernFrondGeo = this.createFernFrondGeometry();
    const fernCount = 180;
    this.fernInstanced = new THREE.InstancedMesh(fernFrondGeo, this.foliageMaterial, fernCount);
    this.populateFerns(fernCount);
    this.group.add(this.fernInstanced);

    // 6. Build The Specific Hero Leaf
    // Custom non-instanced mesh for close-up drop interaction
    const heroLeafMat = this.foliageMaterial.clone();
    delete (heroLeafMat as any).defines.USE_INSTANCING;
    this.heroLeafMesh = new THREE.Mesh(this.createHeroLeafGeometry(), heroLeafMat);
    // Positioned gracefully arching over the depression puddle at (0, 2.2, 4.2)
    this.heroLeafMesh.position.set(0.0, 2.15, 3.8);
    this.heroLeafMesh.rotation.set(0.18, -0.22, -0.12);
    this.heroLeafMesh.scale.set(1.8, 1.8, 1.8);
    this.heroLeafMesh.castShadow = true;
    this.heroLeafMesh.receiveShadow = true;
    this.group.add(this.heroLeafMesh);

    // 7. Micro Spore / Humid Motes System
    this.sporeParticles = this.createSporeSystem();
    this.group.add(this.sporeParticles);
  }

  /**
   * Evaluates the precise world-space position along the Hero Leaf's central spine.
   * progress: 0.0 (stem base) to 1.0 (tapered leaf tip).
   */
  public getHeroLeafSpinePoint(progress: number, offsetNormal: number = 0.26): THREE.Vector3 {
    this.heroLeafMesh.updateMatrixWorld(true);
    const p = Math.max(0.0, Math.min(progress, 1.0));
    const localY = p * 3.0;
    const localZ = -Math.pow(p, 2.2) * 0.85;

    // Surface normal perpendicular to the curved spine
    const slope = -2.2 * Math.pow(Math.max(p, 0.001), 1.2) * 0.85 / 3.0;
    const localNormal = new THREE.Vector3(0, -slope, 1.0).normalize();

    const localPos = new THREE.Vector3(0, localY, localZ).add(localNormal.multiplyScalar(offsetNormal));
    return this.heroLeafMesh.localToWorld(localPos);
  }

  /**
   * Procedural curved broadleaf geometry with natural central spine dip and tapering tip.
   */
  private createBroadleafGeometry(): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(1.4, 2.6, 12, 16);
    // Center base at origin and extend forward/upward
    geo.translate(0, 1.3, 0);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      const progress = Math.max(0.0, Math.min(y / 2.6, 1.0));
      const distFromSpine = Math.abs(x);

      // Width tapering: bulbous in middle, narrow at stem and acute tip
      const widthProfile = Math.sin(progress * Math.PI) * (1.0 - progress * 0.3);
      x *= widthProfile;

      // Natural gravitational arching curve (hangs down towards tip)
      z = -Math.pow(progress, 2.0) * 0.75;

      // Spine channel: leaf cups upward at the sides, dipping along the spine
      z += distFromSpine * distFromSpine * 0.45;

      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Dedicated high-tessellation Hero Leaf geometry for close-up camera inspection and drop roll physics.
   */
  private createHeroLeafGeometry(): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(1.2, 3.0, 24, 36);
    geo.translate(0, 1.5, 0);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      const p = Math.max(0.0, Math.min(y / 3.0, 1.0));
      const spineDist = Math.abs(x);

      // Width contour: broad tropical spade shape
      const widthShape = Math.sin(Math.pow(p, 0.7) * Math.PI) * 1.15;
      x *= widthShape;

      // Elegant downward drooping curvature towards the tip
      z = -Math.pow(p, 2.2) * 0.85;

      // Distinct spine gutter where water droplet collects and slides
      z += spineDist * 0.35;

      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Feathery tropical fern frond geometry.
   */
  private createFernFrondGeometry(): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(0.8, 3.2, 8, 20);
    geo.translate(0, 1.6, 0);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      const p = Math.max(0.0, Math.min(y / 3.2, 1.0));
      const width = Math.sin(p * Math.PI * 0.85) * (1.0 - p * 0.4);
      x *= width;

      // Arching arch-of-circles
      z = -Math.pow(p, 1.8) * 1.1;

      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Creates large rainforest trees with buttress roots and towering canopy.
   */
  private buildTrees() {
    // Tree positions distributed organically around the forest clearing
    const treePositions = [
      { x: -14, z: -10, scale: 1.5, h: 26 },
      { x: 16, z: -8, scale: 1.7, h: 28 },
      { x: -19, z: 14, scale: 1.4, h: 22 },
      { x: 15, z: 18, scale: 1.6, h: 25 },
      { x: -7, z: -24, scale: 1.9, h: 30 },
      { x: 9, z: -27, scale: 1.8, h: 28 },
      { x: 26, z: 4, scale: 1.6, h: 24 },
      { x: -28, z: -2, scale: 1.7, h: 26 },
    ];

    const trunkGeo = new THREE.CylinderGeometry(0.45, 1.4, 24, 12, 16);
    trunkGeo.translate(0, 12, 0);

    // Buttress root flared base
    const pos = trunkGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 5.0) {
        const flare = (1.0 - y / 5.0);
        pos.setX(i, pos.getX(i) * (1.0 + flare * 2.2));
        pos.setZ(i, pos.getZ(i) * (1.0 + flare * 2.2));
      }
    }
    trunkGeo.computeVertexNormals();

    const canopyFoliageGeo = new THREE.SphereGeometry(7.5, 14, 12);
    canopyFoliageGeo.scale(1.5, 0.65, 1.5);

    const canopyMat = this.foliageMaterial.clone();
    delete (canopyMat as any).defines.USE_INSTANCING;

    treePositions.forEach((tp) => {
      const groundY = RainforestTerrain.sampleHeight(tp.x, tp.z);
      const treeGroup = new THREE.Group();
      treeGroup.position.set(tp.x, groundY, tp.z);
      treeGroup.scale.set(tp.scale, (tp.h / 24) * tp.scale, tp.scale);

      // Trunk mesh
      const trunkMesh = new THREE.Mesh(trunkGeo, this.trunkMaterial);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      treeGroup.add(trunkMesh);

      // Layered canopy foliage clusters
      const canopyClump1 = new THREE.Mesh(canopyFoliageGeo, canopyMat);
      canopyClump1.position.set(0, tp.h - 2.5, 0);
      treeGroup.add(canopyClump1);

      const canopyClump2 = new THREE.Mesh(canopyFoliageGeo, canopyMat);
      canopyClump2.position.set(4.2, tp.h - 5.5, -2.5);
      canopyClump2.scale.set(0.8, 0.75, 0.8);
      treeGroup.add(canopyClump2);

      const canopyClump3 = new THREE.Mesh(canopyFoliageGeo, canopyMat);
      canopyClump3.position.set(-3.8, tp.h - 6.0, 3.2);
      canopyClump3.scale.set(0.75, 0.7, 0.75);
      treeGroup.add(canopyClump3);

      this.treesGroup.add(treeGroup);
    });
  }

  /**
   * Distributes broadleaf plants across the terrain floor using InstancedMesh.
   */
  private populateBroadleaves(count: number) {
    const dummy = new THREE.Object3D();
    const rng = (min: number, max: number) => min + Math.random() * (max - min);

    let idx = 0;
    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;

      // Keep clear corridor for hero leaf and camera framing
      do {
        const angle = Math.random() * Math.PI * 2;
        const radius = rng(2.8, 48.0);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius + 5.0;
      } while (Math.abs(x) < 2.4 && z > 2.0 && z < 7.2);

      const y = RainforestTerrain.sampleHeight(x, z);

      dummy.position.set(x, y + 0.1, z);
      const rotY = rng(0, Math.PI * 2);
      const rotX = rng(0.1, 0.55);
      const rotZ = rng(-0.25, 0.25);
      dummy.rotation.set(rotX, rotY, rotZ);

      const s = rng(0.7, 2.0);
      dummy.scale.set(s, s, s);

      dummy.updateMatrix();
      this.broadleafInstanced.setMatrixAt(idx++, dummy.matrix);
    }
    this.broadleafInstanced.instanceMatrix.needsUpdate = true;
  }

  /**
   * Distributes arching ferns across understory mounds.
   */
  private populateFerns(count: number) {
    const dummy = new THREE.Object3D();
    const rng = (min: number, max: number) => min + Math.random() * (max - min);

    // Group ferns into radial clusters (rosettes)
    const clusterCenters = [
      { x: -4, z: 2 }, { x: 3.5, z: 6 }, { x: -7, z: 9 },
      { x: 6, z: -1 }, { x: -2, z: 12 }, { x: 9, z: 8 },
      { x: -11, z: -3 }, { x: 12, z: -8 }, { x: -14, z: 6 },
    ];

    let idx = 0;
    const frondsPerCluster = Math.floor(count / clusterCenters.length);

    clusterCenters.forEach((cc) => {
      const baseY = RainforestTerrain.sampleHeight(cc.x, cc.z);
      for (let f = 0; f < frondsPerCluster && idx < count; f++) {
        const frondAngle = (f / frondsPerCluster) * Math.PI * 2 + rng(-0.2, 0.2);
        const frondRadius = rng(0.2, 0.6);
        const fx = cc.x + Math.cos(frondAngle) * frondRadius;
        const fz = cc.z + Math.sin(frondAngle) * frondRadius;

        dummy.position.set(fx, baseY, fz);
        // Fronds point radially outward with arching droop
        dummy.rotation.set(rng(0.3, 0.7), -frondAngle + Math.PI / 2, rng(-0.15, 0.15));

        const s = rng(0.8, 1.6);
        dummy.scale.set(s, s, s);

        dummy.updateMatrix();
        this.fernInstanced.setMatrixAt(idx++, dummy.matrix);
      }
    });

    this.fernInstanced.instanceMatrix.needsUpdate = true;
  }

  /**
   * Micro-atmosphere: Golden-emerald spore and humidity motes drifting in the canopy air.
   */
  private createSporeSystem(): THREE.Points {
    const count = 350;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = 0.5 + Math.random() * 12.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40 + 4.0;
      scales[i] = 0.5 + Math.random() * 1.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

    const mat = new THREE.PointsMaterial({
      color: 0x88f572,
      size: 0.08,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Points(geo, mat);
  }

  public update(time: number, delta: number, cameraPos: THREE.Vector3) {
    this.foliageMaterial.uniforms.uTime.value = time;
    this.foliageMaterial.uniforms.uCameraPosition.value.copy(cameraPos);

    // Update hero leaf material uniforms
    const heroMat = this.heroLeafMesh.material as THREE.ShaderMaterial;
    if (heroMat.uniforms) {
      heroMat.uniforms.uTime.value = time;
      heroMat.uniforms.uCameraPosition.value.copy(cameraPos);
    }

    // Drift spore motes gently in warm thermal currents
    const posAttr = this.sporeParticles.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      let y = posAttr.getY(i) + Math.sin(time * 0.8 + i) * delta * 0.15;
      let x = posAttr.getX(i) + Math.cos(time * 0.5 + i * 0.3) * delta * 0.08;
      posAttr.setXY(i, x, y);
    }
    posAttr.needsUpdate = true;
  }

  public setTransitionWeight(weight: number) {
    this.foliageMaterial.uniforms.uTransitionWeight.value = weight;
    const heroMat = this.heroLeafMesh.material as THREE.ShaderMaterial;
    if (heroMat.uniforms) {
      heroMat.uniforms.uTransitionWeight.value = weight;
    }
    this.group.visible = weight > 0.001;
  }

  public setQualityTier(tier: QualityTier) {
    if (tier === 'LOW') {
      this.broadleafInstanced.count = 70;
      this.fernInstanced.count = 90;
      this.sporeParticles.visible = false;
    } else if (tier === 'MEDIUM') {
      this.broadleafInstanced.count = 100;
      this.fernInstanced.count = 130;
      this.sporeParticles.visible = true;
    } else {
      this.broadleafInstanced.count = 140;
      this.fernInstanced.count = 180;
      this.sporeParticles.visible = true;
    }
  }

  public destroy() {
    this.foliageMaterial.dispose();
    this.trunkMaterial.dispose();
    this.broadleafInstanced.geometry.dispose();
    this.fernInstanced.geometry.dispose();
    this.heroLeafMesh.geometry.dispose();
    this.sporeParticles.geometry.dispose();
    (this.sporeParticles.material as THREE.Material).dispose();
  }
}
