import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const outDir = path.resolve(process.cwd(), 'tests/test-results/phase-6-rainforest');
const artifactDir = process.env.ARTIFACT_DIR || null;

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function capture(page, filename) {
  const destLocal = path.join(outDir, filename);
  await page.screenshot({ path: destLocal });
  if (artifactDir && fs.existsSync(artifactDir)) {
    const destArtifact = path.join(artifactDir, filename);
    fs.copyFileSync(destLocal, destArtifact);
  }
}

async function verify() {
  console.log('=== PĀNI PHASE 6: RAINFOREST ENVIRONMENT VERIFICATION ===');
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
  const errors = [];
  const warnings = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });

  page.on('pageerror', (err) => {
    errors.push(err.message);
    console.error(`[Browser Error]: ${err.message}`);
  });

  console.log('1. Loading http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  // 1. Check Pre-Start Ocean
  await capture(page, '11_ocean_opening_stable.png');
  console.log('Saved 11_ocean_opening_stable.png');

  // 2. Transition to Rainforest Canopy
  console.log('2. Transitioning to Rainforest Canopy...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.jumpToRainforest();
  });
  await new Promise((r) => setTimeout(r, 1800));

  const stats = await page.evaluate(() => {
    return window.__PAANI_EXPERIENCE__.getStats();
  });
  console.log('Rainforest Engine Stats:', JSON.stringify(stats, null, 2));

  await capture(page, '12_rainforest_canopy_sunbeams.png');
  console.log('Saved 12_rainforest_canopy_sunbeams.png');

  // 3. Trigger Hero Leaf Droplet Interaction
  console.log('3. Triggering Hero Droplet Leaf Interaction...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });
  await new Promise((r) => setTimeout(r, 600));

  await capture(page, '13_rainforest_hero_leaf_landing.png');
  console.log('Saved 13_rainforest_hero_leaf_landing.png');

  // 4. Slide along leaf spine
  console.log('4. Tracking droplet sliding along curved leaf spine...');
  await new Promise((r) => setTimeout(r, 1800));
  await capture(page, '14_rainforest_leaf_spine_slide.png');
  console.log('Saved 14_rainforest_leaf_spine_slide.png');

  // 5. Tip accumulation & Drip fall
  console.log('5. Tracking tip accumulation & teardrop fall...');
  await new Promise((r) => setTimeout(r, 2200));
  await capture(page, '15_rainforest_tip_drip_fall.png');
  console.log('Saved 15_rainforest_tip_drip_fall.png');

  // 6. Puddle capillary ripples
  console.log('6. Tracking puddle impact & capillary ripples...');
  await new Promise((r) => setTimeout(r, 1000));
  await capture(page, '16_rainforest_puddle_capillary_ripples.png');
  console.log('Saved 16_rainforest_puddle_capillary_ripples.png');

  // 7. Ultrawide 2560x1080 cinematic capture
  console.log('7. Capturing Ultrawide (2560x1080) Rainforest View...');
  await page.setViewport({ width: 2560, height: 1080 });
  await new Promise((r) => setTimeout(r, 800));
  await capture(page, '17_ultrawide_2560x1080_rainforest.png');
  console.log('Saved 17_ultrawide_2560x1080_rainforest.png');

  console.log('Errors:', errors);
  console.log('Warnings:', warnings);

  await browser.close();
  console.log('=== VERIFICATION COMPLETE ===');
}

verify().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
