import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const registry=read('admin-menu-registry.js');
const routes=read('admin-canonical-routes.js');
const loader=read('admin-demand-loader.js');
const layout=read('admin-menu-layout.js');
const worker=read('site-worker.js');
const build=read('scripts/build.mjs');
const view=read('points-admin.js');
test('points is registered as a canonical super-admin service section',()=>{
  assert.match(registry,/sections: \['points'\]/);
  assert.match(registry,/id: 'points', group: 'services'[^\n]*superAdminOnly: true/);
  assert.match(routes,/points:'services'/);
  assert.match(loader,/points:\{label:'활동포인트'[^\n]*scripts:\['points-admin\.js'\]/);
  assert.match(layout,/\['points','points'\]/);
  assert.match(worker,/'\/points-admin\.js'/);
  assert.match(build,/'points-admin\.js'/);
});
test('admin points view is read-only and renders server values as text',()=>{
  assert.match(view,/root\.dataset\.panel='points'/);
  assert.match(view,/sessionStorage\.getItem\('ekodi-auth-token'\)/);
  assert.match(view,/\/functions\/v1\/points-api\/admin\/overview/);
  assert.match(view,/if\(body\.read_only!==true\)/);
  assert.match(view,/response\.status===403/);
  assert.match(view,/td\.textContent=/);
  assert.doesNotMatch(view,/\.insert\(|\.update\(|\.delete\(|method:'POST'|method:'PATCH'|method:'DELETE'/);
});
