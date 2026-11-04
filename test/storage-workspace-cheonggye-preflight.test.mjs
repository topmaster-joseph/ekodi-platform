import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const control=readFileSync(new URL('../google-drive-storage-control.js',import.meta.url),'utf8');

test('member Sheet access verification precedes any primary account or route cutover',()=>{
  const start=control.indexOf('const bootstrapMatch=url.pathname.match');
  const end=control.indexOf('const disconnectMatch=url.pathname.match',start);
  assert.ok(start>=0&&end>start);
  const handler=control.slice(start,end);
  const grant=handler.indexOf('const sheetMeta=await driveFetch(candidateAccess');
  const check=handler.indexOf('CHEONGGYE_SHEET_EDIT_ACCESS_REQUIRED');
  const boot=handler.indexOf('const result=await bootstrap(env,row)');
  const cache=handler.indexOf('await writeCheonggyeConnectionCache(env,readyRow)');
  const off=handler.indexOf("UPDATE storage_connections SET status='disabled'");
  assert.ok(grant>=0&&grant<check&&check<boot&&boot<cache&&cache<off,
    'must verify isolated tenant Sheet before swapping credential or disabling any old primary');
  assert.match(handler,/sheetMeta\?\.id!==CHEONGGYE_SPREADSHEET_ID/);
  assert.match(handler,/sheetMeta\?\.mimeType!=='application\/vnd\.google-apps\.spreadsheet'/);
  assert.match(handler,/sheetMeta\?\.capabilities\?\.canEdit!==true/);
});

test('preflight checks only file metadata and never changes or reads member rows',()=>{
  const start=control.indexOf('const sheetMeta=await driveFetch(candidateAccess');
  const end=control.indexOf('const result=await bootstrap(env,row)',start);
  assert.ok(start>=0&&end>start);
  const preflight=control.slice(start,end);
  assert.match(preflight,/supportsAllDrives=true&fields=id,mimeType,capabilities\(canEdit\)/);
  assert.doesNotMatch(preflight,/sheetsFetch|sheetRange|:append|values\/|method:\s*'POST'|method:\s*'PUT'|DELETE/i);
  assert.match(preflight,/return json\(\{error:.*code:'CHEONGGYE_SHEET_EDIT_ACCESS_REQUIRED'\},403/);
});

test('fallback old primary remains connected if preflight denies Workspace cutover',()=>{
  const callback=control.slice(control.indexOf("if (url.pathname === \`${BASE}/callback\`"),control.indexOf("if (url.pathname === \`${BASE}/cheonggye-members/health\`"));
  assert.doesNotMatch(callback,/UPDATE storage_connections SET status='disabled'/);
  assert.doesNotMatch(callback,/await writeCheonggyeConnectionCache\(env,\{id,status:'connected'/);
  assert.match(control,/PRIMARY_SHARED_DRIVE_MANAGER_REQUIRED/);
  assert.match(control,/CANONICAL_STORAGE_ROUTE_PARENT_MISMATCH/);
});
