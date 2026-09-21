import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test_results_phase6_qa');
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

async function runQA() {
  console.log('=== PĀNI PHASE 6 DETAILED VISUAL QA PASS ===');
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
  });

  console.log('1. Loading http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  // Step 1: Start Story and Dive
  console.log('2. Starting story: reveal -> descent -> impact -> underwater...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startStory();
  });
  // Wait for reveal + descent + impact + submerged
  await new Promise((r) => setTimeout(r, 5500));

  // Step 2: Trigger Rainforest Journey Transition
  console.log('3. Triggering Ocean -> Rainforest Transition...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startRainforestJourney();
  });

  // Capture transition mid-points
  await new Promise((r) => setTimeout(r, 1200));
  const trans1 = path.join(outDir, 'temp_trans1.png');
  await page.screenshot({ path: trans1 });
  saveImage(trans1, 'qa_01_transition_ocean_to_coast.png');

  await new Promise((r) => setTimeout(r, 1500));
  const trans2 = path.join(outDir, 'temp_trans2.png');
  await page.screenshot({ path: trans2 });
  saveImage(trans2, 'qa_02_transition_canopy_approach.png');

  // Arrive in Canopy
  await new Promise((r) => setTimeout(r, 1500));
  const canopy1080 = path.join(outDir, 'temp_canopy1080.png');
  await page.screenshot({ path: canopy1080 });
  saveImage(canopy1080, 'qa_03_canopy_1080p.png');

  // Ultrawide Canopy
  await page.setViewport({ width: 2560, height: 1080 });
  await new Promise((r) => setTimeout(r, 600));
  const canopy2560 = path.join(outDir, 'temp_canopy2560.png');
  await page.screenshot({ path: canopy2560 });
  saveImage(canopy2560, 'qa_04_canopy_ultrawide.png');

  // Reset to 1920x1080 for leaf interaction
  await page.setViewport({ width: 1920, height: 1080 });
  await new Promise((r) => setTimeout(r, 400));

  // Step 3: Trigger Hero Leaf Interaction
  console.log('4. Starting Hero Leaf Interaction...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  // Landing (2.5s into descent)
  await new Promise((r) => setTimeout(r, 2500));
  const leafLand = path.join(outDir, 'temp_leaf_land.png');
  await page.screenshot({ path: leafLand });
  saveImage(leafLand, 'qa_05_leaf_landing_1080p.png');

  // Spine sliding (1.8s into slide)
  await new Promise((r) => setTimeout(r, 1800));
  const leafSlide = path.join(outDir, 'temp_leaf_slide.png');
  await page.screenshot({ path: leafSlide });
  saveImage(leafSlide, 'qa_06_leaf_sliding_1080p.png');

  // Tip accumulation (at 6.7s total, droplet stretching at tip)
  await new Promise((r) => setTimeout(r, 2400));
  const leafTip = path.join(outDir, 'temp_leaf_tip.png');
  await page.screenshot({ path: leafTip });
  saveImage(leafTip, 'qa_07_leaf_tip_stretch.png');

  // Drip fall & Puddle Ripple (at 8.5s total, impact + active ripples)
  await new Promise((r) => setTimeout(r, 1800));
  const puddleRipple = path.join(outDir, 'temp_puddle_ripple.png');
  await page.screenshot({ path: puddleRipple });
  saveImage(puddleRipple, 'qa_08_puddle_impact_ripples.png');

  // Ultrawide Puddle
  await page.setViewport({ width: 2560, height: 1080 });
  await new Promise((r) => setTimeout(r, 800));
  const puddle2560 = path.join(outDir, 'temp_puddle2560.png');
  await page.screenshot({ path: puddle2560 });
  saveImage(puddle2560, 'qa_09_puddle_ultrawide.png');

  // Measure final engine stats
  const finalStats = await page.evaluate(() => {
    return window.__PAANI_EXPERIENCE__.getStats();
  });
  console.log('Final Engine QA Stats:', JSON.stringify(finalStats, null, 2));

  console.log('QA Console Errors:', errors);
  console.log('QA Console Warnings:', warnings);

  await browser.close();
  console.log('=== QA RUN COMPLETE ===');
}

runQA().catch((err) => {
  console.error('QA Error:', err);
  process.exit(1);
});
