import * as THREE from 'three';
import { foliageVertexShader, foliageFragmentShader } from '../../shaders/rainforest/foliage';
import { barkVertexShader, barkFragmentShader } from '../../shaders/rainforest/bark';
import { RainforestTerrain } from './Terrain';
import { QualityTier } from '../../core/QualityManager';

/**
 * Deterministic pseudo-random number generator (Mulberry32)
 * Ensures 100% reproducible procedural trees across all clients and runs without Math.random().
 */
class SeededPRNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed | 0;
  }

  public next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

interface TrunkData {
  geo: THREE.BufferGeometry;
  finAngles: number[];
  baseRadius: number;
  topRadius: number;
  leanDir: number;
  leanAmp: number;
  curveFreq: number;
  sCurveAmp: number;
}

export class RainforestVegetation {
  public group: THREE.Group;

  // Foliage materials representing physical scene geometry
  public foliageMaterial: THREE.ShaderMaterial;
  public heroLeafMaterial: THREE.ShaderMaterial;
  public canopyMaterial: THREE.ShaderMaterial;
  public trunkMaterial: THREE.ShaderMaterial;

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

    // 2. Procedural Wet Bark Trunk Material
    this.trunkMaterial = new THREE.ShaderMaterial({
      vertexShader: barkVertexShader,
      fragmentShader: barkFragmentShader,
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
      },
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
   * Procedural trunk geometry with fluted buttress roots, organic curvature, and per-tree variation.
   */
  private createTreeTrunkGeometry(height: number, rng: SeededPRNG): TrunkData {
    const radialSegs = 28;
    const heightSegs = 36;
    const totalH = height + 3.5;

    const leanDir = rng.range(0, Math.PI * 2);
    const leanAmp = rng.range(0.65, 1.4);
    const curveFreq = rng.range(0.75, 1.15);
    const sCurveAmp = rng.range(-0.35, 0.35);
    const baseRadius = rng.range(1.4, 1.7);
    const topRadius = rng.range(0.52, 0.70);

    const buttressCount = rng.int(4, 6);
    const finAngles: number[] = [];
    const finHeights: number[] = [];
    const finFlares: number[] = [];
    const finWidths: number[] = [];

    for (let k = 0; k < buttressCount; k++) {
      const baseAngle = (k / buttressCount) * Math.PI * 2;
      finAngles.push(baseAngle + rng.range(-0.22, 0.22));
      finHeights.push(rng.range(5.5, 9.0));
      finFlares.push(rng.range(2.4, 3.8));
      finWidths.push(rng.range(0.35, 0.52));
    }

    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= heightSegs; j++) {
      const v = j / heightSegs;
      const y = -3.5 + v * totalH;
      const t = v;

      // Natural organic curvature & lean
      const cx = (Math.sin(t * Math.PI * curveFreq) * leanAmp + Math.sin(t * Math.PI * 2.0) * sCurveAmp) * Math.cos(leanDir) * t;
      const cz = (Math.sin(t * Math.PI * curveFreq) * leanAmp + Math.sin(t * Math.PI * 2.0) * sCurveAmp) * Math.sin(leanDir) * t;

      // Tapered cylindrical base radius
      const rBase = THREE.MathUtils.lerp(baseRadius, topRadius, Math.pow(t, 0.85));

      for (let i = 0; i <= radialSegs; i++) {
        const u = i / radialSegs;
        const angle = u * Math.PI * 2;

        let buttressOffset = 0;
        for (let k = 0; k < buttressCount; k++) {
          if (y < finHeights[k]) {
            const flareProg = Math.max(0.0, (finHeights[k] - y) / (finHeights[k] + 3.5));
            let dAngle = Math.abs(angle - finAngles[k]);
            if (dAngle > Math.PI) dAngle = Math.PI * 2 - dAngle;
            const finHalfWidth = finWidths[k];
            if (dAngle < finHalfWidth) {
              const angleWeight = Math.cos((dAngle / finHalfWidth) * (Math.PI * 0.5));
              buttressOffset += Math.pow(flareProg, 1.35) * finFlares[k] * Math.pow(angleWeight, 2.4);
            }
          }
        }

        const fluting = Math.sin(angle * 6.0 + y * 0.65) * 0.05 * (1.0 - t * 0.6);
        const r = rBase + buttressOffset + fluting;

        vertices.push(cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r);
        uvs.push(u, (y + 3.5) / 4.0);
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

    return {
      geo,
      finAngles,
      baseRadius,
      topRadius,
      leanDir,
      leanAmp,
      curveFreq,
      sCurveAmp,
    };
  }

  /**
   * Surface root extending outward from buttress flare, clinging to the terrain contours.
   */
  private createSurfaceRootGeometry(
    treeX: number,
    treeZ: number,
    treeGroundY: number,
    treeScale: number,
    finAngle: number,
    length: number,
    rng: SeededPRNG
  ): THREE.BufferGeometry {
    const segments = 12;
    const radialSegs = 8;
    const baseR = 0.34;
    const tipR = 0.06;

    const points: THREE.Vector3[] = [];
    const wanderAmp = rng.range(0.35, 0.65);
    const wanderPhase = rng.range(0, Math.PI * 2);

    for (let k = 0; k <= segments; k++) {
      const s = k / segments;
      const dist = 2.2 + s * length;
      const wander = Math.sin(s * Math.PI * 1.6 + wanderPhase) * wanderAmp * Math.sin(s * Math.PI);
      const angle = finAngle + wander / dist;

      const localX = Math.cos(angle) * dist;
      const localZ = Math.sin(angle) * dist;

      const worldX = treeX + localX * treeScale;
      const worldZ = treeZ + localZ * treeScale;
      const terrainY = RainforestTerrain.sampleHeight(worldX, worldZ);
      // Anchor directly to terrain with top half visible
      const localY = (terrainY - treeGroundY) / treeScale + Math.max(0.02, 0.16 * (1.0 - s));

      points.push(new THREE.Vector3(localX, localY, localZ));
    }

    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const up = new THREE.Vector3(0, 1, 0);

    for (let j = 0; j <= segments; j++) {
      const p = points[j];
      const s = j / segments;
      const r = THREE.MathUtils.lerp(baseR, tipR, Math.pow(s, 0.75));

      const tangent = new THREE.Vector3();
      if (j === 0) {
        tangent.subVectors(points[1], points[0]).normalize();
      } else if (j === segments) {
        tangent.subVectors(points[segments], points[segments - 1]).normalize();
      } else {
        tangent.subVectors(points[j + 1], points[j - 1]).normalize();
      }

      let normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      if (normal.lengthSq() < 0.001) {
        normal.set(1, 0, 0);
      }
      const binormal = new THREE.Vector3().crossVectors(normal, tangent).normalize();

      for (let i = 0; i <= radialSegs; i++) {
        const u = i / radialSegs;
        const theta = u * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Slightly flattened bottom resting on terrain
        const rx = cosT * r;
        const ry = sinT * (r * 0.72);

        const vx = p.x + normal.x * rx + binormal.x * ry;
        const vy = p.y + normal.y * rx + binormal.y * ry;
        const vz = p.z + normal.z * rx + binormal.z * ry;

        vertices.push(vx, vy, vz);
        uvs.push(u, s * 3.5);
      }
    }

    const stride = radialSegs + 1;
    for (let j = 0; j < segments; j++) {
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
   * Procedural branching limb geometry with organic arching and curvature.
   */
  private createBranchGeometry(
    length: number,
    baseR: number,
    tipR: number,
    archFactor: number = 0.35,
    curveDir: number = 0.0
  ): THREE.BufferGeometry {
    const radialSegs = 10;
    const heightSegs = 14;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= heightSegs; j++) {
      const t = j / heightSegs;
      const y = t * length;
      const z = Math.sin(t * Math.PI * 0.45) * (length * archFactor);
      const x = Math.sin(t * Math.PI * 0.8) * (length * 0.12) * curveDir;
      const r = THREE.MathUtils.lerp(baseR, tipR, Math.pow(t, 0.75));

      for (let i = 0; i <= radialSegs; i++) {
        const u = i / radialSegs;
        const angle = u * Math.PI * 2;
        vertices.push(x + Math.cos(angle) * r, y, z + Math.sin(angle) * r);
        uvs.push(u, t * (length / 3.0));
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
   * Creates large emergent rainforest trees with buttress roots, surface roots, branches, hanging lianas, and towering umbrella crowns.
   */
  private buildTrees() {
    const treePositions = [
      { x: -14, z: -10, scale: 1.5, h: 26, seed: 101 },
      { x: 16, z: -8, scale: 1.7, h: 28, seed: 202 },
      { x: -19, z: 14, scale: 1.4, h: 22, seed: 303 },
      { x: 15, z: 18, scale: 1.6, h: 25, seed: 404 },
      { x: -7, z: -24, scale: 1.9, h: 30, seed: 505 },
      { x: 9, z: -27, scale: 1.8, h: 28, seed: 606 },
      { x: 26, z: 4, scale: 1.6, h: 24, seed: 707 },
      { x: -28, z: -2, scale: 1.7, h: 26, seed: 808 },
    ];

    treePositions.forEach((tp, treeIdx) => {
      const rng = new SeededPRNG(tp.seed);
      const groundY = RainforestTerrain.sampleHeight(tp.x, tp.z);
      const treeGroup = new THREE.Group();
      treeGroup.position.set(tp.x, groundY, tp.z);
      treeGroup.scale.set(tp.scale, (tp.h / 24) * tp.scale, tp.scale);

      // 1. Procedural fluted buttress trunk
      const trunkData = this.createTreeTrunkGeometry(tp.h, rng);
      const trunkMesh = new THREE.Mesh(trunkData.geo, this.trunkMaterial);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      treeGroup.add(trunkMesh);

      // 2. Surface roots extending outward along terrain
      const rootCount = rng.int(2, 3);
      for (let r = 0; r < rootCount; r++) {
        const finIdx = (r * 2) % trunkData.finAngles.length;
        const rootAngle = trunkData.finAngles[finIdx];
        const rootLen = rng.range(5.0, 8.0);
        const rootGeo = this.createSurfaceRootGeometry(
          tp.x,
          tp.z,
          groundY,
          tp.scale,
          rootAngle,
          rootLen,
          rng
        );
        const rootMesh = new THREE.Mesh(rootGeo, this.trunkMaterial);
        rootMesh.castShadow = true;
        rootMesh.receiveShadow = true;
        treeGroup.add(rootMesh);
      }

      // 3. Branches: 4 to 6 major branches at staggered heights
      const branchCount = rng.int(4, 5);
      for (let b = 0; b < branchCount; b++) {
        const branchH = tp.h * (0.50 + (b / branchCount) * 0.32 + rng.range(-0.02, 0.03));
        const t_b = Math.max(0.0, Math.min(1.0, (branchH + 3.5) / (tp.h + 3.5)));

        const cx_b = (Math.sin(t_b * Math.PI * trunkData.curveFreq) * trunkData.leanAmp +
                      Math.sin(t_b * Math.PI * 2.0) * trunkData.sCurveAmp) *
                     Math.cos(trunkData.leanDir) * t_b;
        const cz_b = (Math.sin(t_b * Math.PI * trunkData.curveFreq) * trunkData.leanAmp +
                      Math.sin(t_b * Math.PI * 2.0) * trunkData.sCurveAmp) *
                     Math.sin(trunkData.leanDir) * t_b;
        const r_b = THREE.MathUtils.lerp(trunkData.baseRadius, trunkData.topRadius, Math.pow(t_b, 0.85));

        const branchAngle = (b / branchCount) * Math.PI * 2 + rng.range(-0.30, 0.30) + treeIdx * 0.45;
        const branchLen = rng.range(6.5, 9.2);
        const baseR = rng.range(0.38, 0.46);
        const tipR = rng.range(0.16, 0.22);
        const archFactor = rng.range(0.28, 0.38);
        const curveDir = rng.range(-1.0, 1.0);

        const branchGeo = this.createBranchGeometry(branchLen, baseR, tipR, archFactor, curveDir);
        const branchMesh = new THREE.Mesh(branchGeo, this.trunkMaterial);

        const startX = cx_b + Math.cos(branchAngle) * (r_b * 0.65);
        const startZ = cz_b + Math.sin(branchAngle) * (r_b * 0.65);
        branchMesh.position.set(startX, branchH, startZ);

        const pitch = rng.range(0.55, 0.75);
        branchMesh.rotation.set(pitch, branchAngle, rng.range(-0.2, 0.2));
        branchMesh.castShadow = true;
        branchMesh.receiveShadow = true;
        treeGroup.add(branchMesh);

        // Branch tip position in treeGroup local space
        const localTip = new THREE.Vector3(
          curveDir * branchLen * 0.12,
          branchLen * 0.88,
          branchLen * archFactor * 0.95
        );
        localTip.applyEuler(branchMesh.rotation);
        localTip.add(branchMesh.position);

        // 4. Hanging Liana Vines dangling from branch fork
        const lianaLen = rng.range(12.0, 18.0);
        const lianaGeo = this.createLianaGeometry(lianaLen);
        const lianaMesh = new THREE.Mesh(lianaGeo, this.trunkMaterial);
        const lianaAttach = new THREE.Vector3(0, branchLen * 0.35, 0);
        lianaAttach.applyEuler(branchMesh.rotation);
        lianaAttach.add(branchMesh.position);
        lianaMesh.position.copy(lianaAttach);
        lianaMesh.castShadow = true;
        treeGroup.add(lianaMesh);

        // 5. Canopy clump at branch tip
        const canopyRadius = rng.range(4.8, 5.8);
        const canopyThick = rng.range(2.4, 2.9);
        const branchCanopyGeo = this.createUmbrellaCanopyGeometry(canopyRadius, canopyThick);
        const branchCanopyMesh = new THREE.Mesh(branchCanopyGeo, this.canopyMaterial);
        branchCanopyMesh.position.copy(localTip);
        branchCanopyMesh.castShadow = true;
        branchCanopyMesh.receiveShadow = true;
        treeGroup.add(branchCanopyMesh);

        // 6. Secondary branch split (on 1-2 branches per tree)
        if (b === 0 || b === 2) {
          const subBranchLen = rng.range(3.8, 5.0);
          const subBaseR = baseR * 0.65;
          const subTipR = tipR * 0.75;
          const subGeo = this.createBranchGeometry(subBranchLen, subBaseR, subTipR, 0.3, -curveDir);
          const subMesh = new THREE.Mesh(subGeo, this.trunkMaterial);

          const splitDist = branchLen * 0.52;
          const splitPos = new THREE.Vector3(0, splitDist, splitDist * archFactor * 0.5);
          splitPos.applyEuler(branchMesh.rotation);
          splitPos.add(branchMesh.position);

          subMesh.position.copy(splitPos);
          const subPitch = pitch + rng.range(-0.15, 0.15);
          const subAngle = branchAngle + (b === 0 ? 0.65 : -0.65);
          subMesh.rotation.set(subPitch, subAngle, rng.range(-0.15, 0.15));
          subMesh.castShadow = true;
          subMesh.receiveShadow = true;
          treeGroup.add(subMesh);

          // Sub-branch canopy clump
          const subTip = new THREE.Vector3(0, subBranchLen * 0.85, subBranchLen * 0.28);
          subTip.applyEuler(subMesh.rotation);
          subTip.add(subMesh.position);

          const subCanopyGeo = this.createUmbrellaCanopyGeometry(3.8, 2.0);
          const subCanopyMesh = new THREE.Mesh(subCanopyGeo, this.canopyMaterial);
          subCanopyMesh.position.copy(subTip);
          subCanopyMesh.castShadow = true;
          subCanopyMesh.receiveShadow = true;
          treeGroup.add(subCanopyMesh);
        }
      }

      // 7. Central towering umbrella crown
      const topCanopyGeo = this.createUmbrellaCanopyGeometry(rng.range(6.8, 7.6), rng.range(3.2, 3.6));
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

    if (this.trunkMaterial && this.trunkMaterial.uniforms) {
      this.trunkMaterial.uniforms.uTime.value = time;
      this.trunkMaterial.uniforms.uCameraPosition.value.copy(cameraPos);
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
    if (this.trunkMaterial && this.trunkMaterial.uniforms) {
      this.trunkMaterial.uniforms.uTransitionWeight.value = weight;
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
    if (this.trunkMaterial && this.trunkMaterial.uniforms) {
      this.trunkMaterial.uniforms.uWetness.value =
        tier === 'LOW' ? 0.5 : tier === 'MEDIUM' ? 0.75 : tier === 'HIGH' ? 0.88 : 0.95;
    }

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
