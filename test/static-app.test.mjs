import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, headers, script, monitorStatus] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../_headers', import.meta.url), 'utf8'),
  readFile(new URL('../script.js', import.meta.url), 'utf8'),
  readFile(new URL('../monitor-status.json', import.meta.url), 'utf8')
]);

const cspDirective = name => {
  const policy = headers.split('\n').find(line => line.includes('Content-Security-Policy')) || '';
  return policy.split(';').find(part => part.trim().startsWith(`${name} `)) || '';
};

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
  const scriptDirective = cspDirective('script-src');
  assert.match(scriptDirective, /script-src 'self'/);
  assert.doesNotMatch(scriptDirective, /unsafe-inline/);
});

test('CSP allows exactly the web font hosts the page links', () => {
  assert.match(cspDirective('style-src'), /https:\/\/fonts\.googleapis\.com/);
  assert.match(cspDirective('font-src'), /https:\/\/fonts\.gstatic\.com/);
  assert.doesNotMatch(cspDirective('style-src'), /unsafe-inline/);
  assert.match(html, /fonts\.googleapis\.com\/css2/);
});

test('public portal exposes every monitored service with a status slot', () => {
  const snapshot = JSON.parse(monitorStatus);
  const cards = [...html.matchAll(/data-portal-domain="([^"]+)"/g)].map(match => match[1]);
  assert.equal(cards.length, snapshot.sites.length);
  snapshot.sites.forEach(site => {
    assert.ok(cards.includes(site.domain), `portal card missing for ${site.domain}`);
  });
  assert.equal((html.match(/class="portal-state"/g) || []).length, snapshot.sites.length);
});

test('portal sections referenced by the navigation exist', () => {
  ['about', 'services', 'status', 'connect'].forEach(section => {
    assert.match(html, new RegExp(`href="#${section}"`));
    assert.match(html, new RegExp(`id="${section}"`));
  });
});

test('admin login lives in a modal dialog outside the console shell', () => {
  assert.match(html, /<dialog class="admin-dialog" id="adminDialog"/);
  assert.match(script, /adminDialog\.showModal\(\)/);
  assert.match(html, /id="adminLoginForm"/);
});

test('monitoring falls back to the bundled snapshot when the remote fetch fails', () => {
  assert.match(script, /monitor-status\.json\?t=/);
});
