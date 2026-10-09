import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAdminMenuItem } from '../admin-menu-registry.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('POS Agent install management remains a native super-admin device panel',async()=>{
  const item=getAdminMenuItem('pos-agent');
  assert.equal(item?.group,'devices-agent');
  assert.equal(item?.superAdminOnly,true);
  assert.equal(item?.href,undefined);
  assert.equal(item?.adminHandoff,undefined);

  const [js,css,shell,build,worker]=await Promise.all([
    read('pos-agent-admin.js'),
    read('pos-agent-admin.css'),
    read('admin-authenticated-shell.js'),
    read('scripts/build.mjs'),
    read('site-worker.js'),
  ]);
  assert.match(js,/const SECTION='pos-agent'/);
  assert.match(js,/section\.dataset\.panel=SECTION/);
  assert.match(js,/setup-pos-agent\.cmd/);
  assert.match(js,/remove-pos-agent\.cmd/);
  assert.match(js,/diagnose-pos-targets\.ps1/);
  assert.match(js,/127\.0\.0\.1:17831/);
  assert.match(js,/0x80041318/);
  assert.match(js,/20초 재시작 설정/);
  assert.match(js,/\/jadam\/admin\/pos/);
  assert.match(js,/\/pizzamaru\/admin\/pos/);
  assert.match(js,/\/yogurt\/admin\/pos/);
  assert.match(css,/\.pos-agent-grid/);
  assert.match(shell,/pos-agent-admin\.js/);
  assert.match(build,/'pos-agent-admin\.js'/);
  assert.match(worker,/\/pos-agent-admin\.js/);
});
