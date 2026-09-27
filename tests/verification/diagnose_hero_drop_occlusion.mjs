import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const outDir = path.resolve(process.cwd(), 'tests/test-results/diagnostics');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function capture(page, filename) {
  const destLocal = path.join(outDir, filename);
  await page.screenshot({ path: destLocal });
  console.log(`Saved screenshot: ${filename}`);
}

async function run() {
  console.log('=== PĀNI HERO DROP OCCLUSION REPRODUCTION ===');
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
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[Browser Error]: ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.error(`[Browser PageError]: ${err.message}`));

  console.log('1. Loading http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  console.log('2. Jumping to Rainforest...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.jumpToRainforest();
  });
  await new Promise((r) => setTimeout(r, 2000));

  console.log('3. Triggering Leaf Interaction...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  // Sample along slide trajectory
  const sampleTimes = [400, 800, 1400, 2000, 2600, 3200, 3800];
  let accumulatedTime = 0;

  for (let i = 0; i < sampleTimes.length; i++) {
    const delay = sampleTimes[i] - accumulatedTime;
    accumulatedTime = sampleTimes[i];
    await new Promise((r) => setTimeout(r, delay));

    const telemetry = await page.evaluate(() => {
      const exp = window.__PAANI_EXPERIENCE__;
      const drop = exp.drop;
      const cam = exp.camera.instance;
      const leafMesh = exp.rainforest.vegetation.heroLeafMesh;
      const interaction = exp.rainforest.interaction;

      const dropPos = drop.getPosition();
      const camPos = cam.position;
      const leafPos = leafMesh.position;

      // Distance from camera
      const camToDrop = camPos.distanceTo(dropPos);
      const camToLeafOrigin = camPos.distanceTo(leafPos);

      // Check materials and renderOrder
      return {
        state: interaction.state,
        slideProgress: interaction.getSlideProgress(),
        dropPosition: { x: dropPos.x, y: dropPos.y, z: dropPos.z },
        cameraPosition: { x: camPos.x, y: camPos.y, z: camPos.z },
        camToDrop,
        camToLeafOrigin,
        dropRadius: drop.radius,
        dropMaterial: {
          transparent: drop.material.transparent,
          depthWrite: drop.material.depthWrite,
          depthTest: drop.material.depthTest,
          renderOrder: drop.mesh.renderOrder,
          opacity: drop.material.opacity,
          side: drop.material.side,
        },
        heroLeafMaterial: {
          transparent: leafMesh.material.transparent,
          depthWrite: leafMesh.material.depthWrite,
          depthTest: leafMesh.material.depthTest,
          renderOrder: leafMesh.renderOrder,
          opacity: leafMesh.material.opacity,
          side: leafMesh.material.side,
        },
      };
    });

    console.log(`\n--- Step ${i} (t = ${sampleTimes[i]}ms) ---`);
    console.log('Telemetry:', JSON.stringify(telemetry, null, 2));

    await capture(page, `repro_leaf_step_${i}_${sampleTimes[i]}ms.png`);
  }

  await browser.close();
  console.log('=== REPRODUCTION COMPLETE ===');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
