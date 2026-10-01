import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('platform super admin owns global site health with static and dynamic tabs',async()=>{
  const [registry,sidebar,shell,js,css,seonam]=await Promise.all([
    read('admin-menu-registry.js'),
    read('admin-sidebar.js'),
    read('admin-authenticated-shell.js'),
    read('site-health-admin.js'),
    read('site-health-admin.css'),
    read('sites/seonammedi/public/admin/index.html')
  ]);
  assert.match(registry,/id: 'site-health'[^\n]*group: 'status'[^\n]*superAdminOnly: true/);
  assert.match(sidebar,/status: \['health', 'site-health', 'deployments'/);
  assert.match(shell,/deferredPostAuthScripts[\s\S]*site-health-admin\.js/);
  assert.match(js,/section\.dataset\.panel=SECTION/);
  assert.match(js,/data-site-health-tab="dynamic"/);
  assert.match(js,/data-site-health-tab="static"/);
  assert.match(js,/\/api\/control\/overview/);
  assert.match(js,/\/api\/control\/check/);
  assert.match(js,/\/api\/customers\/directory/);
  assert.match(js,/\/ecosystem-services\.json/);
  assert.match(css,/\.site-health-tabs/);
  assert.doesNotMatch(seonam,/data-panel-target="site-health"|>사이트 점검<|>정적 상태<|>동적 상태</);
});
