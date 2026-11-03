import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20261030170000_ekodi_points_operator_attendance.sql',import.meta.url),'utf8');
test('attendance operator RPC requires live auth and tenant-scoped authority',()=>{
  for(const clause of [
    'if auth.uid() is null', 'st.enabled',
    'p.id=p_participation_id',
    'a.workspace_tenant_id=st.tenant_id',
    'public.activity_is_workspace_operator(v_tenant)',
    'ekodi_points_private.award_verified_attendance(p_site,p_participation_id)'
  ])assert.ok(sql.includes(clause),clause);
});
test('RPC is not executable by anonymous users and is the only public point mutation',()=>{
  assert.match(sql,/revoke all on function public\.ekodi_points_operator_award_attendance\(text,uuid\)[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.ekodi_points_operator_award_attendance\(text,uuid\)[\s\S]*?to authenticated/i);
  assert.doesNotMatch(sql,/grant execute [\s\S]*to anon;/i);
});
