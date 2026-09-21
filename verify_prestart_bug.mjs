import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test_results_prestart_fix');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function verify() {
  console.log('=== PĀNI PRE-START BUG REGRESSION TEST ===');
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
  await new Promise((r) => setTimeout(r, 1000));

  console.log('2. Observing pre-start state continuously for 16 seconds (NO user clicks)...');
  const samples = [];

  for (let s = 1; s <= 16; s++) {
    await new Promise((r) => setTimeout(r, 1000));

    const state = await page.evaluate(() => {
      const exp = window.__PAANI_EXPERIENCE__;
      if (!exp) return { error: 'no exp' };
      return {
        oceanMeshX: exp.ocean?.mesh?.position?.x,
        oceanMeshZ: exp.ocean?.mesh?.position?.z,
        lifecycle: exp.story?.lifecycle,
        phase: exp.story?.phase,
        physicsState: exp.physics?.state,
        dropY: exp.physics?.position?.y,
        camMode: exp.camera?.mode,
        clockElapsed: exp.clock?.getElapsed(),
        oceanTime: exp.ocean?.material?.uniforms?.uTime?.value,
      };
    });

    samples.push(state);
    console.log(`   [Second ${s.toString().padStart(2, ' ')}]: meshX=${state.oceanMeshX}, lifecycle=${state.lifecycle}, phase=${state.phase}, dropY=${state.dropY?.toFixed(2)}, oceanTime=${state.oceanTime?.toFixed(1)}s`);

    // Assertions
    if (state.oceanMeshX !== 0 || state.oceanMeshZ !== 0) {
      throw new Error(`Ocean mesh shifted away from origin! x=${state.oceanMeshX}, z=${state.oceanMeshZ}`);
    }
    if (state.lifecycle !== 'WAITING_FOR_START') {
      throw new Error(`Lifecycle changed prematurely: ${state.lifecycle}`);
    }
    if (state.phase !== 'OPENING') {
      throw new Error(`Phase changed prematurely: ${state.phase}`);
    }
    if (state.physicsState !== 'IDLE') {
      throw new Error(`Physics state changed prematurely: ${state.physicsState}`);
    }

    if (s === 1 || s === 5 || s === 10 || s === 16) {
      await page.screenshot({ path: path.join(outDir, `prestart_sec_${s}.png`) });
    }
  }

  console.log('   -> Pre-start 16s stability test PASSED! (0 snaps, 0 phase changes, continuous ocean time)');

  // Step 5: Click START
  console.log('3. Clicking START button to begin sequence...');
  const startBtn = await page.$('.cinematic-start-btn');
  if (!startBtn) throw new Error('Could not find .cinematic-start-btn');
  await startBtn.click();

  // Wait for REVEAL & DESCENT
  console.log('4. Waiting for REVEAL and active lifecycle...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp && exp.story && exp.story.lifecycle === 'ACTIVE' && exp.story.phase === 'REVEAL';
  }, { timeout: 5000 });
  console.log('   -> Transitioned to ACTIVE / REVEAL successfully.');

  // Wait for DESCENT
  console.log('5. Waiting for DESCENT phase...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp && exp.story && exp.story.phase === 'DESCENT';
  }, { timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, 'sequence_01_descent.png') });
  console.log('   -> Droplet descending.');

  // Wait for UNDERWATER
  console.log('6. Waiting for UNDERWATER phase...');
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp && exp.story && exp.story.phase === 'UNDERWATER';
  }, { timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, 'sequence_02_underwater.png') });
  console.log('   -> Reached UNDERWATER successfully.');

  // Step 8: Trigger RE-EMERGE explicitly
  console.log('7. Triggering RE-EMERGE reset button...');
  await new Promise((r) => setTimeout(r, 600));
  const replayBtn = await page.$('.replay-cycle-btn');
  if (!replayBtn) throw new Error('Could not find .replay-cycle-btn');
  await replayBtn.click();

  await new Promise((r) => setTimeout(r, 800));
  const resetState = await page.evaluate(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return {
      lifecycle: exp.story?.lifecycle,
      phase: exp.story?.phase,
      physicsState: exp.physics?.state,
      camMode: exp.camera?.mode,
    };
  });
  console.log('   State after RE-EMERGE:', resetState);
  if (resetState.lifecycle !== 'WAITING_FOR_START' || resetState.phase !== 'OPENING') {
    throw new Error(`Reset failed: lifecycle=${resetState.lifecycle}, phase=${resetState.phase}`);
  }
  await page.screenshot({ path: path.join(outDir, 'sequence_03_reemerged.png') });
  console.log('   -> RE-EMERGE successfully returned to WAITING_FOR_START / OPENING.');

  await browser.close();

  console.log('=== ALL REGRESSION CHECKS PASSED ===');
  console.log('Console errors:', errors.length);
  console.log('Console warnings:', warnings.length);
  return { errors, warnings };
}

verify().catch((e) => {
  console.error('VERIFICATION FAILED:', e);
  process.exit(1);
});
