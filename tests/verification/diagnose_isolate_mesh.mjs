import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const outDir = path.resolve(process.cwd(), 'tests/test-results/diagnostics');

async function testHidingMesh(meshName, hideFn) {
  console.log(`\nTesting with ${meshName} HIDDEN...`);
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

  await page.evaluate(hideFn);
  await new Promise((r) => setTimeout(r, 100));

  const filename = `isolate_hide_${meshName}.png`;
  await page.screenshot({ path: path.join(outDir, filename) });
  console.log(`Saved screenshot: ${filename}`);

  await browser.close();
}

async function main() {
  // 1. Hide heroLeafMesh
  await testHidingMesh('heroLeafMesh', () => {
    window.__PAANI_EXPERIENCE__.rainforest.vegetation.heroLeafMesh.visible = false;
  });

  // 2. Hide broadleafInstanced
  await testHidingMesh('broadleafInstanced', () => {
    const veg = window.__PAANI_EXPERIENCE__.rainforest.vegetation;
    veg.broadleafInstanced.visible = false;
  });

  // 3. Hide fernInstanced
  await testHidingMesh('fernInstanced', () => {
    const veg = window.__PAANI_EXPERIENCE__.rainforest.vegetation;
    veg.fernInstanced.visible = false;
  });

  // 4. Hide treesGroup
  await testHidingMesh('treesGroup', () => {
    const veg = window.__PAANI_EXPERIENCE__.rainforest.vegetation;
    veg.treesGroup.visible = false;
  });

  // 5. Hide puddles
  await testHidingMesh('puddles', () => {
    window.__PAANI_EXPERIENCE__.rainforest.puddles.group.visible = false;
  });

  // 6. Hide terrain
  await testHidingMesh('terrain', () => {
    window.__PAANI_EXPERIENCE__.rainforest.terrain.mesh.visible = false;
  });
}

main().catch(console.error);
