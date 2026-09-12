import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('shared footer injection is idempotent before browser JavaScript runs',async()=>{
  const injector=await read('ekodi-shell-injector.js');

  assert.match(injector,/class UserFooterCanonicalizer/);
  assert.match(injector,/const shared=classes\.includes\('ekodi-user-ui-footer'\)/);
  assert.match(injector,/if\(shared&&!serviceOwnsFooter\(this\.serviceId\)\)\{element\.remove\(\);return;\}/);
  assert.match(injector,/if\(sharedFooterReplacesLocalFooter\(this\.serviceId\)\)element\.remove\(\)/);
  assert.match(injector,/\.on\('footer',new UserFooterCanonicalizer\(serviceId\)\)/);
  assert.match(injector,/if\(!serviceOwnsFooter\(this\.serviceId\)\)element\.append\(renderEkodiUserFooter\(\),\{html:true\}\)/);
});
