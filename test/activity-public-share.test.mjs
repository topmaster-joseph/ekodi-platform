import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const sql=read('supabase/migrations/20260926140500_activity_public_readonly_shares.sql');
const worker=read('space-worker.js');
const admin=read('workspace-admin-page.js');

test('activity public shares store only a hash and remain expiring and revocable',()=>{
  assert.match(sql,/create table if not exists public\.activity_public_shares/);
  assert.match(sql,/token_hash text not null unique/);
  assert.doesNotMatch(sql,/token_plain|plain_token|share_token text/i);
  assert.match(sql,/extensions\.gen_random_bytes\(32\)/);
  assert.match(sql,/extensions\.digest\(v_token,'sha256'\)/);
  assert.match(sql,/expires_at timestamptz not null/);
  assert.match(sql,/status in \('active','revoked','expired'\)/);
  assert.match(sql,/activity_public_shares_one_active_idx/);
});

test('share administration stays tenant-authorized while the public projection is narrowly anonymous',()=>{
  for(const signature of [
    'activity_admin_share_status\(text,text\)',
    'activity_admin_create_share\(text,text,timestamptz,jsonb\)',
    'activity_admin_revoke_share\(uuid\)'
  ]){
    assert.match(sql,new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated;`));
    assert.match(sql,new RegExp(`grant execute on function public\\.${signature} to authenticated, service_role;`));
  }
  assert.match(sql,/revoke all on function public\.activity_public_share_snapshot\(text\) from public, anon, authenticated;/);
  assert.match(sql,/grant execute on function public\.activity_public_share_snapshot\(text\) to anon, authenticated, service_role;/);
  assert.match(sql,/activity_is_workspace_operator/);
});

test('public share projection cannot return contact or internal management fields',()=>{
  const start=sql.indexOf('create or replace function public.activity_public_share_snapshot');
  const end=sql.indexOf('comment on function public.activity_public_share_snapshot',start);
  assert.ok(start>=0&&end>start);
  const projection=sql.slice(start,end);
  for(const forbidden of ['person_contacts','phone','email','follow_up_note','support_notes','participant_role','ekodi_id','relationships']){
    assert.equal(projection.includes(forbidden),false,forbidden);
  }
  for(const allowed of ["'seq'","'name'","'status'","'party_size'"])assert.ok(projection.includes(allowed),allowed);
});

test('Mission share route is private-by-link and the admin exposes explicit create/revoke controls',()=>{
  assert.match(worker,/MISSION_SHARE_PATH_RE/);
  assert.match(worker,/activity_public_share_snapshot/);
  assert.match(worker,/x-ekodi-publication-status','private-share'/);
  assert.match(worker,/noindex, nofollow, noarchive/);
  assert.match(worker,/전화번호·이메일·역할·후속관리·내부 메모는 포함하지 않습니다/);
  assert.match(admin,/activity_admin_share_status/);
  assert.match(admin,/activity_admin_create_share/);
  assert.match(admin,/activity_admin_revoke_share/);
  assert.match(admin,/읽기전용 링크 만들기/);
  assert.match(admin,/이전 링크가 있었다면 즉시 무효화되었습니다/);
});
