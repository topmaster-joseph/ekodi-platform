import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifestUrl=new URL('../deploy/manifests/experience.worker.json',import.meta.url);

test('experience production manifest is BOM-free strict JSON',()=>{
  const raw=fs.readFileSync(manifestUrl,'utf8');
  assert.notEqual(raw.charCodeAt(0),0xFEFF,'production manifest must not start with UTF-8 BOM');
  const parsed=JSON.parse(raw);
  assert.equal(parsed.worker.name,'ekodi-experience');
  assert.equal(parsed.worker.config,'wrangler.experience.toml');
  assert.equal(parsed.worker.allowFirstDeploy,true);
});
