import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const root=new URL('../',import.meta.url);
const schema=fs.readFileSync(new URL('supabase/migrations/20261011150000_presence_offline_core.sql',root),'utf8');
const rpc=fs.readFileSync(new URL('supabase/migrations/20261011150100_presence_api_functions.sql',root),'utf8');
const edge=fs.readFileSync(new URL('supabase/functions/presence-attendance-api/index.ts',root),'utf8');
const ui=fs.readFileSync(new URL('presence/operator.js',root),'utf8');
test('tables stay private; no client role data grants',()=>{
  for(const t of ['people','sessions','headcounts','observations','attendances','audit_events','requests'])assert.match(schema,new RegExp(`'${t}'`));
  assert.match(schema,/revoke all on presence_private\.%I from public,anon,authenticated/);
  assert.match(schema,/enable row level security/);
});
test('identities are never inferred from camera headcounts',()=>{
  assert.match(schema,/camera_aggregate/);
  assert.doesNotMatch(edge+rpc,/face_embedding|face_match|biometric_template/i);
  assert.match(ui,/합산하지 않음/);
});
test('server validates every request and tenant',()=>{
  assert.match(edge,/auth\/v1\/user/);
  assert.match(edge,/new Set\(\['ekodi-church','ekodimission'\]\)/);
  assert.match(rpc,/presence_staff_allowed\(v_tenant,p_actor\)/);
  assert.match(rpc,/coalesce\(auth\.jwt\(\)->>'role',''\) <> 'service_role'/);
});
test('idempotency locks before mutations and can correct linked observations',()=>{
  assert.ok(rpc.indexOf('insert into presence_private.requests') < rpc.indexOf("if p_action='open_session'"));
  assert.match(rpc,/on conflict \(tenant_id,request_id\) do nothing/);
  assert.match(rpc,/presence_private\.attendances set status='retracted'/);
  assert.match(rpc,/on conflict \(tenant_id,session_id,person_id,channel\) do update/);
});
test('same session has per-channel uniqueness and tenant composite keys',()=>{
  assert.match(schema,/unique \(tenant_id,session_id,person_id,channel\)/);
  assert.match(schema,/foreign key \(tenant_id,person_id\)/);
  assert.match(schema,/foreign key \(tenant_id,session_id\)/);
  assert.match(schema,/foreign key \(tenant_id,observation_id\)/);
});