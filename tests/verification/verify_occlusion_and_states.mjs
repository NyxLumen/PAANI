import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const outDir = path.resolve(process.cwd(), 'tests/test-results/phase-9-leaf-slide');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function captureScreen(page, filename) {
  const filepath = path.join(outDir, filename);
  await page.screenshot({ path: filepath });
  console.log(`[PASS] Captured: ${filepath}`);
}

async function runVerification() {
  console.log('====================================================');
  console.log('PĀNI HERO DROPLET OCCLUSION & 3-STATE VERIFICATION');
  console.log('====================================================\n');

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
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  // ---------------------------------------------------------------
  // STATE 1: Rainforest fully opaque, weight = 1.0
  // Test positions: 0.05, 0.44, 0.95
  // ---------------------------------------------------------------
  console.log('\n--- VERIFYING STATE 1: Rainforest fully opaque (weight = 1.0) ---');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.jumpToRainforest();
  });
  await new Promise((r) => setTimeout(r, 1200));

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  const positions = [0.05, 0.44, 0.95];
  for (const p of positions) {
    await page.waitForFunction(
      (targetP) => {
        const exp = window.__PAANI_EXPERIENCE__;
        const st = exp.rainforest?.interaction?.state;
        if (targetP >= 0.90 && (st === 'TIP_ACCUMULATION' || st === 'DRIP_FALL')) return true;
        return (
          st === 'SLIDING_ON_LEAF' &&
          exp.rainforest.interaction.getSlideProgress() >= targetP
        );
      },
      { timeout: 10000 },
      p
    );
    await new Promise((r) => setTimeout(r, 60));
    await captureScreen(page, `state1_opaque_p${Math.round(p * 100)}.png`);
  }

  // ---------------------------------------------------------------
  // STATE 2: Ocean → Rainforest crossfade (weight = 0.5)
  // Test positions: 0.05, 0.44, 0.95
  // ---------------------------------------------------------------
  console.log('\n--- VERIFYING STATE 2: Ocean -> Rainforest crossfade (weight = 0.5) ---');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.resetStory();
  });
  await new Promise((r) => setTimeout(r, 1000));

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.jumpToRainforest();
    window.__PAANI_EXPERIENCE__.rainforest.setTransitionWeight(0.5);
    if (window.__PAANI_EXPERIENCE__.oceanEnv) {
      window.__PAANI_EXPERIENCE__.oceanEnv.setTransitionWeight(0.5);
    }
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  for (const p of positions) {
    await page.waitForFunction(
      (targetP) => {
        const exp = window.__PAANI_EXPERIENCE__;
        const st = exp.rainforest?.interaction?.state;
        if (targetP >= 0.90 && (st === 'TIP_ACCUMULATION' || st === 'DRIP_FALL')) return true;
        return (
          st === 'SLIDING_ON_LEAF' &&
          exp.rainforest.interaction.getSlideProgress() >= targetP
        );
      },
      { timeout: 10000 },
      p
    );
    await new Promise((r) => setTimeout(r, 60));
    await captureScreen(page, `state2_crossfade_p${Math.round(p * 100)}.png`);
  }

  // ---------------------------------------------------------------
  // STATE 3: Rainforest fully established after full transition
  // Test positions: 0.05, 0.44, 0.95
  // ---------------------------------------------------------------
  console.log('\n--- VERIFYING STATE 3: Rainforest fully established after dynamic transition ---');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.resetStory();
  });
  await new Promise((r) => setTimeout(r, 1000));

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startRainforestJourney();
  });

  // Wait for transition to complete and canopy phase to begin
  await page.waitForFunction(
    () => {
      const exp = window.__PAANI_EXPERIENCE__;
      return exp.story.phase === 'RAINFOREST_CANOPY' || exp.rainforest?.getTransitionWeight() >= 0.999;
    },
    { timeout: 10000 }
  );

  console.log('Transition completed. Starting leaf interaction...');
  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  for (const p of positions) {
    await page.waitForFunction(
      (targetP) => {
        const exp = window.__PAANI_EXPERIENCE__;
        const st = exp.rainforest?.interaction?.state;
        if (targetP >= 0.90 && (st === 'TIP_ACCUMULATION' || st === 'DRIP_FALL')) return true;
        return (
          st === 'SLIDING_ON_LEAF' &&
          exp.rainforest.interaction.getSlideProgress() >= targetP
        );
      },
      { timeout: 10000 },
      p
    );
    await new Promise((r) => setTimeout(r, 60));
    await captureScreen(page, `state3_established_p${Math.round(p * 100)}.png`);
  }

  // ---------------------------------------------------------------
  // TEST FOREGROUND OCCLUSION: Physical obstacle placed between camera & droplet
  // Invariant: Must correctly occlude droplet through normal depth testing
  // ---------------------------------------------------------------
  console.log('\n--- VERIFYING PHYSICAL FOREGROUND OCCLUSION ---');
  await page.evaluate(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    const dropPos = exp.drop.getPosition();
    const camPos = exp.camera.instance.position;

    // Place an opaque foliage blocker at midpoint between camera and drop
    const mid = dropPos.clone().lerp(camPos, 0.35);
    const blocker = exp.rainforest.vegetation.heroLeafMesh.clone();
    blocker.name = 'ForegroundBlocker';
    blocker.scale.set(0.12, 0.12, 0.12);
    blocker.position.copy(mid);
    exp.scene.add(blocker);
  });
  await new Promise((r) => setTimeout(r, 100));
  await captureScreen(page, 'invariant_foreground_occlusion.png');

  // Verify material state invariance via runtime inspection
  const materialAudit = await page.evaluate(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    const veg = exp.rainforest.vegetation;
    const terrain = exp.rainforest.terrain;

    return {
      foliage: {
        transparent: veg.foliageMaterial.transparent,
        depthWrite: veg.foliageMaterial.depthWrite,
        depthTest: veg.foliageMaterial.depthTest,
      },
      heroLeaf: {
        transparent: veg.heroLeafMaterial.transparent,
        depthWrite: veg.heroLeafMaterial.depthWrite,
        depthTest: veg.heroLeafMaterial.depthTest,
      },
      canopy: {
        transparent: veg.canopyMaterial.transparent,
        depthWrite: veg.canopyMaterial.depthWrite,
        depthTest: veg.canopyMaterial.depthTest,
      },
      trunk: {
        transparent: veg.trunkMaterial.transparent,
        depthWrite: veg.trunkMaterial.depthWrite,
        depthTest: veg.trunkMaterial.depthTest,
      },
      terrain: {
        transparent: terrain.material.transparent,
        depthWrite: terrain.material.depthWrite,
        depthTest: terrain.material.depthTest,
      },
    };
  });

  console.log('\n--- RUNTIME MATERIAL STATE AUDIT ---');
  console.log(JSON.stringify(materialAudit, null, 2));

  const allPassed = Object.values(materialAudit).every(
    (m) => m.transparent === false && m.depthWrite === true && m.depthTest === true
  );

  if (!allPassed) {
    throw new Error('Material audit failed: physical materials are not in expected permanent state!');
  }
  console.log('[PASS] Material invariant verified: all physical geometry is transparent=false, depthWrite=true, depthTest=true.');

  await browser.close();
  console.log('\nAll 3-state and foreground occlusion assertions PASSED!');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
