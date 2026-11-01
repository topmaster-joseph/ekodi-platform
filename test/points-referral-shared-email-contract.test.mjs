// #6739 P0: a mailbox shared with any other Person denies a referral credit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/20261101030000_ekodi_points_referral_shared_email_guard.sql', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../scripts/run-points-sql-smokes.mjs', import.meta.url), 'utf8');
test('shared identity email with another Person is denied regardless of link time', () => {
  const guard = sql.slice(sql.indexOf('Any identity email'), sql.indexOf("REFERRAL_EXISTING_MEMBER"));
  assert.match(guard, /other\.person_id<>v_person/);
  assert.doesNotMatch(guard, /linked_at<v_invite\.issued_at/);
  assert.match(sql, /grant execute on function public\.ekodi_points_confirm_shared_signup\(uuid\)\s*to authenticated/);
  assert.doesNotMatch(sql, /update public\.login_identities|insert into public\.login_identities/i, 'email must never merge');
});
test('shared-email smoke is wired into the SQL smoke runner', () => {
  assert.match(runner, /points-referral-shared-email-isolated-smoke\.sql/);
});
