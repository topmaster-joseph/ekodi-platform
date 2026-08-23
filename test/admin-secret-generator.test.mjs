import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator = fs.readFileSync(new URL('../admin-secret-generator.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const build = fs.readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');


test('secret generator uses Web Crypto with strong presets', () => {
  assert.match(generator, /crypto\.getRandomValues\(bytes\)/);
  assert.doesNotMatch(generator, /Math\.random/);
  assert.match(generator, /DEFAULT_BYTES = 48/);
  assert.match(generator, /new Set\(\[32, 48, 64\]\)/);
  assert.match(generator, /replace\(\/\\\+\/g, '-'\)/);
});


test('generated secret stays local and is not persisted or transmitted', () => {
  assert.doesNotMatch(generator, /\bfetch\s*\(/);
  assert.doesNotMatch(generator, /XMLHttpRequest/);
  assert.doesNotMatch(generator, /localStorage/);
  assert.doesNotMatch(generator, /sessionStorage/);
  assert.doesNotMatch(generator, /console\./);
  assert.doesNotMatch(generator, /sendBeacon/);
});


test('secret display lifetime is bounded and clears on navigation away', () => {
  assert.match(generator, /DISPLAY_TTL_MS = 30_000/);
  assert.match(generator, /COPY_TTL_MS = 5_000/);
  assert.match(generator, /document\.addEventListener\('visibilitychange'/);
  assert.match(generator, /window\.addEventListener\('pagehide'/);
  assert.match(generator, /activeSecret = ''/);
  assert.match(generator, /output\.value = ''/);
});


test('Security menu is lazy-loaded and build publishes only the requested assets', () => {
  assert.match(loader, /security:\s*\{/);
  assert.match(loader, /styles: \['admin-secret-generator\.css'\]/);
  assert.match(loader, /scripts: \['admin-secret-generator\.js'\]/);
  assert.match(loader, /hashes: \['#security'\]/);
  assert.match(menu, /'#security', 'security'/);
  assert.match(menu, /'health', 'security', 'marketing-ai'/);
  assert.match(build, /'admin-secret-generator\.css','admin-secret-generator\.js'/);
});


test('Cloudflare application remains an explicit human action', () => {
  assert.match(generator, /https:\/\/dash\.cloudflare\.com\//);
  assert.match(generator, /Cloudflare에 자동 등록하지 않으며/);
  assert.doesNotMatch(generator, /api\.cloudflare\.com/);
});
