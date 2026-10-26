import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261026010000_singles_consent_receipt_choices.sql',import.meta.url),'utf8');

test('receipts gain nullable consent-choice columns compatible with the running API',()=>{
  assert.match(sql,/add column if not exists religion_consent boolean,\n add column if not exists marriage_opt_in boolean;/);
  assert.doesNotMatch(sql,/religion_consent boolean not null|marriage_opt_in boolean not null/);
  assert.match(sql,/check \(marriage_opt_in is not true or religion_consent is true\)/);
});
test('withdrawal receipt records that no optional consent remains, keeping the function server-only',()=>{
  assert.match(sql,/values\(p_user,'withdrawn',p_version,false,false\);/);
  assert.match(sql,/revoke all on function public\.singles_withdraw_member\(uuid,text\) from public,anon,authenticated;/);
  assert.match(sql,/grant execute on function public\.singles_withdraw_member\(uuid,text\) to service_role;/);
  assert.doesNotMatch(sql,/\bdelete\s+from\b|\bdrop\s+table\b/i);
});
