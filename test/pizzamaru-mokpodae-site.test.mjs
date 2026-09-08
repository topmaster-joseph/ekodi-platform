import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, js, worker, build] = await Promise.all([
  readFile(new URL('../pizzamaru-mokpodae.html', import.meta.url), 'utf8'),
  readFile(new URL('../pizzamaru-mokpodae.css', import.meta.url), 'utf8'),
  readFile(new URL('../pizzamaru-mokpodae.js', import.meta.url), 'utf8'),
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

test('Pizza Maru Mokpo page exposes canonical store contact and order actions', () => {
  assert.match(html, /피자마루 목포대점/);
  assert.match(html, /전남 무안군 청계면 승달산길 37-1 1층/);
  assert.match(html, /tel:0614538295/);
  assert.match(html, /https:\/\/ekodi\.kr\/pizzamaru/);
  assert.match(html, /배달의민족/);
  assert.match(html, /요기요/);
  assert.match(html, /쿠팡이츠/);
  assert.match(html, /viewport-fit=cover/);
});

test('Pizza Maru Mokpo interactive actions remain CSP compatible', () => {
  assert.match(html, /src="\/pizzamaru-mokpodae\.js" defer/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/i);
  assert.match(js, /navigator\.share/);
  assert.match(js, /navigator\.clipboard/);
  assert.match(js, /Asia\/Seoul/);
  assert.match(css, /--brand:#b3132b/);
});

test('legacy branch route redirects to the canonical root storefront', () => {
  assert.match(worker, /url\.pathname === '\/pizzamaru\/mokpodae'/);
  assert.match(worker, /x-ekodi-canonical-storefront/);
  assert.match(worker, /new URL\('\/pizzamaru',request\.url\)/);
  assert.match(worker, /'\/pizzamaru-mokpodae\.css'/);
  assert.match(worker, /'\/pizzamaru-mokpodae\.js'/);
  for (const asset of ['pizzamaru-mokpodae.html','pizzamaru-mokpodae.css','pizzamaru-mokpodae.js']) assert.match(build, new RegExp(asset.replaceAll('.', '\\.')));
});

test('Pizza Maru branch route owns its branded chrome in production routing', async () => {
  const [shellWorker, wrangler] = await Promise.all([
    readFile(new URL('../site-shell-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8'),
  ]);
  assert.match(shellWorker, /standaloneBrandPlacePath/);
  assert.match(shellWorker, /pizzamaru\/mokpodae/);
  assert.match(wrangler, /\/pizzamaru\/mokpodae\*/);
});
