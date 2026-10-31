import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = (await import('../platform-router-entry-worker.js')).default;

function env() {
  const served = [];
  return {
    served,
    ASSETS: { fetch: async (req) => { served.push(new URL(req.url).pathname); return new Response('<!doctype html><title>asset</title>', { status: 200, headers: { 'content-type': 'text/html' } }); } }
  };
}
const call = (path, e) => worker.fetch(new Request('https://ekodi.kr' + path), e, { waitUntil() {}, passThroughOnException() {} });

test('presbytery home and mission resolve to their own static pages', async () => {
  for (const [path, asset] of [['/mokpo-presbytery', '/mokpo-presbytery/'], ['/mokpo-presbytery/', '/mokpo-presbytery/'], ['/mokpo-presbytery/mission', '/mokpo-presbytery/mission/'], ['/mokpo-presbytery/mission/', '/mokpo-presbytery/mission/']]) {
    const e = env();
    const res = await call(path, e);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('x-ekodi-route'), 'mokpo-presbytery-static-pilot', path);
    assert.match(res.headers.get('x-robots-tag') || '', /noindex/);
    assert.deepEqual(e.served, [asset], path);
  }
});

test('unknown presbytery subpaths (incl. roster guesses) return 404, never a workspace list', async () => {
  for (const path of ['/mokpo-presbytery/members', '/mokpo-presbytery/members.json', '/mokpo-presbytery/roster.xlsx', '/mokpo-presbytery/mission/budget.csv']) {
    const e = env();
    const res = await call(path, e);
    assert.equal(res.status, 404, path);
    assert.deepEqual(e.served, [], path);
  }
});

test('static pages ship no roster personal data', () => {
  for (const f of ['sites/mokpo-presbytery/index.html', 'sites/mokpo-presbytery/mission/index.html']) {
    const html = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /01[016789]-\d{3,4}-\d{4}/, f + ' contains a phone number');
    assert.match(html, /목포노회/);
  }
  const home = readFileSync(new URL('../sites/mokpo-presbytery/index.html', import.meta.url), 'utf8');
  assert.match(home, /href="\/hammu\/"/);
  assert.match(home, /href="\/mokpo-presbytery\/mission\/"/);
  assert.doesNotMatch(home, /href="[^"]*member/i, 'roster menu must not be a clickable link');
});
