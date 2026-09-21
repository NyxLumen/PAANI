import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('diag_results');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log('=== RUNNING PRE-START DIAGNOSTIC ===');
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

  page.on('console', (msg) => {
    console.log(`[Browser Console]: ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    errors.push(err.message);
    console.error(`[Browser Page Error]: ${err.message}`);
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });

  for (let s = 1; s <= 15; s++) {
    await new Promise((r) => setTimeout(r, 1000));
    const state = await page.evaluate(() => {
      const exp = window.__PAANI_EXPERIENCE__;
      if (!exp) return { error: 'no exp' };
      return {
        phase: exp.story?.phase,
        storyTimer: exp.story?.timer,
        physicsState: exp.physics?.state,
        dropY: exp.physics?.position?.y,
        camPos: {
          x: exp.camera?.instance?.position?.x,
          y: exp.camera?.instance?.position?.y,
          z: exp.camera?.instance?.position?.z,
        },
        camMode: exp.camera?.mode,
        clockElapsed: exp.clock?.getElapsed(),
        oceanTime: exp.ocean?.material?.uniforms?.uTime?.value,
      };
    });
    console.log(`[Second ${s}]:`, JSON.stringify(state));
    if (s % 3 === 0 || s === 1) {
      await page.screenshot({ path: path.join(outDir, `diag_sec_${s}.png`) });
    }
  }

  await browser.close();
  console.log('=== DIAGNOSTIC FINISHED ===');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
