import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = '/home/lumen/Code/PAANI/test_results/ai_transitions';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('Launching Chromium for AI transition verification...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--window-size=1280,720',
      '--autoplay-policy=no-user-gesture-required'
    ],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('deprecated') && !text.includes('Registration response')) {
      console.log(`[Browser Console ${msg.type()}]:`, text);
    }
  });

  page.on('pageerror', err => {
    console.error('[Browser Error]:', err.message);
  });

  // =========================================================================
  // ROUTE 1: OCEAN -> START -> UNDERWATER -> SHORE -> ASCENT -> CLOUDS -> RAIN -> OCEAN
  // =========================================================================
  console.log('Navigating to http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // 1. Before Dive
  await page.screenshot({ path: path.join(outDir, '01_ocean_before_dive.png') });
  console.log('Captured: 01_ocean_before_dive.png');

  // 2. Click START -> Check stages of ocean_to_underwater.mp4
  console.log('Triggering START (Ocean -> Underwater AI transition)...');
  await page.click('.scribble-start-btn');

  // Early transition (t ~ 0.8s: entering AI video)
  await sleep(800);
  await page.screenshot({ path: path.join(outDir, '02_dive_early.png') });
  console.log('Captured: 02_dive_early.png');

  // Mid transition (t ~ 2.0s: plunge through water with bubbles)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '03_dive_mid_bubbles.png') });
  console.log('Captured: 03_dive_mid_bubbles.png');

  // Climax / Destination reveal (t ~ 3.2s: underwater reveal window)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '04_dive_reveal.png') });
  console.log('Captured: 04_dive_reveal.png');

  // Settle into underwater intro
  await page.waitForSelector('.intro-narrative-text', { timeout: 10000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, '05_underwater_settled.png') });
  console.log('Captured: 05_underwater_settled.png');

  // Wait for Choice screen
  await page.waitForSelector('.choice-options-wrapper', { timeout: 10000 });
  await sleep(500);
  await page.screenshot({ path: path.join(outDir, '06_choice.png') });
  console.log('Captured: 06_choice.png');

  // Click FOLLOW THE SHORE
  console.log('Selecting Shore branch...');
  await page.click('.choice-left');
  await page.waitForSelector('.destination-rise-btn', { timeout: 10000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, '07_shore_before_ascent.png') });
  console.log('Captured: 07_shore_before_ascent.png');

  // 3. Click RISE -> Check stages of shore_to_sky.mp4
  console.log('Triggering RISE (Shore -> Cloud Ascent AI transition)...');
  await page.click('.destination-rise-btn');

  // Early ascent (t ~ 0.8s)
  await sleep(800);
  await page.screenshot({ path: path.join(outDir, '08_ascent_early.png') });
  console.log('Captured: 08_ascent_early.png');

  // Mid ascent (t ~ 2.0s: sun and dunes tilt)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '09_ascent_mid_sun.png') });
  console.log('Captured: 09_ascent_mid_sun.png');

  // Climax / Destination reveal (t ~ 3.2s)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '10_ascent_reveal.png') });
  console.log('Captured: 10_ascent_reveal.png');

  // Wait for Cloud Ascent continuation UI
  await page.waitForSelector('.cycle-continuation-btn', { timeout: 10000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, '11_cloud_ascent_settled.png') });
  console.log('Captured: 11_cloud_ascent_settled.png');

  // 4. Click GATHER -> Clouds (atmospheric)
  console.log('Triggering GATHER (Cloud Ascent -> Clouds)...');
  await page.click('.cycle-continuation-btn');
  await sleep(2200);
  await page.waitForSelector('.cycle-continuation-btn', { timeout: 10000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, '12_clouds_before_rain.png') });
  console.log('Captured: 12_clouds_before_rain.png');

  // 5. Click RELEASE -> Check stages of cloud_to_rain.mp4
  console.log('Triggering RELEASE (Clouds -> Rain AI transition)...');
  await page.click('.cycle-continuation-btn');

  // Early rain transition (t ~ 0.8s)
  await sleep(800);
  await page.screenshot({ path: path.join(outDir, '13_rain_early.png') });
  console.log('Captured: 13_rain_early.png');

  // Mid rain transition (t ~ 2.0s: falling rain droplets)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '14_rain_mid_droplets.png') });
  console.log('Captured: 14_rain_mid_droplets.png');

  // Reveal window (t ~ 3.2s)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '15_rain_reveal.png') });
  console.log('Captured: 15_rain_reveal.png');

  // Wait for Rain continuation UI
  await page.waitForSelector('.cycle-continuation-btn', { timeout: 10000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, '16_rain_settled.png') });
  console.log('Captured: 16_rain_settled.png');

  // 6. Click REJOIN THE OCEAN -> Check stages of rain_to_ocean.mp4
  console.log('Triggering REJOIN THE OCEAN (Rain -> Ocean AI transition)...');
  await page.click('.cycle-continuation-btn');

  // Early rain-to-ocean (t ~ 0.8s)
  await sleep(800);
  await page.screenshot({ path: path.join(outDir, '17_rain_to_ocean_early.png') });
  console.log('Captured: 17_rain_to_ocean_early.png');

  // Mid storm spray & surface swell (t ~ 2.0s)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '18_rain_to_ocean_mid_waves.png') });
  console.log('Captured: 18_rain_to_ocean_mid_waves.png');

  // Ocean reveal window (t ~ 3.2s)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '19_rain_to_ocean_reveal.png') });
  console.log('Captured: 19_rain_to_ocean_reveal.png');

  // Wait for return to canonical Ocean
  await page.waitForSelector('.scribble-start-btn', { timeout: 10000 });
  await sleep(1500);
  await page.screenshot({ path: path.join(outDir, '20_ocean_cycle_returned.png') });
  console.log('Captured: 20_ocean_cycle_returned.png');

  // =========================================================================
  // ROUTE 2: OCEAN -> START -> UNDERWATER -> CHOICE -> DESCEND -> DEEP -> OCEAN
  // =========================================================================
  console.log('Testing Route 2: Ocean -> Underwater -> Deep -> Ocean branch...');
  await page.click('.scribble-start-btn');
  await page.waitForSelector('.choice-options-wrapper', { timeout: 15000 });
  await sleep(500);

  console.log('Selecting DESCEND...');
  await page.click('.choice-right');
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '21_deep_descent_transition.png') });
  console.log('Captured: 21_deep_descent_transition.png');

  await page.waitForSelector('.destination-restart-btn', { timeout: 10000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, '22_deep_settled.png') });
  console.log('Captured: 22_deep_settled.png');

  // 7. Click ASCEND TO OCEAN -> Check stages of deep_to_ocean.mp4
  console.log('Triggering ASCEND TO OCEAN (Deep -> Ocean AI transition)...');
  await page.click('.destination-restart-btn');

  // Early deep-to-ocean (t ~ 0.8s: abyss ascension begins)
  await sleep(800);
  await page.screenshot({ path: path.join(outDir, '23_deep_to_ocean_early.png') });
  console.log('Captured: 23_deep_to_ocean_early.png');

  // Mid ascension (t ~ 2.0s: rising bubbles & rays toward sunlight)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '24_deep_to_ocean_mid_bubbles.png') });
  console.log('Captured: 24_deep_to_ocean_mid_bubbles.png');

  // Surface breach & horizon reveal window (t ~ 3.2s)
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '25_deep_to_ocean_breach.png') });
  console.log('Captured: 25_deep_to_ocean_breach.png');

  // Wait for return to canonical Ocean
  await page.waitForSelector('.scribble-start-btn', { timeout: 10000 });
  await sleep(1500);
  await page.screenshot({ path: path.join(outDir, '26_ocean_deep_returned.png') });
  console.log('Captured: 26_ocean_deep_returned.png');

  console.log('All routes, loops, and dedicated AI transitions tested successfully.');
  await browser.close();
}

run().catch(err => {
  console.error('Fatal error running inspection:', err);
  process.exit(1);
});
