import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test_results_phase6_rainforest');
const artifactDir = '/home/lumen/.gemini/antigravity/brain/f8eaa8ec-8e86-43ac-ad4e-b7a931145e62';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function saveImage(srcPath, filename) {
  const destLocal = path.join(outDir, filename);
  fs.copyFileSync(srcPath, destLocal);
  if (fs.existsSync(artifactDir)) {
    const destArtifact = path.join(artifactDir, filename);
    fs.copyFileSync(srcPath, destArtifact);
  }
}

async function verify() {
  console.log('=== PĀNI PHASE 6: RAINFOREST ENVIRONMENT VERIFICATION ===');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
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
  const prestartShot = path.join(outDir, 'temp_ocean.png');
  await page.screenshot({ path: prestartShot });
  saveImage(prestartShot, '11_ocean_opening_stable.png');
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

  const canopyShot = path.join(outDir, 'temp_canopy.png');
  await page.screenshot({ path: canopyShot });
  saveImage(canopyShot, '12_rainforest_canopy_sunbeams.png');
  console.log('Saved 12_rainforest_canopy_sunbeams.png');

  // 3. Trigger Hero Leaf Droplet Interaction
  console.log('3. Triggering Hero Droplet Leaf Interaction...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });
  await new Promise((r) => setTimeout(r, 600));

  const leafLandShot = path.join(outDir, 'temp_leaf_land.png');
  await page.screenshot({ path: leafLandShot });
  saveImage(leafLandShot, '13_rainforest_hero_leaf_landing.png');
  console.log('Saved 13_rainforest_hero_leaf_landing.png');

  // 4. Slide along leaf spine
  console.log('4. Tracking droplet sliding along curved leaf spine...');
  await new Promise((r) => setTimeout(r, 1800));
  const leafSlideShot = path.join(outDir, 'temp_leaf_slide.png');
  await page.screenshot({ path: leafSlideShot });
  saveImage(leafSlideShot, '14_rainforest_leaf_spine_slide.png');
  console.log('Saved 14_rainforest_leaf_spine_slide.png');

  // 5. Tip accumulation & Drip fall
  console.log('5. Tracking tip accumulation & teardrop fall...');
  await new Promise((r) => setTimeout(r, 2200));
  const tipDripShot = path.join(outDir, 'temp_tip_drip.png');
  await page.screenshot({ path: tipDripShot });
  saveImage(tipDripShot, '15_rainforest_tip_drip_fall.png');
  console.log('Saved 15_rainforest_tip_drip_fall.png');

  // 6. Puddle capillary ripples
  console.log('6. Tracking puddle impact & capillary ripples...');
  await new Promise((r) => setTimeout(r, 1000));
  const puddleShot = path.join(outDir, 'temp_puddle.png');
  await page.screenshot({ path: puddleShot });
  saveImage(puddleShot, '16_rainforest_puddle_capillary_ripples.png');
  console.log('Saved 16_rainforest_puddle_capillary_ripples.png');

  // 7. Ultrawide 2560x1080 cinematic capture
  console.log('7. Capturing Ultrawide (2560x1080) Rainforest View...');
  await page.setViewport({ width: 2560, height: 1080 });
  await new Promise((r) => setTimeout(r, 800));
  const ultrawideShot = path.join(outDir, 'temp_ultrawide.png');
  await page.screenshot({ path: ultrawideShot });
  saveImage(ultrawideShot, '17_ultrawide_2560x1080_rainforest.png');
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
