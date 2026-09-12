import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { decorateDiscoveryHtml, decorateDiscoveryResponse } from '../discovery-layer.js';

const shell = '<!doctype html><html><head><title>Store</title><meta name="description" content="old"><meta name="robots" content="noindex"></head><body>public</body></html>';

test('dynamic discovery decoration adds canonical social and JSON-LD metadata', () => {
  const html = decorateDiscoveryHtml(shell, '/jadam/');
  assert.match(html, /rel="canonical" href="https:\/\/ekodi\.kr\/jadam"/);
  assert.match(html, /property="og:url" content="https:\/\/ekodi\.kr\/jadam"/);
  assert.match(html, /data-ekodi-discovery="v2" data-ekodi-path="\/jadam"/);
  assert.match(html, /application\/ld\+json/);
  assert.equal((html.match(/name="robots"/g) || []).length, 1);
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.match(html, /name="robots" content="index, follow"/);
});

test('unregistered routes are not rewritten', () => {
  assert.equal(decorateDiscoveryHtml(shell, '/not-a-public-route'), shell);
});

test('response decoration preserves response policy headers and skips non-HTML', async () => {
  const response = new Response(shell, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'", etag: 'abc', 'content-length': String(shell.length) } });
  const decorated = await decorateDiscoveryResponse(response, '/ekodibiz/mall');
  const html = await decorated.text();
  assert.equal(decorated.status, 200);
  assert.equal(decorated.headers.get('content-security-policy'), "default-src 'self'");
  assert.equal(decorated.headers.has('etag'), false);
  assert.match(html, /data-ekodi-path="\/ekodibiz\/mall"/);

  const json = new Response('{}', { headers: { 'content-type': 'application/json' } });
  assert.equal(await decorateDiscoveryResponse(json, '/jadam'), json);
});

test('apex dynamic routers use the shared discovery response decorator', async () => {
  const [router, site] = await Promise.all([
    readFile(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.match(router, /decorateDiscoveryResponse\(response,url\.pathname\)/);
  assert.match(site, /decorateDiscoveryResponse\(shelled, incoming\.pathname\)/);
});

test('mall discovery keeps admin embed outside public indexing decoration', async () => {
  const site = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
  assert.match(site, /if \(adminSurface \|\| apiSurface \|\| verificationOpsSurface \|\| adminEmbed\) return shelled/);
  assert.match(site, /if \(adminSurface \|\| apiSurface \|\| verificationOpsSurface \|\| adminEmbed\) response\.headers\.set\('X-Robots-Tag', 'noindex, nofollow, noarchive'\)/);
});
