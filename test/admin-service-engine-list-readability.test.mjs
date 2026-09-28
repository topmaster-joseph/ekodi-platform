import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>readFileSync(path.join(root,name),'utf8');
const js=read('common-services-admin.js');
const css=read('common-services-admin.css');

test('service engine admin uses searchable compact list grammar',()=>{
  assert.match(js,/id="commonServicesSearch"/);
  assert.match(js,/id="commonServicesStatusFilter"/);
  assert.match(js,/class="common-services-list-head"/);
  assert.match(js,/서비스 · 엔진/);
  assert.match(js,/최근점검/);
  assert.match(js,/common-service-identity/);
  assert.match(js,/common-service-address/);
  assert.match(js,/common-service-role/);
  assert.match(js,/common-service-runtime/);
  assert.match(js,/common-service-activation/);
  assert.match(js,/common-service-checked/);
  assert.match(js,/상세 ›/);
});

test('service engine filters do not redefine category summary totals',()=>{
  assert.match(js,/function categoryServices\(\)/);
  assert.match(js,/function visibleServices\(\)/);
  assert.match(js,/const visible=categoryServices\(\)/);
  assert.match(js,/state\.statusFilter==='approval'/);
});

test('service engine list uses light high-readability visual surface',()=>{
  assert.match(css,/EKODI service engine list readability v2/);
  assert.match(css,/\.common-services-list-head\{display:grid/);
  assert.match(css,/\.common-service-card\{display:grid/);
  assert.match(css,/background:#fff/);
  assert.match(css,/min-height:60px/);
  assert.match(css,/@media\(max-width:760px\)/);
});
