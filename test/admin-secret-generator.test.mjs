import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator = fs.readFileSync(new URL('../admin-secret-generator.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const menuRegistry = fs.readFileSync(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const build = fs.readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');


test('local fallback generator still uses Web Crypto with strong presets', () => {
  assert.match(generator, /crypto\.getRandomValues\(bytes\)/);
  assert.doesNotMatch(generator, /Math\.random/);
  assert.match(generator, /DEFAULT_BYTES = 48/);
  assert.match(generator, /new Set\(\[32, 48, 64\]\)/);
  assert.match(generator, /replace\(\/\\\+\/g, '-'\)/);
});


test('Cloudflare automatic mode sends only admin intent and never exposes generated value', () => {
  assert.match(generator, /\/api\/control\/secrets\/status/);
  assert.match(generator, /\/api\/control\/secrets\/generate/);
  assert.match(generator, /x-ekodi-confirm-impact/);
  assert.match(generator, /cloudflare-secret-create/);
  assert.match(generator, /비밀값 자체는 브라우저로 반환되지 않았습니다/);
  assert.match(generator, /서버에서 암호학적 난수를 만들고 Cloudflare Worker Secret으로 바로 등록/);
  assert.doesNotMatch(generator, /CLOUDFLARE_SECRET_MANAGER_TOKEN/);
  assert.doesNotMatch(generator, /api\.cloudflare\.com/);
  assert.doesNotMatch(generator, /localStorage/);
  assert.doesNotMatch(generator, /sendBeacon/);
});


test('existing Cloudflare secret requires a second explicit replace click', () => {
  assert.match(generator, /response\.status === 409/);
  assert.match(generator, /SECRET_ALREADY_EXISTS/);
  assert.match(generator, /replaceMode = true/);
  assert.match(generator, /기존 Secret 교체 승인/);
  assert.match(generator, /replace:replaceMode/);
});


test('local secret display lifetime remains bounded and clears on navigation away', () => {
  assert.match(generator, /DISPLAY_TTL_MS = 30_000/);
  assert.match(generator, /COPY_TTL_MS = 5_000/);
  assert.match(generator, /document\.addEventListener\('visibilitychange'/);
  assert.match(generator, /window\.addEventListener\('pagehide'/);
  assert.match(generator, /activeSecret = ''/);
  assert.match(generator, /output\.value = ''/);
});


test('Security remains lazy-loaded inside the System work area and build publishes only requested assets', () => {
  assert.match(loader, /security:\s*\{/);
  assert.match(loader, /styles: \['admin-secret-generator\.css'\]/);
  assert.match(loader, /scripts: \['admin-secret-generator\.js'\]/);
  assert.match(loader, /hashes: \['#security'\]/);
  assert.match(menu, /#security:security/);
  assert.match(menuRegistry, /\{ id: 'system'[\s\S]*defaultSection: 'health'/);
  assert.match(menuRegistry, /\{ id: 'health', group: 'system'/);
  assert.match(menuRegistry, /\{ id: 'security', group: 'system'/);
  assert.match(menuRegistry, /\{ id: 'marketing-ai', group: 'ai'/);
  assert.match(build, /'admin-secret-generator\.css','admin-secret-generator\.js'/);
});