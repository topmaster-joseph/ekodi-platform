import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [portalHtml, adminHtml, registryText, headers] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../admin.html', import.meta.url), 'utf8'),
  readFile(new URL('../service-registry.json', import.meta.url), 'utf8'),
  readFile(new URL('../_headers', import.meta.url), 'utf8')
]);

function assertUniqueIds(html, label) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate HTML id found in ${label}`);
}

test('public portal and admin console keep one external script each', () => {
  assertUniqueIds(portalHtml, 'public portal');
  assertUniqueIds(adminHtml, 'admin console');
  assert.equal((portalHtml.match(/<script\b/g) || []).length, 1);
  assert.equal((adminHtml.match(/<script\b/g) || []).length, 1);
  assert.match(portalHtml, /<script src="portal\.js" defer><\/script>/);
  assert.match(adminHtml, /<script src="script\.js"><\/script>/);
});

test('public portal does not hard-code clickable service URLs', () => {
  assert.doesNotMatch(portalHtml, /href="https:\/\/(?:biz|mall|books|church|lab|admin)\.ekodi\.kr/);
});

test('unverified services remain explicitly QA-gated', () => {
  const registry = JSON.parse(registryText);
  const requiredLocked = ['biz', 'trade', 'pay', 'mission', 'community', 'edu', 'media', 'admin'];
  for (const id of requiredLocked) {
    const service = registry.services.find(item => item.id === id);
    assert.ok(service, `missing registry service: ${id}`);
    assert.equal(service.qaVerified, false, `${id} must stay locked until QA approval`);
  }
});

test('production UI does not expose removed simulated workflows', () => {
  assert.doesNotMatch(adminHtml, /seoyeon\.lee|junho\.park|minji\.choi/);
  assert.doesNotMatch(adminHtml, /승인된 사용자|가입 요청/);
});

test('CSP disallows inline scripts', () => {
  const policy = headers.split('\n').find(line => line.includes('Content-Security-Policy')) || '';
  const scriptDirective = policy.split(';').find(part => part.trim().startsWith('script-src')) || '';
  assert.match(scriptDirective, /script-src 'self'/);
  assert.doesNotMatch(scriptDirective, /unsafe-inline/);
});
