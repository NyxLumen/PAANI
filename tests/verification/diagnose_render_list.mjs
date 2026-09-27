import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { resolveBrowserExecutable } from './browser_helper.mjs';

async function run() {
  console.log('=== INSPECTING THREE.JS RENDER LIST ORDER ===');
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

  await page.waitForFunction(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    return exp.rainforest?.interaction?.state === 'SLIDING_ON_LEAF' &&
           exp.rainforest.interaction.getSlideProgress() > 0.70;
  }, { timeout: 10000 });

  const renderListInfo = await page.evaluate(() => {
    const exp = window.__PAANI_EXPERIENCE__;
    const renderer = exp.renderer.instance;
    const scene = exp.scene;
    const camera = exp.camera.instance;

    // Hook into render lists
    // Three.js WebGLRenderer stores renderLists in an internal WeakMap or property
    // We can also inspect scene children or hook renderer.render
    const transparentObjects = [];
    const opaqueObjects = [];

    scene.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh || obj.isPoints) {
        const mat = obj.material;
        const entry = {
          name: obj.name || obj.constructor.name,
          type: obj.type,
          renderOrder: obj.renderOrder,
          transparent: mat ? mat.transparent : false,
          depthWrite: mat ? mat.depthWrite : false,
          depthTest: mat ? mat.depthTest : false,
          side: mat ? mat.side : null,
          worldPos: obj.getWorldPosition(new obj.position.constructor()),
          isHeroLeaf: obj === exp.rainforest.vegetation.heroLeafMesh,
          isDrop: obj === exp.drop.mesh,
        };

        // Compute distance to camera
        entry.distToCamera = camera.position.distanceTo(entry.worldPos);

        if (mat && mat.transparent) {
          transparentObjects.push(entry);
        } else {
          opaqueObjects.push(entry);
        }
      }
    });

    // In Three.js, how does it sort transparent objects?
    // Let's inspect the actual Three.js current render list if accessible
    // In Three.js, renderer.renderLists.get(scene, 0)
    let actualTransparentOrder = [];
    let actualOpaqueOrder = [];
    try {
      const renderLists = renderer.renderLists;
      if (renderLists) {
        const currentList = renderLists.get(scene, 0);
        if (currentList) {
          actualTransparentOrder = currentList.transparent.map(item => ({
            id: item.id,
            renderOrder: item.renderOrder,
            z: item.z,
            objectName: item.object.name || item.object.type,
            isHeroLeaf: item.object === exp.rainforest.vegetation.heroLeafMesh,
            isDrop: item.object === exp.drop.mesh,
            transparent: item.material.transparent,
            depthWrite: item.material.depthWrite,
          }));
          actualOpaqueOrder = currentList.opaque.map(item => ({
            id: item.id,
            renderOrder: item.renderOrder,
            z: item.z,
            objectName: item.object.name || item.object.type,
            isHeroLeaf: item.object === exp.rainforest.vegetation.heroLeafMesh,
            isDrop: item.object === exp.drop.mesh,
            transparent: item.material.transparent,
            depthWrite: item.material.depthWrite,
          }));
        }
      }
    } catch (e) {
      console.error(e);
    }

    return {
      camPos: camera.position,
      dropPos: exp.drop.getPosition(),
      actualTransparentOrder,
      actualOpaqueOrder,
      allTransparent: transparentObjects,
      allOpaque: opaqueObjects,
    };
  });

  console.log('Render List Diagnostic Results:');
  console.log('Actual Transparent Order in Three.js:\n', JSON.stringify(renderListInfo.actualTransparentOrder, null, 2));
  console.log('Actual Opaque Order in Three.js:\n', JSON.stringify(renderListInfo.actualOpaqueOrder, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
