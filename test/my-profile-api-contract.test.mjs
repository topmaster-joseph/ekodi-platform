import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/profile-api/index.ts',import.meta.url),'utf8');

test('profile API reads the canonical login identity timestamp columns',()=>{
  assert.match(source,/select\("auth_user_id,provider,email,is_primary,status,linked_at,last_seen_at"\)/);
  assert.match(source,/order\("linked_at",\{ascending:true\}\)/);
  assert.doesNotMatch(source,/login_identities"\)\.select\([^\n]*created_at/);
  assert.doesNotMatch(source,/order\("created_at"/);
});
