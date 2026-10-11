import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [server,admin,sql,homepage]=await Promise.all([
  read('supabase/functions/church-pastor-api/index.ts'),
  read('church-pastor-admin-page.js'),
  read('supabase/migrations/20261009193000_split_mission_church_meeting_ownership.sql'),
  read('test/church-production-guest-contract.test.mjs')
]);

test('public manage affordance and actual edit RLS use active church tenant-admin only',()=>{
  assert.match(server,/scope'\)===\x27worship-access\x27/);
  assert.match(server,/site_key:'eq.church',role:'eq.tenant_admin',status:'eq.active'/);
  assert.match(server,/authorization:'Bearer '\+bearer\(req\)/);
  assert.match(admin,/section==='worship'/);
  assert.match(admin,/site_access_registry\?site_key=eq.church&role=eq.tenant_admin&status=eq.active/);
  assert.match(sql,/CREATE POLICY "church tenant admin can insert worship"/);
  assert.match(sql,/CREATE POLICY "church tenant admin can update worship"/);
  assert.match(sql,/CREATE POLICY "church tenant admin can delete worship"/);
  assert.match(sql,/service_type='sunday' AND EXISTS/);
  assert.match(sql,/r.site_key='church' AND r.status='active' AND r.role::text='tenant_admin'/);
  assert.doesNotMatch(server,/WORSHIP_ACCESS_ROLES/);
});
test('guest / foreign origin negative-auth production contract remains intact',()=>{
  assert.match(homepage,/403/);
  assert.match(homepage,/401/);
  assert.match(homepage,/204/);
});
