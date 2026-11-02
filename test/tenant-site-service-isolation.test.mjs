import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../supabase/tests/tenant_site_service_isolation_live_probe.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/supabase-local-ci.yml',import.meta.url),'utf8');

test('synthetic tenant RPC regression has an unconditional rollback and no real identities',()=>{
  assert.match(script,/^begin;/m);
  assert.match(script,/^rollback;/m);
  assert.doesNotMatch(script,/^commit\s*;/im);
  assert.match(script,/example\.invalid/);
  assert.match(script,/set local role authenticated/i);
  assert.match(script,/reset role;/i);
  assert.match(script,/tenant_site_service_catalog_snapshot/);
  assert.match(script,/tenant_site_service_preference_set/);
  assert.match(script,/unexpected audit change count|expected exactly 2 audit entries/i);
  assert.match(script,/store_staff illicitly changed menu visibility/i);
  assert.match(script,/cross-tenant read was allowed/i);
  assert.match(script,/non-member obtained tenant catalog/i);
  assert.match(script,/not-ready service was enabled/i);
});

test('local Supabase gate runs transaction test on ephemeral Postgres only',()=>{
  assert.match(workflow,/Verify synthetic site-service tenant isolation \(full rollback\)/);
  assert.match(workflow,/docker exec -i "\$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1/);
  assert.match(workflow,/supabase\/tests\/tenant_site_service_isolation_live_probe\.sql/);
  assert.match(workflow,/needs_db == 'true'/);
});
