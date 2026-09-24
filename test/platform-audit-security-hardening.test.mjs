import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('activity internal helpers are removed from direct anon/authenticated execution', () => {
  const sql = read('supabase/migrations/20260924013000_platform_audit_security_hardening.sql');
  for (const signature of [
    'activity_is_workspace_operator(uuid)',
    'activity_record_participation_audit(uuid,uuid,text,jsonb,jsonb,text)',
    'activity_resolve_person(text,text,text,text)',
  ]) {
    assert.ok(sql.includes(`revoke all on function public.${signature} from public, anon, authenticated`), signature);
    assert.ok(sql.includes(`grant execute on function public.${signature} to service_role`), signature);
  }
});

test('activity admin RPCs remain authenticated but are not executable by anon', () => {
  const sql = read('supabase/migrations/20260924013000_platform_audit_security_hardening.sql');
  for (const name of ['activity_admin_add_participant','activity_admin_snapshot','activity_admin_update_participation']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+ to authenticated, service_role;`));
  }
});

test('intentional public RPC exceptions stay documented instead of being globally revoked', () => {
  const sql = read('supabase/migrations/20260924013000_platform_audit_security_hardening.sql');
  for (const name of ['activity_submit_participation','mission_submit_event_application','current_ekodi_mcp_identity','store_public_storefront','store_user_site_public_profile','store_user_site_public_snapshot']) {
    assert.ok(sql.includes(`comment on function public.${name}`), name);
  }
});

test('duplicate review index and overlapping worship read policy are hardened without losing public reads', () => {
  const sql = read('supabase/migrations/20260924013000_platform_audit_security_hardening.sql');
  assert.match(sql, /drop index if exists public\.store_platform_reviews_unanswered_idx/);
  assert.match(sql, /create policy "published worship is public"[\s\S]*to anon[\s\S]*using \(is_published = true\)/);
  assert.match(sql, /create policy "church tenant admin can read all worship"[\s\S]*to authenticated[\s\S]*is_published = true[\s\S]*tenant_admin/);
});
