import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tests/test-results/cinematic');
const ARTIFACT_SCREENSHOT_DIR = process.env.ARTIFACT_SCREENSHOT_DIR || null;

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
if (ARTIFACT_SCREENSHOT_DIR) {
  fs.mkdirSync(ARTIFACT_SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function capture(page, name) {
  const filePath1 = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath1 });
  if (ARTIFACT_SCREENSHOT_DIR) {
    const filePath2 = path.join(ARTIFACT_SCREENSHOT_DIR, `${name}.png`);
    fs.copyFileSync(filePath1, filePath2);
  }
  console.log(`[Captured] ${name}.png`);
}

async function main() {
  console.log('Launching browser for cinematic verification...');
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=gl',
      '--enable-gpu-rasterization',
      '--window-size=1920,1080',
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    },
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[Browser Log]', msg.text()));
  page.on('pageerror', (err) => console.error('[Browser Error]', err));

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // Wait for PAANI Experience
  await page.waitForFunction(() => !!window.__PAANI_EXPERIENCE__, { timeout: 15000 });
  console.log('PĀNI Experience found.');

  // Set ULTRA quality tier
  await page.evaluate(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    exp.setQualityTier('ULTRA');
    exp.qualityManager.setTier('ULTRA');
  });
  console.log('Quality tier set to ULTRA.');

  // Let render pipeline stabilize
  await sleep(1500);

  // 1. Scene: Ocean Opening
  console.log('Capturing 01_ocean_opening...');
  await capture(page, '01_ocean_opening');

  // Measure FPS on ULTRA
  const fpsStats = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function step() {
        frames++;
        if (frames < 90) {
          requestAnimationFrame(step);
        } else {
          const elapsed = performance.now() - start;
          const fps = (frames / elapsed) * 1000;
          const exp = window.__PAANI_EXPERIENCE__;
          resolve({ fps, stats: exp ? exp.getStats() : null });
        }
      }
      requestAnimationFrame(step);
    });
  });
  console.log(`[Performance Benchmark] ULTRA Tier Average FPS: ${fpsStats.fps.toFixed(1)} FPS`);
  console.log('[Performance Stats]', JSON.stringify(fpsStats.stats, null, 2));

  // 2. Scene: Hero Drop Reveal
  console.log('Triggering Reveal...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startStory();
  });
  await sleep(2200);
  await capture(page, '02_hero_drop_reveal');

  // 3. Scene: Hero Drop Fall / Descent
  console.log('Waiting for Descent...');
  // Poll until phase is DESCENT or position plunges
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.story.phase === 'DESCENT' || exp.drop.getPosition().y > 2.0;
  }, { timeout: 5000 });
  await sleep(400);
  await capture(page, '03_hero_drop_fall');

  // 4. Scene: Ocean Splash & Entry
  console.log('Waiting for Ocean Impact/Splash...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.story.phase === 'IMPACT' || exp.story.phase === 'UNDERWATER';
  }, { timeout: 6000 });
  await capture(page, '04_ocean_splash');

  // 5. Scene: Underwater Submersion & Caustics
  console.log('Waiting for Underwater Caustics...');
  await sleep(2200);
  await capture(page, '05_underwater_caustics');

  // 6. Scene: Transition to Rainforest
  console.log('Triggering Rainforest Transition...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startRainforestJourney();
  });
  await sleep(1800);
  await capture(page, '06_rainforest_transition');

  // 7. Scene: High Canopy & Sunbeams
  console.log('Waiting for High Canopy Sunbeams...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.story.phase === 'RAINFOREST_CANOPY';
  }, { timeout: 6000 });
  await sleep(1500);
  await capture(page, '07_canopy_sunbeams');

  // 8. Scene: Hero Leaf Landing
  console.log('Triggering Hero Leaf Interaction...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });
  // Wait for landing and squash
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    const st = exp.rainforest?.interaction?.state;
    return st === 'LEAF_IMPACT_SQUASH' || st === 'SLIDING_ON_LEAF';
  }, { timeout: 6000 });
  await sleep(150);
  await capture(page, '08_hero_leaf_landing');

  // 9. Scene: Hero Drop Sliding on Leaf Gutter
  console.log('Waiting for Drop Sliding along Leaf Gutter...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.rainforest?.interaction?.state === 'SLIDING_ON_LEAF' && exp.rainforest.interaction.getSlideProgress() > 0.40;
  }, { timeout: 6000 });
  await capture(page, '09_hero_leaf_sliding');

  // 10. Scene: Drop Pinch-Off / Drip Tip Detachment
  console.log('Waiting for Drop Tip Accumulation & Drip...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    const st = exp.rainforest?.interaction?.state;
    return st === 'TIP_ACCUMULATION' || st === 'DRIP_FALL';
  }, { timeout: 6000 });
  await sleep(400);
  await capture(page, '10_hero_leaf_drip');

  // 11. Scene: Puddle Impact & Ripples
  console.log('Waiting for Puddle Impact & Concentric Ripples...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    const st = exp.rainforest?.interaction?.state;
    return st === 'PUDDLE_IMPACT' || st === 'RESTING_IN_PUDDLE';
  }, { timeout: 6000 });
  await sleep(350);
  await capture(page, '11_puddle_impact');

  // Now capture 2560x1080 Ultra-Wide shots for the hero views:
  console.log('Setting 2560x1080 Ultra-Wide Viewport...');
  await page.setViewport({ width: 2560, height: 1080, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
  });
  await sleep(1200);

  // Capture ultra-wide puddle scene
  await capture(page, '11_puddle_impact_ultrawide');

  // Reset to opening for ultrawide ocean
  console.log('Resetting for Ultra-Wide Ocean view...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.resetStory();
  });
  await sleep(1800);
  await capture(page, '01_ocean_opening_ultrawide');

  // Ultra-wide hero drop reveal
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startStory();
  });
  await sleep(2200);
  await capture(page, '02_hero_drop_reveal_ultrawide');

  await browser.close();
  console.log('Cinematic verification capture complete! All 11 scenes captured.');
}

main().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
