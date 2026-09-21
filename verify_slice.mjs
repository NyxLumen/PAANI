import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test_results');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function verify() {
  console.log('=== PĀNI 3D VERTICAL SLICE 01 VERIFICATION ===');
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
    console.log(`[Browser Console ${msg.type()}]: ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    errors.push(err.message);
    console.error(`[Browser Page Error]: ${err.message}`);
  });

  console.log('1. Navigating to http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  // 1. Ocean Opening
  console.log('2. Verifying Ocean Opening...');
  await page.screenshot({ path: path.join(outDir, '01_ocean_opening.png') });

  // 2. Open Debug Telemetry Panel
  console.log('3. Opening Debug Telemetry Panel...');
  await page.keyboard.press('d');
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outDir, '02_telemetry_panel.png') });

  // 3. Click Start to trigger Drop Reveal
  console.log('4. Clicking Start button for Drop Reveal...');
  const startBtn = await page.$('.cinematic-start-btn');
  if (startBtn) {
    await startBtn.click();
  }

  // At 1.6s: Drop is framed in macro focus hovering in morning light
  await new Promise((r) => setTimeout(r, 1600));
  console.log('5. Capturing Drop Reveal...');
  await page.screenshot({ path: path.join(outDir, '03_drop_reveal.png') });

  // Fall starts at 3.2s. At 3.7s, drop is falling through the air (y ~ 2.0m)
  await new Promise((r) => setTimeout(r, 2100));
  console.log('6. Capturing Droplet Mid-Air Descent...');
  await page.screenshot({ path: path.join(outDir, '04_drop_descent.png') });

  // At 4.3s: Surface impact
  await new Promise((r) => setTimeout(r, 600));
  console.log('7. Capturing Surface Impact & Ripples...');
  await page.screenshot({ path: path.join(outDir, '05_surface_impact.png') });

  // At 5.8s: Camera plunged underwater, following the drop into deep volume
  await new Promise((r) => setTimeout(r, 1500));
  console.log('8. Capturing Underwater Volume, Snell Window & God Rays...');
  await page.screenshot({ path: path.join(outDir, '06_underwater_volume.png') });

  // Read telemetry metrics from DOM
  const telemetry = await page.evaluate(() => {
    const items = document.querySelectorAll('.debug-item');
    const result = {};
    items.forEach((item) => {
      const label = item.querySelector('.debug-label')?.textContent?.trim();
      const val = item.querySelector('.debug-value')?.textContent?.trim();
      if (label && val) result[label] = val;
    });
    return result;
  });
  console.log('Telemetry summary:', telemetry);

  // Resize test (ultra-wide 2560x1080)
  console.log('9. Testing resize behavior (2560x1080)...');
  await page.setViewport({ width: 2560, height: 1080 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, '07_ultrawide_underwater.png') });

  await browser.close();

  console.log('=== VERIFICATION COMPLETED ===');
  console.log('Errors encountered:', errors.length);
  return { errors, telemetry };
}

verify().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
