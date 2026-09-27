import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const outDir = path.resolve(process.cwd(), 'tests/test-results/diagnostics');

async function run() {
  console.log('=== CAPTURING CONTINUOUS SLIDE FRAMES ===');
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

  // Wait until SLIDING_ON_LEAF starts
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.rainforest?.interaction?.state === 'SLIDING_ON_LEAF';
  }, { timeout: 10000 });

  console.log('SLIDING_ON_LEAF has begun! Sampling frames...');

  const frameData = [];
  for (let f = 0; f < 16; f++) {
    const info = await page.evaluate((frameIdx) => {
      const exp = window.__PAANI_EXPERIENCE__;
      const drop = exp.drop;
      const cam = exp.camera.instance;
      const interaction = exp.rainforest.interaction;
      const leafMesh = exp.rainforest.vegetation.heroLeafMesh;

      const dropPos = drop.getPosition();
      const camPos = cam.position;
      const leafPos = leafMesh.position;

      // Distance from camera to drop and leaf
      const camToDrop = camPos.distanceTo(dropPos);
      const camToLeaf = camPos.distanceTo(leafPos);

      // Check Three.js transparent render list sorting order
      const renderLists = exp.renderer.instance.renderLists;
      let dropIndex = -1;
      let leafIndex = -1;
      let dropZ = 0;
      let leafZ = 0;

      if (renderLists) {
        const list = renderLists.get(exp.scene, 0);
        if (list && list.transparent) {
          list.transparent.forEach((item, idx) => {
            if (item.object === drop.mesh) {
              dropIndex = idx;
              dropZ = item.z;
            }
            if (item.object === leafMesh) {
              leafIndex = idx;
              leafZ = item.z;
            }
          });
        }
      }

      return {
        frameIdx,
        state: interaction.state,
        progress: interaction.getSlideProgress(),
        dropPos: { x: dropPos.x, y: dropPos.y, z: dropPos.z },
        camPos: { x: camPos.x, y: camPos.y, z: camPos.z },
        camToDrop,
        camToLeaf,
        dropIndex,
        leafIndex,
        dropZ,
        leafZ,
        dropDrawnBeforeLeaf: dropIndex < leafIndex,
      };
    }, f);

    frameData.push(info);
    const filename = `slide_seq_f${String(f).padStart(2, '0')}_p${Math.round(info.progress * 100)}.png`;
    await page.screenshot({ path: path.join(outDir, filename) });
    console.log(`Frame ${f}: progress=${info.progress.toFixed(2)}, dropIdx=${info.dropIndex}, leafIdx=${info.leafIndex}, dropBeforeLeaf=${info.dropDrawnBeforeLeaf}`);

    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('\nAll Frame Telemetry:\n', JSON.stringify(frameData, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
