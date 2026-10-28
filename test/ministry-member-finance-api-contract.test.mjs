import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../supabase/functions/ministry-member-finance-api/index.ts',import.meta.url),'utf8');
test('member finance endpoint requires canonical token and service-side membership proof',()=>{
  assert.match(api,/verifiedAuthUser/);
  assert.match(api,/ministry_finance_read_context/);
  assert.match(api,/selectMinistryFinanceDisclosure/);
  assert.match(api,/context\.membership/);
  assert.match(api,/yearOrNull/);
  assert.match(api,/selectSections/);
});
test('finance endpoint is read-only and fails closed without protected RPC',()=>{
  assert.match(api,/request\.method!=='GET'/);
  assert.match(api,/if\(!response\.ok\)return null/);
  assert.match(api,/cache:'no-store'/);
  assert.doesNotMatch(api,/from\('church_private|\.from\('offerings|\.from\('ledger_entries|\.from\('finance_bank_transactions/);
  assert.doesNotMatch(api,/INSERT INTO|UPDATE\s+church_private|DELETE\s+FROM/i);
});
test('finance endpoint does not expose secret keys or private upstream errors',()=>{
  assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(api,/console\.(log|error|warn)/);
  assert.doesNotMatch(api,/error\.message|String\(error\)/);
  assert.match(api,/cache-control':'private, no-store/);
});
