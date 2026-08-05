import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, headers] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../_headers', import.meta.url), 'utf8')
]);

test('HTML has unique IDs and a single external script', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML id found');
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.match(html, /<script src="script\.js"><\/script>/);
});

test('production UI does not expose removed simulated workflows', () => {
  assert.doesNotMatch(html, /seoyeon\.lee|junho\.park|minji\.choi/);
  assert.doesNotMatch(html, /승인된 사용자|가입 요청/);
});

test('CSP disallows inline scripts', () => {
  const policy = headers.split('\n').find(line => line.includes('Content-Security-Policy')) || '';
  const scriptDirective = policy.split(';').find(part => part.trim().startsWith('script-src')) || '';
  assert.match(scriptDirective, /script-src 'self'/);
  assert.doesNotMatch(scriptDirective, /unsafe-inline/);
});
