import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261030210000_ekodi_points_verified_referrals.sql',import.meta.url),'utf8');
test('share attempts never award points; only new independently confirmed canonical members',()=>{
  assert.match(sql,/SHARE_LINK_ISSUED_NOT_CONFIRMED/);
  for(const part of [
    'public.ekodi_point_referral_invites','public.ekodi_point_referral_rewards',
    'auth.uid()','ekodi_points_private.resolve_person_for_auth(v_auth)',
    'u.confirmed_at is not null',
    'v_created<v_invite.issued_at',
    'v_created<now()-interval \'7 days\'',
    'v_person=v_invite.inviter_person_id',
    'REFERRAL_INVITE_EXPIRED',
    'primary key (site_id,referred_person_id)',
    'REFERRAL_INVITE_DAILY_LIMIT',
    "v_rule.points not between 1 and 5",
    'v_rule.daily_cap>25 or v_rule.daily_events>5',
    "v_key:='referral:'||v_invite.site_id||':'||v_person::text",
    'ekodi_points_private.award_activity',
    'if v_result->>\'awarded\'<>\'true\''
  ])assert.ok(sql.includes(part),part);
  assert.doesNotMatch(sql,/p_claimed_seconds|p_referred_person_id|p_inviter_person_id/);
});
test('referral tables closed to browser writes and both RPCs require authentication',()=>{
  assert.match(sql,/alter table public\.ekodi_point_referral_invites enable row level security/);
  assert.match(sql,/alter table public\.ekodi_point_referral_rewards enable row level security/);
  assert.match(sql,/revoke all on table public\.ekodi_point_referral_invites,[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(sql,/grant select on table public\.ekodi_point_referral_invites,[\s\S]*?to service_role/);
  for(const signature of ['ekodi_points_issue_share_invite\\(text\\)','ekodi_points_confirm_shared_signup\\(uuid\\)']){
    assert.match(sql,new RegExp('revoke all on function public\\.'+signature+'[\\s\\S]*?from public, anon, authenticated'));
    assert.match(sql,new RegExp('grant execute on function public\\.'+signature+'[\\s\\S]*?to authenticated'));
  }
});
