import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('site publication changes trigger both shared-site and Control API releases',async()=>{
  const [site,control,validator]=await Promise.all([
    read('.github/workflows/deploy-site-core.yml'),
    read('.github/workflows/deploy-control-api.yml'),
    read('scripts/validate-platform-boundaries.mjs')
  ]);
  for(const source of ['site-publication-runtime.js','config/site-publication-policy.json','test/site-publication-policy.test.mjs']){
    assert.ok(site.includes(source),`shared site missing ${source}`);
    assert.ok(control.includes(source),`control api missing ${source}`);
    assert.ok(validator.includes(source),`boundary validator missing ${source}`);
  }
  assert.match(site,/platform-router-entry-worker\.js site-publication-runtime\.js platform-security-policy\.js/);
  assert.match(control,/for file in api-worker\.js site-publication-runtime\.js platform-maturity-control\.js/);
});
