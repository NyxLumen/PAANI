import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const outDir = path.resolve(process.cwd(), 'tests/test-results/diagnostics');

async function run() {
  console.log('=== GEOMETRY & INTERSECTION DIAGNOSTIC ===');
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
  await new Promise((r) => setTimeout(r, 1200));

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.jumpToRainforest();
  });
  await new Promise((r) => setTimeout(r, 1500));

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  // Evaluate at multiple progress values: 0.1, 0.3, 0.5, 0.7, 0.85, 0.95
  const results = await page.evaluate(async () => {
    const exp = window.__PAANI_EXPERIENCE__;
    const Vector3 = exp.drop.mesh.position.constructor;
    const Box3 = exp.rainforest.vegetation.heroLeafMesh.geometry.boundingBox?.constructor || class Box { constructor() {} };
    const drop = exp.drop;
    const leafMesh = exp.rainforest.vegetation.heroLeafMesh;
    const vegetation = exp.rainforest.vegetation;

    // Check leaf geometry
    const geo = leafMesh.geometry;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    const worldBox = geo.boundingBox.clone().applyMatrix4(leafMesh.matrixWorld);

    // Let's test the spine formula vs actual geometry vertices at u=0.5 (midrib)
    // The geometry has widthSegs = 48, lengthSegs = 64. Midrib is at u=0.5, i.e., index i = 24.
    const posAttr = geo.attributes.position;
    const stride = 49;
    const midribVertices = [];
    for (let j = 0; j <= 64; j++) {
      const idx = j * stride + 24;
      const localV = new Vector3(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      const worldV = localV.clone().applyMatrix4(leafMesh.matrixWorld);
      midribVertices.push({
        j,
        p: j / 64,
        local: { x: localV.x, y: localV.y, z: localV.z },
        world: { x: worldV.x, y: worldV.y, z: worldV.z },
      });
    }

    // Now test spine calculation at progress points
    const testPoints = [];
    const progresses = [0.08, 0.2, 0.4, 0.6, 0.8, 0.85, 0.9, 0.98];

    for (const p of progresses) {
      const spinePoint = vegetation.getHeroLeafSpinePoint(p, 0.35);
      const spineNormal = vegetation.getHeroLeafSpineNormal(p);
      const spinePointNoOffset = vegetation.getHeroLeafSpinePoint(p, 0.0);

      // Find closest vertex in hero leaf geometry
      let minDist = Infinity;
      let closestWorld = null;
      for (let k = 0; k < posAttr.count; k++) {
        const v = new Vector3(posAttr.getX(k), posAttr.getY(k), posAttr.getZ(k)).applyMatrix4(leafMesh.matrixWorld);
        const d = v.distanceTo(spinePoint);
        if (d < minDist) {
          minDist = d;
          closestWorld = v;
        }
      }

      // Check distance from spinePoint to spinePointNoOffset
      const offsetDist = spinePoint.distanceTo(spinePointNoOffset);

      testPoints.push({
        progress: p,
        spinePoint: { x: spinePoint.x, y: spinePoint.y, z: spinePoint.z },
        spinePointNoOffset: { x: spinePointNoOffset.x, y: spinePointNoOffset.y, z: spinePointNoOffset.z },
        spineNormal: { x: spineNormal.x, y: spineNormal.y, z: spineNormal.z },
        offsetDist,
        minDistToLeafMesh: minDist,
        closestVertex: closestWorld ? { x: closestWorld.x, y: closestWorld.y, z: closestWorld.z } : null,
      });
    }

    // Check wind displacement uniform and shader behavior
    const windStrength = leafMesh.material.uniforms.uWindStrength?.value;
    const time = exp.clock.getElapsed();

    return {
      dropRadius: drop.radius,
      windStrength,
      leafWorldBox: {
        min: { x: worldBox.min.x, y: worldBox.min.y, z: worldBox.min.z },
        max: { x: worldBox.max.x, y: worldBox.max.y, z: worldBox.max.z },
      },
      testPoints,
    };
  });

  console.log('Geometry Diagnostic Results:\n', JSON.stringify(results, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
