import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

async function run() {
  console.log('=== RAYCAST & LINE-OF-SIGHT GEOMETRIC PROOF ===');
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--window-size=1920,1080',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.jumpToRainforest();
  });
  await new Promise((r) => setTimeout(r, 1500));

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.rainforest?.interaction?.state === 'SLIDING_ON_LEAF' &&
           exp.rainforest.interaction.getSlideProgress() > 0.70;
  }, { timeout: 10000 });

  const raycastResults = await page.evaluate(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    const drop = exp.drop;
    const cam = exp.camera.instance;
    const leafMesh = exp.rainforest.vegetation.heroLeafMesh;

    // Vector operations
    function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
    function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
    function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
    function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    function cross(a, b) {
      return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
      };
    }
    function length(a) { return Math.sqrt(dot(a, a)); }
    function norm(a) { const l = length(a); return l > 0 ? mul(a, 1 / l) : { x: 0, y: 0, z: 0 }; }

    // Möller–Trumbore ray-triangle intersection
    function intersectRayTriangle(orig, dir, v0, v1, v2) {
      const EPSILON = 0.000001;
      const edge1 = sub(v1, v0);
      const edge2 = sub(v2, v0);
      const pvec = cross(dir, edge2);
      const det = dot(edge1, pvec);

      if (Math.abs(det) < EPSILON) return null; // Parallel
      const invDet = 1.0 / det;
      const tvec = sub(orig, v0);
      const u = dot(tvec, pvec) * invDet;
      if (u < 0.0 || u > 1.0) return null;

      const qvec = cross(tvec, edge1);
      const v = dot(dir, qvec) * invDet;
      if (v < 0.0 || u + v > 1.0) return null;

      const t = dot(edge2, qvec) * invDet;
      if (t > EPSILON) return t;
      return null;
    }

    // Transform leaf vertices to world space
    const geo = leafMesh.geometry;
    const pos = geo.attributes.position;
    const indices = geo.index.array;
    const matrixWorld = leafMesh.matrixWorld;

    const e = matrixWorld.elements;
    function applyMatrix4(p) {
      const x = p.x, y = p.y, z = p.z;
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      return {
        x: (e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
        y: (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
        z: (e[2] * x + e[6] * y + e[10] * z + e[14]) * w,
      };
    }

    const worldTriangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      const v0 = applyMatrix4({ x: pos.getX(i0), y: pos.getY(i0), z: pos.getZ(i0) });
      const v1 = applyMatrix4({ x: pos.getX(i1), y: pos.getY(i1), z: pos.getZ(i1) });
      const v2 = applyMatrix4({ x: pos.getX(i2), y: pos.getY(i2), z: pos.getZ(i2) });
      worldTriangles.push([v0, v1, v2]);
    }

    const camPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    const dropPos = exp.drop.getPosition();
    const dropCenter = { x: dropPos.x, y: dropPos.y, z: dropPos.z };
    const R = drop.radius;

    const testDirections = [
      { name: 'center', d: { x: 0, y: 0, z: 0 } },
      { name: 'top (+Y)', d: { x: 0, y: 1, z: 0 } },
      { name: 'bottom (-Y)', d: { x: 0, y: -1, z: 0 } },
      { name: 'left (-X, towards margin)', d: { x: -1, y: 0, z: 0 } },
      { name: 'right (+X, towards leaf center/gutter)', d: { x: 1, y: 0, z: 0 } },
      { name: 'top-right (+X, +Y)', d: norm({ x: 1, y: 1, z: 0 }) },
      { name: 'bottom-right (+X, -Y)', d: norm({ x: 1, y: -1, z: 0 }) },
      { name: 'half-right (+0.5X)', d: norm({ x: 0.5, y: 0, z: 0 }) },
      { name: 'front (+Z)', d: { x: 0, y: 0, z: 1 } },
      { name: 'back (-Z)', d: { x: 0, y: 0, z: -1 } },
    ];

    const results = [];
    for (const td of testDirections) {
      const pt = add(dropCenter, mul(td.d, R * 0.95));
      const rayVec = sub(pt, camPos);
      const distToPt = length(rayVec);
      const rayDir = norm(rayVec);

      let closestHitDist = Infinity;
      for (const tri of worldTriangles) {
        const hitT = intersectRayTriangle(camPos, rayDir, tri[0], tri[1], tri[2]);
        if (hitT !== null && hitT < closestHitDist) {
          closestHitDist = hitT;
        }
      }

      const isOccluded = closestHitDist < distToPt - 0.01;
      results.push({
        name: td.name,
        point: pt,
        distToPt,
        closestLeafHitDist: closestHitDist === Infinity ? null : closestHitDist,
        isOccluded,
        deltaIfOccluded: isOccluded ? (distToPt - closestHitDist) : null,
      });
    }

    return {
      dropCenter,
      camPos,
      totalLeafTriangles: worldTriangles.length,
      results,
    };
  });

  console.log('Raycast Results:\n', JSON.stringify(raycastResults, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
