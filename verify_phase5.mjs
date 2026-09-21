import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test_results_phase5');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function verify() {
  console.log('=== PĀNI PHASE 5 WATER INTERACTION VERIFICATION ===');
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
    // console.log(`[Browser Console]: ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    errors.push(err.message);
    console.error(`[Browser Page Error]: ${err.message}`);
  });

  console.log('1. Navigating to http://localhost:3000/ ...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  // 1. Ocean Opening
  console.log('2. Capturing 01_ocean_opening.png...');
  await page.screenshot({ path: path.join(outDir, '01_ocean_opening.png') });

  // 2. Open Debug Telemetry Panel
  console.log('3. Opening Debug Telemetry Panel (D key)...');
  await page.keyboard.press('d');
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outDir, '02_telemetry_panel.png') });

  // 3. Click Start for Drop Reveal
  console.log('4. Clicking Start button for Drop Reveal...');
  const startBtn = await page.$('.cinematic-start-btn');
  if (startBtn) {
    await startBtn.click();
  }

  // 4. Drop Reveal (macro focus on drop hovering in morning light)
  console.log('5. Waiting for Drop Reveal state...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp && exp.story && exp.story.phase === 'REVEAL';
  }, { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 1200));
  console.log('   Capturing 03_drop_reveal.png...');
  await page.screenshot({ path: path.join(outDir, '03_drop_reveal.png') });

  // 5. Descent: wait until drop is falling through air (y between 1.5 and 2.5)
  console.log('6. Waiting for Mid-Air Descent (y ~ 2.0m)...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp && exp.physics && exp.physics.state === 'FALLING' && exp.physics.position.y < 2.8 && exp.physics.position.y > 0.8;
  }, { timeout: 10000 });
  console.log('   Capturing 04_drop_descent.png...');
  await page.screenshot({ path: path.join(outDir, '04_drop_descent.png') });

  // 6. Surface Impact / Meniscus / Crown
  console.log('7. Waiting for IMPACTING state...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp && exp.physics && (exp.physics.state === 'IMPACTING' || exp.physics.state === 'UNDERWATER');
  }, { timeout: 5000 });
  console.log('   Capturing 05_surface_contact_meniscus.png...');
  await page.screenshot({ path: path.join(outDir, '05_surface_contact_meniscus.png') });

  // 7. Peak splash & ripples (wait 150ms)
  await new Promise((r) => setTimeout(r, 150));
  console.log('   Capturing 06_splash_crown_lobes.png...');
  await page.screenshot({ path: path.join(outDir, '06_splash_crown_lobes.png') });

  // 8. Fluid Surface Merging & Ripples (wait 250ms)
  await new Promise((r) => setTimeout(r, 250));
  console.log('   Capturing 07_fluid_surface_merging.png...');
  await page.screenshot({ path: path.join(outDir, '07_fluid_surface_merging.png') });

  // 9. Surface Ripples & Transient Foam
  await new Promise((r) => setTimeout(r, 400));
  console.log('   Capturing 08_surface_ripples_foam.png...');
  await page.screenshot({ path: path.join(outDir, '08_surface_ripples_foam.png') });

  // 10. Deep Underwater Volume & Micro-Bubbles
  console.log('10. Waiting for Deep Underwater state (y < -2.0m)...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp && exp.physics && exp.physics.state === 'UNDERWATER' && exp.physics.position.y < -1.8;
  }, { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 600));
  console.log('   Capturing 09_underwater_bubbles_descent.png...');
  await page.screenshot({ path: path.join(outDir, '09_underwater_bubbles_descent.png') });

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

  // 11. Resize test (ultra-wide 2560x1080)
  console.log('11. Testing ultra-wide layout (2560x1080)...');
  await page.setViewport({ width: 2560, height: 1080 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, '10_ultrawide_2560x1080_interaction.png') });

  await browser.close();

  console.log('=== VERIFICATION COMPLETED ===');
  console.log('Errors encountered:', errors.length);
  return { errors, telemetry };
}

verify().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
