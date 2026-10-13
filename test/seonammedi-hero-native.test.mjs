import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('sites/seonammedi/public/index.html');
const css=read('sites/seonammedi/public/app.css');
const browser=read('scripts/verify-seonammedi-hero-native.mjs');
const workflow=read('.github/workflows/verify-seonammedi-hero-native.yml');
const image=fs.readFileSync(new URL('../sites/seonammedi/public/assets/campaign-reconsideration-20261013.png',import.meta.url));

test('submitted campaign banner is preserved as a byte-identical local site asset',()=>{
  const digest=crypto.createHash('sha256').update(image).digest('hex');
  assert.equal(digest,'3d30b3faa1db1eeb075a4af8b25887000204ebb26c92f6640c5d70be7205c324');
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),1903);
  assert.equal(image.readUInt32BE(20),735);
  assert.match(html,/class="campaign-hero-image" src="\/seonammedi\/assets\/campaign-reconsideration-20261013\.png"/);
  assert.match(html,/fetchpriority="high"/);
  assert.match(html,/property="og:image:width" content="1903"/);
  assert.match(html,/property="og:image:height" content="735"/);
  assert.match(html,/id="homeSpotlight"/);
  assert.match(html,/id="homeLatestUpdates"/);
});

test('responsive artwork is full-width and not cropped',()=>{
  assert.match(css,/\.campaign-hero-image\s*\{/);
  assert.match(css,/max-width:1903px/);
  assert.match(css,/height:auto/);
  assert.match(css,/object-fit:contain/);
  assert.match(html,/class="campaign-hero-mobile-hint"/);
});

test('EKODI-owned native browser checks image bytes and geometry on two viewports',()=>{
  assert.match(browser,/from 'playwright'/);
  assert.match(browser,/name:'desktop',width:1440/);
  assert.match(browser,/name:'mobile',width:390/);
  assert.match(browser,/naturalWidth===1903&&entry\.naturalHeight===735/);
  assert.match(browser,/assetSha256===expectedSha/);
  assert.match(browser,/horizontalOverflow/);
  assert.match(browser,/expectedBrowserPath/);
  assert.match(browser,/assetPath\.replace\(\/\^\\\/seonammedi\//);
  assert.match(browser,/await page\.screenshot/);
  assert.match(browser,/readOnly:true/);
  assert.doesNotMatch(browser,/tinyfish|selenium-grid|userDataDir|persistentContext|remoteDesktop/i);
});

test('guarded production release has an automatic first-party browser witness',()=>{
  assert.match(workflow,/name: SeonamMedi Native Hero Browser Verification/);
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/Deploy EKODI Shared Site Core/);
  assert.match(workflow,/source-and-local-browser:/);
  assert.match(workflow,/production-native-browser:/);
  assert.match(workflow,/--origin=https:\/\/ekodi\.kr/);
  assert.match(workflow,/--origin=https:\/\/seonammedi\.kr/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.match(workflow,/node --test test\/seonammedi-hero-native\.test\.mjs/);
});
