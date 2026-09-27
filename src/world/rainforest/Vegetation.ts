import * as THREE from 'three';
import { foliageVertexShader, foliageFragmentShader } from '../../shaders/rainforest/foliage';
import { RainforestTerrain } from './Terrain';
import { QualityTier } from '../../core/QualityManager';

export class RainforestVegetation {
  public group: THREE.Group;

  // Foliage materials representing physical scene geometry
  public foliageMaterial: THREE.ShaderMaterial;
  public heroLeafMaterial: THREE.ShaderMaterial;
  public canopyMaterial: THREE.ShaderMaterial;
  public trunkMaterial: THREE.MeshStandardMaterial;

  private isTransitioning: boolean = false;

  // Meshes
  private treesGroup: THREE.Group;
  private treeGeometries: THREE.BufferGeometry[] = [];
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
      transparent: false,
      depthWrite: true,
      depthTest: true,
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
      color: 0x4a3728,
      roughness: 0.85,
      metalness: 0.04,
      emissive: new THREE.Color(0x142012), // subtle warm mossy bark bounce
      transparent: false,
      depthWrite: true,
      depthTest: true,
      opacity: 1.0,
    });

    // 3. Tree Canopy Clump Material
    this.canopyMaterial = this.foliageMaterial.clone();
    delete (this.canopyMaterial as any).defines.USE_INSTANCING;

    // 4. Build Macro Canopy Trees
    this.treesGroup = new THREE.Group();
    this.buildTrees();
    this.group.add(this.treesGroup);

    // 4. Build Meso Tropical Broadleaves (Monstera / Elephant Ear)
    const broadleafGeo = this.createBroadleafGeometry();
    const broadleafCount = 200;
    this.broadleafInstanced = new THREE.InstancedMesh(broadleafGeo, this.foliageMaterial, broadleafCount);
    this.populateBroadleaves(broadleafCount);
    this.group.add(this.broadleafInstanced);

    // 5. Build Meso Tree Ferns
    const fernFrondGeo = this.createFernFrondGeometry();
    const fernCount = 240;
    this.fernInstanced = new THREE.InstancedMesh(fernFrondGeo, this.foliageMaterial, fernCount);
    this.populateFerns(fernCount);
    this.group.add(this.fernInstanced);

    // 6. Build The Specific Hero Leaf
    // Custom non-instanced mesh for close-up drop interaction
    this.heroLeafMaterial = this.foliageMaterial.clone();
    delete (this.heroLeafMaterial as any).defines.USE_INSTANCING;
    this.heroLeafMesh = new THREE.Mesh(this.createHeroLeafGeometry(), this.heroLeafMaterial);
    // Positioned gracefully arching forward and downward over the depression puddle
    this.heroLeafMesh.position.set(0.0, 4.35, 1.8);
    this.heroLeafMesh.rotation.set(0.10, 0.0, 0.0);
    this.heroLeafMesh.scale.set(1.15, 1.15, 1.15);
    this.heroLeafMesh.castShadow = true;
    this.heroLeafMesh.receiveShadow = true;
    this.group.add(this.heroLeafMesh);

    // 7. Micro Spore / Humid Motes System
    this.sporeParticles = this.createSporeSystem();
    this.group.add(this.sporeParticles);
  }

  /**
   * Evaluates the precise world-space position and normal along the Hero Leaf's central spine.
   * progress: 0.0 (stem base) to 1.0 (tapered leaf tip).
   */
  public getHeroLeafSpinePoint(progress: number, offsetNormal: number = 0.35): THREE.Vector3 {
    this.heroLeafMesh.updateMatrixWorld(true);
    const p = Math.max(0.0, Math.min(progress, 1.0));
    const length = 3.2;
    const localZ = p * length;
    let localY = -Math.pow(p, 2.1) * 0.85;
    let slope = -2.1 * Math.pow(Math.max(p, 0.001), 1.1) * 0.85 / length;

    if (p > 0.80) {
      const tipT = Math.max(0.0, Math.min(1.0, (p - 0.80) / 0.20));
      localY -= Math.pow(tipT, 2.0) * 0.25;
      slope -= (2.0 * tipT * 0.25) / (0.20 * length);
    }

    const localNormal = new THREE.Vector3(0, 1.0, -slope).normalize();
    const localPos = new THREE.Vector3(0, localY, localZ).add(localNormal.clone().multiplyScalar(offsetNormal));
    return this.heroLeafMesh.localToWorld(localPos);
  }

  public getHeroLeafSpineNormal(progress: number): THREE.Vector3 {
    this.heroLeafMesh.updateMatrixWorld(true);
    const p = Math.max(0.0, Math.min(progress, 1.0));
    const length = 3.2;
    let slope = -2.1 * Math.pow(Math.max(p, 0.001), 1.1) * 0.85 / length;
    if (p > 0.80) {
      const tipT = Math.max(0.0, Math.min(1.0, (p - 0.80) / 0.20));
      slope -= (2.0 * tipT * 0.25) / (0.20 * length);
    }
    const localNormal = new THREE.Vector3(0, 1.0, -slope).normalize();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.heroLeafMesh.matrixWorld);
    return localNormal.applyMatrix3(normalMatrix).normalize();
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
   * Constructed with length along +Z, droop along -Y, gutter concave UP, and normal facing skyward (+Y).
   */
  private createHeroLeafGeometry(): THREE.BufferGeometry {
    const widthSegs = 48;
    const lengthSegs = 64;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const length = 3.2;
    const baseWidth = 1.6;

    for (let j = 0; j <= lengthSegs; j++) {
      const p = j / lengthSegs;
      const z = p * length;

      // Width contour: broad tropical spade shape tapering to acute drip tip
      let w = Math.sin(Math.pow(p, 0.65) * Math.PI) * (baseWidth * 0.5);
      if (p > 0.80) {
        const tipT = Math.max(0.0, Math.min(1.0, (p - 0.80) / 0.20));
        w *= Math.max(0.04, Math.pow(Math.max(0.0, 1.0 - tipT), 0.85));
      }

      // Downward drooping curvature along spine (Y is up/down)
      let ySpine = -Math.pow(p, 2.1) * 0.85;
      if (p > 0.80) {
        const tipT = Math.max(0.0, Math.min(1.0, (p - 0.80) / 0.20));
        ySpine -= Math.pow(tipT, 2.0) * 0.25;
      }

      for (let i = 0; i <= widthSegs; i++) {
        const u = i / widthSegs;
        const xNorm = (u - 0.5) * 2.0; // -1 to +1
        const x = xNorm * w;

        // Concave central gutter: edges curl upward (+Y)
        const gutter = Math.pow(Math.abs(xNorm), 1.8) * 0.22 * (1.0 - p * 0.4);

        // Undulating lateral ribs radiating from the midrib
        const rib = Math.sin(p * 24.0 + Math.abs(xNorm) * 6.0) * 0.012 * (1.0 - p);

        const y = ySpine + gutter + rib;

        vertices.push(x, y, z);
        uvs.push(u, p);
      }
    }

    const stride = widthSegs + 1;
    for (let j = 0; j < lengthSegs; j++) {
      for (let i = 0; i < widthSegs; i++) {
        const a = j * stride + i;
        const b = (j + 1) * stride + i;
        const c = (j + 1) * stride + (i + 1);
        const d = j * stride + (i + 1);
        // Order 1 ensures front face normal points UP (+Y)
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.treeGeometries.push(geo);
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
   * Procedural trunk geometry with fluted buttress roots and natural curvature.
   */
  private createTreeTrunkGeometry(height: number): THREE.BufferGeometry {
    const radialSegs = 20;
    const heightSegs = 32;
    const totalH = height + 6.0;

    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= heightSegs; j++) {
      const v = j / heightSegs;
      const y = -6.0 + v * totalH;
      const t = v;

      // Natural organic curvature/lean
      const cx = Math.sin(t * Math.PI * 0.85) * 0.9 * t;
      const cz = Math.cos(t * Math.PI * 0.75) * 0.7 * t;

      // Base radius tapers upward
      const baseR = 1.45 * (1.0 - t * 0.72) + 0.35;

      for (let i = 0; i <= radialSegs; i++) {
        const u = i / radialSegs;
        const angle = u * Math.PI * 2;

        let r = baseR;
        if (y < 6.0) {
          const flare = Math.max(0.0, (6.0 - y) / 12.0);
          const fluting = Math.pow(Math.cos(angle * 2.5), 2.0) * 1.8 + 0.3;
          r += flare * fluting * 2.2;
        }
        r += Math.sin(angle * 6.0 + y * 0.8) * 0.04 * (1.0 - t * 0.5);

        vertices.push(cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r);
        uvs.push(u, v * (totalH / 4.0));
      }
    }

    const ringStride = radialSegs + 1;
    for (let j = 0; j < heightSegs; j++) {
      for (let i = 0; i < radialSegs; i++) {
        const a = j * ringStride + i;
        const b = (j + 1) * ringStride + i;
        const c = (j + 1) * ringStride + (i + 1);
        const d = j * ringStride + (i + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.treeGeometries.push(geo);
    return geo;
  }

  /**
   * Procedural branching limb geometry.
   */
  private createBranchGeometry(length: number, baseR: number, tipR: number): THREE.BufferGeometry {
    const radialSegs = 10;
    const heightSegs = 12;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= heightSegs; j++) {
      const t = j / heightSegs;
      const y = t * length;
      const x = Math.sin(t * Math.PI * 0.4) * (length * 0.35);
      const z = Math.pow(t, 1.4) * (length * 0.18);
      const r = THREE.MathUtils.lerp(baseR, tipR, t);

      for (let i = 0; i <= radialSegs; i++) {
        const u = i / radialSegs;
        const angle = u * Math.PI * 2;
        vertices.push(x + Math.cos(angle) * r, y, z + Math.sin(angle) * r);
        uvs.push(u, t);
      }
    }

    const stride = radialSegs + 1;
    for (let j = 0; j < heightSegs; j++) {
      for (let i = 0; i < radialSegs; i++) {
        const a = j * stride + i;
        const b = (j + 1) * stride + i;
        const c = (j + 1) * stride + (i + 1);
        const d = j * stride + (i + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.treeGeometries.push(geo);
    return geo;
  }

  /**
   * Procedural winding liana / vine tendril geometry.
   */
  private createLianaGeometry(length: number): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const numPoints = 16;
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const y = -t * length;
      const angle = t * Math.PI * 4.5;
      const x = Math.sin(angle) * 0.25 * Math.sin(t * Math.PI);
      const z = Math.cos(angle) * 0.25 * Math.sin(t * Math.PI);
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 20, 0.045, 6, false);
    this.treeGeometries.push(geo);
    return geo;
  }

  /**
   * Layered umbrella foliage crown with organic ruffled margin.
   */
  private createUmbrellaCanopyGeometry(radius: number, thickness: number): THREE.BufferGeometry {
    const geo = new THREE.SphereGeometry(radius, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
    geo.scale(1.25, thickness / radius, 1.25);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const angle = Math.atan2(z, x);
      const r = Math.sqrt(x * x + z * z);
      const edgeFactor = Math.pow(r / (radius * 1.25), 2.0);
      const ripple = (Math.sin(angle * 6.0) * 0.12 + Math.cos(angle * 10.0) * 0.08) * edgeFactor;
      x *= (1.0 + ripple);
      z *= (1.0 + ripple);
      y -= ripple * 0.5;
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    this.treeGeometries.push(geo);
    return geo;
  }

  /**
   * Creates large emergent rainforest trees with buttress roots, branches, hanging lianas, and towering umbrella crowns.
   */
  private buildTrees() {
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

    treePositions.forEach((tp, treeIdx) => {
      const groundY = RainforestTerrain.sampleHeight(tp.x, tp.z);
      const treeGroup = new THREE.Group();
      treeGroup.position.set(tp.x, groundY, tp.z);
      treeGroup.scale.set(tp.scale, (tp.h / 24) * tp.scale, tp.scale);

      // 1. Procedural fluted trunk
      const trunkGeo = this.createTreeTrunkGeometry(tp.h);
      const trunkMesh = new THREE.Mesh(trunkGeo, this.trunkMaterial);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      treeGroup.add(trunkMesh);

      // 2. Branch limbs arching outward
      const branchCount = 3;
      const forkHeight = tp.h * 0.68;
      for (let b = 0; b < branchCount; b++) {
        const branchAngle = (b / branchCount) * Math.PI * 2 + treeIdx * 0.7;
        const branchLen = 6.5 + (b % 2) * 1.5;
        const branchGeo = this.createBranchGeometry(branchLen, 0.42, 0.18);
        const branchMesh = new THREE.Mesh(branchGeo, this.trunkMaterial);
        branchMesh.position.set(0, forkHeight, 0);
        branchMesh.rotation.set(0.65, branchAngle, 0.35);
        branchMesh.castShadow = true;
        branchMesh.receiveShadow = true;
        treeGroup.add(branchMesh);

        // 3. Hanging Liana Vines dangling from branch forks
        const lianaLen = 12.0 + (b % 3) * 3.0;
        const lianaGeo = this.createLianaGeometry(lianaLen);
        const lianaMesh = new THREE.Mesh(lianaGeo, this.trunkMaterial);
        const attachX = Math.sin(branchAngle) * 3.2;
        const attachZ = Math.cos(branchAngle) * 3.2;
        lianaMesh.position.set(attachX, forkHeight + 1.2, attachZ);
        lianaMesh.castShadow = true;
        treeGroup.add(lianaMesh);

        // 4. Canopy clump at branch tip
        const branchCanopyGeo = this.createUmbrellaCanopyGeometry(5.2, 2.6);
        const branchCanopyMesh = new THREE.Mesh(branchCanopyGeo, this.canopyMaterial);
        const tipX = Math.sin(branchAngle) * (branchLen * 0.85);
        const tipZ = Math.cos(branchAngle) * (branchLen * 0.85);
        branchCanopyMesh.position.set(tipX, forkHeight + branchLen * 0.6, tipZ);
        branchCanopyMesh.castShadow = true;
        branchCanopyMesh.receiveShadow = true;
        treeGroup.add(branchCanopyMesh);
      }

      // 5. Central towering umbrella crown
      const topCanopyGeo = this.createUmbrellaCanopyGeometry(7.2, 3.4);
      const topCanopyMesh = new THREE.Mesh(topCanopyGeo, this.canopyMaterial);
      topCanopyMesh.position.set(0, tp.h - 1.2, 0);
      topCanopyMesh.castShadow = true;
      topCanopyMesh.receiveShadow = true;
      treeGroup.add(topCanopyMesh);

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
      } while (Math.abs(x) < 3.2 && z > 0.5 && z < 7.8);

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

    // Smooth circular alpha disc texture to prevent square billboard rendering
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.3, 'rgba(210, 255, 190, 0.85)');
      grad.addColorStop(0.65, 'rgba(120, 240, 95, 0.35)');
      grad.addColorStop(1.0, 'rgba(80, 200, 60, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      map: texture,
      color: 0x98f882,
      size: 0.12,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Points(geo, mat);
  }

  public update(time: number, delta: number, cameraPos: THREE.Vector3) {
    this.foliageMaterial.uniforms.uTime.value = time;
    this.foliageMaterial.uniforms.uCameraPosition.value.copy(cameraPos);

    if (this.heroLeafMaterial.uniforms) {
      this.heroLeafMaterial.uniforms.uTime.value = time;
      this.heroLeafMaterial.uniforms.uCameraPosition.value.copy(cameraPos);
    }

    if (this.canopyMaterial && this.canopyMaterial.uniforms) {
      this.canopyMaterial.uniforms.uTime.value = time;
      this.canopyMaterial.uniforms.uCameraPosition.value.copy(cameraPos);
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
    if (this.heroLeafMaterial.uniforms) {
      this.heroLeafMaterial.uniforms.uTransitionWeight.value = weight;
    }
    if (this.canopyMaterial && this.canopyMaterial.uniforms) {
      this.canopyMaterial.uniforms.uTransitionWeight.value = weight;
    }
    this.trunkMaterial.opacity = weight;
    this.group.visible = weight > 0.001;

    // Physical scene geometry is opaque by default (fully established or inactive).
    // It is temporarily set transparent (with depthWrite: false) strictly during the crossfade interval.
    const isTransitioning = weight > 0.001 && weight < 0.999;
    if (this.isTransitioning !== isTransitioning) {
      this.isTransitioning = isTransitioning;
      const targetTransparent = isTransitioning;
      const targetDepthWrite = !isTransitioning;

      this.applyPhysicalMaterialState(this.foliageMaterial, targetTransparent, targetDepthWrite);
      this.applyPhysicalMaterialState(this.heroLeafMaterial, targetTransparent, targetDepthWrite);
      if (this.canopyMaterial) {
        this.applyPhysicalMaterialState(this.canopyMaterial, targetTransparent, targetDepthWrite);
      }
      this.applyPhysicalMaterialState(this.trunkMaterial, targetTransparent, targetDepthWrite);
    }
  }

  private applyPhysicalMaterialState(mat: THREE.Material, transparent: boolean, depthWrite: boolean) {
    mat.transparent = transparent;
    mat.depthWrite = depthWrite;
    mat.depthTest = true;
    mat.needsUpdate = true;
  }

  public setQualityTier(tier: QualityTier) {
    if (tier === 'LOW') {
      this.broadleafInstanced.count = 80;
      this.fernInstanced.count = 100;
      this.sporeParticles.visible = false;
    } else if (tier === 'MEDIUM') {
      this.broadleafInstanced.count = 130;
      this.fernInstanced.count = 160;
      this.sporeParticles.visible = true;
    } else if (tier === 'HIGH') {
      this.broadleafInstanced.count = 160;
      this.fernInstanced.count = 200;
      this.sporeParticles.visible = true;
    } else {
      // ULTRA
      this.broadleafInstanced.count = 200;
      this.fernInstanced.count = 240;
      this.sporeParticles.visible = true;
    }
  }

  public destroy() {
    this.foliageMaterial.dispose();
    this.heroLeafMaterial.dispose();
    if (this.canopyMaterial) {
      this.canopyMaterial.dispose();
    }
    this.trunkMaterial.dispose();
    this.broadleafInstanced.geometry.dispose();
    this.fernInstanced.geometry.dispose();
    this.heroLeafMesh.geometry.dispose();
    this.sporeParticles.geometry.dispose();
    (this.sporeParticles.material as THREE.Material).dispose();
    for (const geo of this.treeGeometries) {
      geo.dispose();
    }
    this.treeGeometries = [];
  }
}
