import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, headers] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/_headers', import.meta.url), 'utf8')
]);

test('HTML has unique IDs and a single Vite TypeScript entry', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML id found');
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.match(html, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
});

test('production UI does not expose removed simulated workflows', () => {
  assert.doesNotMatch(html, /seoyeon\.lee|junho\.park|minji\.choi/);
  assert.doesNotMatch(html, /승인된 사용자|가입 요청/);
});

test('unauthenticated platform gate exposes login only', () => {
  const gate = html.match(/<div class="access-gate"[\s\S]*?<div class="app-shell"/)?.[0] || '';
  assert.match(gate, /EKODI 플랫폼 로그인/);
  assert.doesNotMatch(gate, /portal-grid/);
  assert.match(gate, /id="adminLoginForm"/);
});

test('internal platform is excluded from search indexing', () => {
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(headers, /X-Robots-Tag: noindex, nofollow, noarchive/i);
});

test('CSP disallows inline scripts', () => {
  const policy = headers.split('\n').find(line => line.includes('Content-Security-Policy')) || '';
  const scriptDirective = policy.split(';').find(part => part.trim().startsWith('script-src')) || '';
  assert.match(scriptDirective, /script-src 'self'/);
  assert.doesNotMatch(scriptDirective, /unsafe-inline/);
});
