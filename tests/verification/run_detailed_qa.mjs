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

async function runQA() {
  console.log('=== PĀNI PHASE 6 DETAILED VISUAL QA PASS ===');
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
  await capture(page, 'qa_01_transition_ocean_to_coast.png');

  await new Promise((r) => setTimeout(r, 1500));
  await capture(page, 'qa_02_transition_canopy_approach.png');

  // Arrive in Canopy
  await new Promise((r) => setTimeout(r, 1500));
  await capture(page, 'qa_03_canopy_1080p.png');

  // Ultrawide Canopy
  await page.setViewport({ width: 2560, height: 1080 });
  await new Promise((r) => setTimeout(r, 600));
  await capture(page, 'qa_04_canopy_ultrawide.png');

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
  await capture(page, 'qa_05_leaf_landing_1080p.png');

  // Spine sliding (1.8s into slide)
  await new Promise((r) => setTimeout(r, 1800));
  await capture(page, 'qa_06_leaf_sliding_1080p.png');

  // Tip accumulation (at 6.7s total, droplet stretching at tip)
  await new Promise((r) => setTimeout(r, 2400));
  await capture(page, 'qa_07_leaf_tip_stretch.png');

  // Drip fall & Puddle Ripple (at 8.5s total, impact + active ripples)
  await new Promise((r) => setTimeout(r, 1800));
  await capture(page, 'qa_08_puddle_impact_ripples.png');

  // Ultrawide Puddle
  await page.setViewport({ width: 2560, height: 1080 });
  await new Promise((r) => setTimeout(r, 800));
  await capture(page, 'qa_09_puddle_ultrawide.png');

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
