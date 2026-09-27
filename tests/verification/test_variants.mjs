import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const outDir = path.resolve(process.cwd(), 'tests/test-results/diagnostics');

async function testVariant(name, setupFn) {
  console.log(`\nTesting variant: ${name}`);
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

  await page.evaluate(setupFn);

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.rainforest?.interaction?.state === 'SLIDING_ON_LEAF' &&
           exp.rainforest.interaction.getSlideProgress() > 0.70;
  }, { timeout: 10000 });

  await page.evaluate(setupFn);
  await new Promise((r) => setTimeout(r, 100));

  const filename = `variant_${name}.png`;
  await page.screenshot({ path: path.join(outDir, filename) });
  console.log(`Saved screenshot: ${filename}`);

  await browser.close();
}

async function main() {
  // Variant 1: drop transparent=false (opaque)
  await testVariant('drop_opaque', () => {
    const drop = window.__PAANI_EXPERIENCE__.drop;
    drop.material.transparent = false;
    drop.material.depthWrite = true;
    drop.material.needsUpdate = true;
  });

  // Variant 2: heroLeaf transparent=false (opaque)
  await testVariant('heroleaf_opaque', () => {
    const leaf = window.__PAANI_EXPERIENCE__.rainforest.vegetation.heroLeafMesh;
    leaf.material.transparent = false;
    leaf.material.depthWrite = true;
    leaf.material.needsUpdate = true;
  });

  // Variant 3: all foliage transparent=false (opaque)
  await testVariant('all_foliage_opaque', () => {
    const veg = window.__PAANI_EXPERIENCE__.rainforest.vegetation;
    veg.foliageMaterial.transparent = false;
    veg.foliageMaterial.depthWrite = true;
    veg.foliageMaterial.needsUpdate = true;
    veg.heroLeafMesh.material.transparent = false;
    veg.heroLeafMesh.material.depthWrite = true;
    veg.heroLeafMesh.material.needsUpdate = true;
  });

  // Variant 4: renderOrder on drop = 10
  await testVariant('drop_renderorder_10', () => {
    const drop = window.__PAANI_EXPERIENCE__.drop;
    drop.mesh.renderOrder = 10;
  });

  // Variant 5: renderOrder on heroLeaf = -1
  await testVariant('heroleaf_renderorder_minus1', () => {
    const leaf = window.__PAANI_EXPERIENCE__.rainforest.vegetation.heroLeafMesh;
    leaf.renderOrder = -1;
  });
}

main().catch(console.error);
