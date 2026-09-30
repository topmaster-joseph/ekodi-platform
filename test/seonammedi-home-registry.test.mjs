import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SeonamMedi is a live homepage service for public discovery', async () => {
  const registry=JSON.parse(await readFile(new URL('../config/ecosystem-services.json', import.meta.url),'utf8'));
  const service=registry.services.find(item=>item.id==='seonammedi');
  assert.ok(service);
  assert.equal(service.url,'https://ekodi.kr/seonammedi/');
  assert.equal(service.status,'live');
  assert.equal(service.homepage,true);
  assert.equal(service.productionVerified,true);
});
