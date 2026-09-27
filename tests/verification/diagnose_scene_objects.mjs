import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

async function run() {
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

  const objectDetails = await page.evaluate(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    const scene = exp.scene;
    const cam = exp.camera.instance;

    const details = [];
    scene.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh || obj.isPoints) {
        let parentName = '';
        let p = obj.parent;
        while (p && p !== scene) {
          parentName = (p.name || p.constructor.name) + '/' + parentName;
          p = p.parent;
        }

        const worldPos = new obj.position.constructor();
        obj.getWorldPosition(worldPos);

        details.push({
          id: obj.id,
          name: obj.name,
          type: obj.type,
          parentHierarchy: parentName,
          worldPos: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
          transparent: obj.material ? obj.material.transparent : null,
          depthWrite: obj.material ? obj.material.depthWrite : null,
          depthTest: obj.material ? obj.material.depthTest : null,
          renderOrder: obj.renderOrder,
          materialName: obj.material ? (obj.material.name || obj.material.type) : null,
        });
      }
    });
    return details;
  });

  console.log('Object Details in Scene:\n', JSON.stringify(objectDetails, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
