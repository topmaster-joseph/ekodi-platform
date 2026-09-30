import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');
const production = read('.github/workflows/production-gate.yml');
const quotaConfig = JSON.parse(read('config/cloudflare-production-quota-guard.json'));
const canary = read('scripts/post-deploy-canary.mjs');
const http2 = read('.github/workflows/admin-http2-stability.yml');
const deploy = read('.github/workflows/deploy.yml');
const performance = read('.github/workflows/ecosystem-performance-watch.yml');

test('production verification is one deployment-triggered quota-aware canary', () => {
  assert.match(production, /workflow_run:/);
  assert.match(production, /Deploy EKODI Shared Site Core/);
  assert.match(production, /cloudflare-production-budget\.mjs/);
  assert.match(production, /post-deploy-canary\.mjs --scope=full/);
  assert.doesNotMatch(production, /cron:/);
  assert.doesNotMatch(production, /push:\s*\n\s*branches: \[main\]/);
  assert.match(production, /Upload production completion evidence/);
  assert.match(production, /production-verified-complete/);
});

test('canonical Admin and control health remain in the canary contract', () => {
  const admin = quotaConfig.canary.essential.find(check => check.id === 'admin');
  const control = quotaConfig.canary.essential.find(check => check.id === 'control-api');
  assert.equal(admin.url, 'https://ekodi.kr/admin/');
  assert.equal(admin.status, 200);
  assert.equal(admin.text, '<title>EKODI Admin</title>');
  assert.deepEqual(admin.header, { name: 'x-ekodi-route', contains: 'admin-shell' });
  assert.equal(control.url, 'https://ekodi.kr/health');
  assert.equal(control.status, 200);
  assert.ok(quotaConfig.canary.nonessential.some(check => check.url === 'https://ekodi.kr/jadam'));
  assert.ok(quotaConfig.canary.nonessential.some(check => check.url === 'https://ekodi.kr/pizzamaru'));
  assert.ok(quotaConfig.canary.nonessential.some(check => check.url === 'https://ekodi.kr/yogurt'));
  assert.ok(quotaConfig.canary.nonessential.some(check => check.url === 'https://ekodi.kr/ekodibiz/marketing-ai'));
  assert.doesNotMatch(JSON.stringify(quotaConfig), /admin\.ekodi\.kr|api\.ekodi\.kr/);
});

test('canary is sequential and fail-fast instead of retrying rate-limited production', () => {
  assert.match(canary, /for \(const check of checks\)/);
  assert.match(canary, /if \(circuitBreak\)/);
  assert.match(canary, /report\.circuitOpen = true/);
  assert.match(canary, /break;/);
  assert.doesNotMatch(canary, /Promise\.all/);
  assert.doesNotMatch(canary, /retry/i);
});

test('other Admin monitors still use the current shell marker', () => {
  for (const source of [http2, deploy, performance]) assert.match(source, /<title>EKODI Admin<\/title>/);
  assert.match(http2, /'admin-shell'/);
  assert.doesNotMatch(http2, /admin-control-center/);
});
