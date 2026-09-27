import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

const outDir = path.resolve(process.cwd(), 'tests/test-results/diagnostics');

async function runTest(testName, testFn) {
  console.log(`\n=================== RUNNING ${testName} ===================`);
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

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.jumpToRainforest();
  });
  await new Promise((r) => setTimeout(r, 1500));

  await page.evaluate(() => {
    window.__PAANI_EXPERIENCE__.startLeafInteraction();
  });

  // Deterministically wait for SLIDING_ON_LEAF with slideProgress > 0.70
  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.rainforest?.interaction?.state === 'SLIDING_ON_LEAF' &&
           exp.rainforest.interaction.getSlideProgress() > 0.70;
  }, { timeout: 10000 });

  // Re-apply diagnostic modification right at the snapshot moment
  await page.evaluate(testFn);
  await new Promise((r) => setTimeout(r, 100));
  await page.evaluate(testFn);

  const filename = `${testName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_1400ms.png`;
  const destLocal = path.join(outDir, filename);
  await page.screenshot({ path: destLocal });
  console.log(`Saved screenshot: ${filename}`);

  // Also take one at 800ms on a second step if helpful
  const info = await page.evaluate(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return {
      dropPos: exp.drop.getPosition(),
      camPos: exp.camera.instance.position,
      dropVisible: exp.drop.mesh.visible,
      dropDepthTest: exp.drop.material.depthTest,
      dropDepthWrite: exp.drop.material.depthWrite,
    };
  });
  console.log('Test Info:', info);

  await browser.close();
}

async function main() {
  // Test A: Normal current material
  await runTest('Test_A_Normal', () => {});

  // Test B: depthTest = false on drop
  await runTest('Test_B_DepthTest_False', () => {
    window.__PAANI_EXPERIENCE__.drop.material.depthTest = false;
  });

  // Test C: depthWrite = false on drop (Wait, drop already has depthWrite=false, what about depthWrite=true or leaf depthWrite=false?)
  await runTest('Test_C_DepthWrite_False', () => {
    window.__PAANI_EXPERIENCE__.drop.material.depthWrite = false;
  });

  // Test C2: drop depthWrite = true
  await runTest('Test_C2_Drop_DepthWrite_True', () => {
    window.__PAANI_EXPERIENCE__.drop.material.depthWrite = true;
  });

  // Test C3: heroLeaf depthWrite = false
  await runTest('Test_C3_HeroLeaf_DepthWrite_False', () => {
    window.__PAANI_EXPERIENCE__.rainforest.vegetation.heroLeafMesh.material.depthWrite = false;
  });

  // Test D: Disable transmission/refraction (replace drop with solid unshaded / opaque material)
  await runTest('Test_D_Disable_Transmission', () => {
    const drop = window.__PAANI_EXPERIENCE__.drop;
    const THREE = drop.mesh.position.constructor.prototype ? drop.mesh.material.constructor : null;
    // Turn drop into basic bright red material to see its exact geometry silhouette
    const prevMat = drop.material;
    drop.mesh.material = new prevMat.constructor({
      vertexShader: prevMat.vertexShader,
      fragmentShader: `
        void main() {
          gl_FragColor = vec4(1.0, 0.2, 0.2, 1.0);
        }
      `,
      uniforms: prevMat.uniforms,
      depthTest: true,
      depthWrite: true,
    });
  });

  // Test E: Surrounding rainforest geometry temporarily hidden (hide heroLeaf or hide all vegetation except drop)
  await runTest('Test_E_Hide_Rainforest_Geometry', () => {
    const veg = window.__PAANI_EXPERIENCE__.rainforest.vegetation;
    veg.group.visible = false;
  });

  // Test F: Wind strength = 0 on hero leaf
  await runTest('Test_F_No_Wind', () => {
    const leaf = window.__PAANI_EXPERIENCE__.rainforest.vegetation.heroLeafMesh;
    if (leaf.material.uniforms.uWindStrength) {
      leaf.material.uniforms.uWindStrength.value = 0.0;
    }
  });

  console.log('ALL DIAGNOSTIC TESTS COMPLETE!');
}

main().catch(console.error);
