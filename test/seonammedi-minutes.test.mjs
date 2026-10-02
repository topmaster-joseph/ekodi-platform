import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('seonammedi internal minutes uses name-gated sharing',async()=>{
  const control=await readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8');
  const admin=await readFile(new URL('../sites/seonammedi/public/admin/index.html',import.meta.url),'utf8');
  const viewer=await readFile(new URL('../sites/seonammedi/public/minutes/index.html',import.meta.url),'utf8');
  const script=await readFile(new URL('../sites/seonammedi/public/minutes/minutes.js',import.meta.url),'utf8');
  const adminMinutes=await readFile(new URL('../sites/seonammedi/public/admin/admin-minutes.js',import.meta.url),'utf8');
  const migration=await readFile(new URL('../migrations/0117_seonammedi_internal_minutes.sql',import.meta.url),'utf8');
  assert.match(admin,/data-panel-target="minutes"/);
  assert.match(admin,/내부 회의록/);
  assert.match(viewer,/확인자 성명/);
  assert.match(viewer,/열람 기록으로 저장/);
  assert.match(script,/api\/seonammedi\/minutes/);
  assert.match(adminMinutes,/ekodi-auth-token/);
  assert.match(adminMinutes,/sb-renzehysxirjilvdxacv-auth-token/);
  assert.match(adminMinutes,/credentials:'same-origin'/);
  assert.match(control,/name_required/);
  assert.match(control,/seonammedi_minute_viewers/);
  assert.match(migration,/share_token TEXT NOT NULL UNIQUE/);
});
