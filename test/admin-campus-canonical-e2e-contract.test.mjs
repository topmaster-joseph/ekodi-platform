import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('genuine-auth campus E2E uses the canonical sites route',async()=>{
  const [routes,probe,retry]=await Promise.all([
    read('admin-canonical-routes.js'),
    read('scripts/admin-assist-canonical-e2e.mjs'),
    read('scripts/admin-authenticated-e2e-retry.mjs'),
  ]);
  assert.match(routes,/campus:'sites'/);
  assert.match(probe,/const campusUrl = 'https:\/\/ekodi\.kr\/admin\/sites\/campus'/);
  assert.match(probe,/canonicalLocation\.pathname !== '\/admin\/sites\/campus'/);
  assert.match(retry,/canonicalCampusUrl: 'https:\/\/ekodi\.kr\/admin\/sites\/campus'/);
  assert.doesNotMatch(probe,/\/admin\/home\/campus/);
  assert.doesNotMatch(retry,/\/admin\/home\/campus/);
  assert.match(probe,/await page\.waitForSelector\('#app:not\(\[hidden\]\)'\)/);
  assert.match(probe,/await input\.press\('Enter'\)/);
});
