import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const api=await readFile(new URL('../supabase/functions/singles-api/index.ts',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20261025110000_singles_withdrawal_closes_connections.sql',import.meta.url),'utf8');

test('withdraw endpoint delegates to one atomic database call',()=>{
  const block=api.slice(api.indexOf('if (p === "/withdraw")'),api.indexOf('const fields ='));
  assert.match(block,/admin\.rpc\("singles_withdraw_member", \{ p_user: userId, p_version: VERSION \}\)/);
  assert.doesNotMatch(block,/\.from\(/,'no separate non-atomic table writes');
  assert.match(block,/status: "withdrawn"/);
});
test('withdrawal closes open connections and RSVPs without deleting content',()=>{
  assert.match(sql,/update public\.singles_interests set status='withdrawn'[\s\S]*?\(from_user_id=p_user or to_user_id=p_user\) and status in \('pending','accepted'\)/);
  assert.match(sql,/update public\.singles_event_rsvps set status='cancelled'[\s\S]*?status in \('requested','approved'\)/);
  assert.match(sql,/insert into public\.singles_consent_receipts\(user_id,action,consent_version\) values\(p_user,'withdrawn',p_version\)/);
  assert.doesNotMatch(sql,/\bdelete\s+from\b|\btruncate\b|\bdrop\b/i,'physical deletion is approval-gated');
  assert.match(sql,/if not found then raise exception 'member_not_found'/);
});
test('withdrawal function is server-only',()=>{
  assert.match(sql,/revoke all on function public\.singles_withdraw_member\(uuid,text\) from public,anon,authenticated;/);
  assert.match(sql,/grant execute on function public\.singles_withdraw_member\(uuid,text\) to service_role;/);
});
