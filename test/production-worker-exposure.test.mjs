import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('production exposure validator is wired into the security gate',async()=>{
  const [pkg,validator]=await Promise.all([read('package.json'),read('scripts/validate-production-worker-exposure.mjs')]);
  const parsed=JSON.parse(pkg);
  assert.match(parsed.scripts['validate:security'],/validate-production-worker-exposure\.mjs/);
  assert.match(validator,/workers_dev\\s\*=\\s\*false/);
  assert.match(validator,/preview_urls\\s\*=\\s\*false/);
  assert.match(validator,/Shared Site binding target/);
  assert.match(validator,/topmaster-joseph\\\.workers\\\.dev/);
  assert.match(validator,/'wrangler\.api\.toml'/);
});
