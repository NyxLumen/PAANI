import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test_results');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log('Launching Chromium for browser verification...');
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

  console.log('Navigating to http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // 1. Ocean Opening
  await page.screenshot({ path: path.join(outDir, '01_ocean.png') });
  console.log('Captured: 01_ocean.png');

  // 2. Click START
  console.log('Clicking START...');
  await page.click('.scribble-start-btn');

  // Capture mid-dive transition (t = 1.6s)
  await new Promise(r => setTimeout(r, 1600));
  await page.screenshot({ path: path.join(outDir, '02_dive_transition.png') });
  console.log('Captured: 02_dive_transition.png');

  // Wait for Intro
  await page.waitForSelector('.intro-narrative-text', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, '03_underwater_intro.png') });
  console.log('Captured: 03_underwater_intro.png');

  // Wait for Choice
  await page.waitForSelector('.choice-options-wrapper', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outDir, '04_choice.png') });
  console.log('Captured: 04_choice.png');

  // Hover FOLLOW THE SHORE
  console.log('Hovering FOLLOW THE SHORE...');
  await page.hover('.choice-left');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, '05_hover_shore.png') });
  console.log('Captured: 05_hover_shore.png');

  // Click FOLLOW THE SHORE
  console.log('Clicking FOLLOW THE SHORE...');
  await page.click('.choice-left');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '06_shore_transition.png') });
  console.log('Captured: 06_shore_transition.png');

  // Wait for Shore destination
  await page.waitForSelector('.destination-rise-btn', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, '07_shore.png') });
  console.log('Captured: 07_shore.png');

  // Click RISE -> Cloud Ascent
  console.log('Clicking RISE into cloud ascent...');
  await page.click('.destination-rise-btn');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '08_ascent_transition.png') });
  console.log('Captured: 08_ascent_transition.png');

  await page.waitForSelector('.cycle-continuation-btn', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '09_cloud_ascent.png') });
  console.log('Captured: 09_cloud_ascent.png');

  // Click GATHER -> Clouds
  console.log('Clicking GATHER into clouds...');
  await page.click('.cycle-continuation-btn');
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, '10_clouds_transition.png') });
  console.log('Captured: 10_clouds_transition.png');

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, '11_clouds.png') });
  console.log('Captured: 11_clouds.png');

  // Click RELEASE -> Rain
  console.log('Clicking RELEASE into rain...');
  await page.click('.cycle-continuation-btn');
  await new Promise(r => setTimeout(r, 1100));
  await page.screenshot({ path: path.join(outDir, '12_rain_transition.png') });
  console.log('Captured: 12_rain_transition.png');

  await new Promise(r => setTimeout(r, 1400));
  await page.screenshot({ path: path.join(outDir, '13_rain.png') });
  console.log('Captured: 13_rain.png');

  // Click REJOIN THE OCEAN -> Ocean Return
  console.log('Clicking REJOIN THE OCEAN...');
  await page.click('.cycle-continuation-btn');
  await new Promise(r => setTimeout(r, 1300));
  await page.screenshot({ path: path.join(outDir, '14_ocean_return_mid.png') });
  console.log('Captured: 14_ocean_return_mid.png');

  // Wait for Ocean to settle
  await page.waitForSelector('.scribble-start-btn', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, '15_ocean_landed.png') });
  console.log('Captured: 15_ocean_landed.png');

  // Test Deep Route: Click START -> Wait Choice -> Click DESCEND
  console.log('Testing Deep route...');
  await page.click('.scribble-start-btn');
  await page.waitForSelector('.choice-options-wrapper', { timeout: 12000 });
  await page.hover('.choice-right');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, '16_hover_deep.png') });
  console.log('Captured: 16_hover_deep.png');

  await page.click('.choice-right');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '17_deep_transition.png') });
  console.log('Captured: 17_deep_transition.png');

  await page.waitForSelector('.destination-title', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, '18_deep.png') });
  console.log('Captured: 18_deep.png');

  console.log('All routes inspected successfully!');
  await browser.close();
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
