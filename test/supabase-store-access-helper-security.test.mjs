import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261003142400_store_access_helpers_restricted_definer.sql', import.meta.url),
  'utf8'
);

test('store and tenant access helpers remain RLS-safe and are never anonymous RPCs', () => {
  for (const name of ['has_store_access','has_store_private_access','has_tenant_access']) {
    assert.match(migration, new RegExp(`alter\\s+function\\s+public\\.${name}\\(uuid\\)\\s+security\\s+definer`, 'i'));
    assert.match(migration, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\(uuid\\)\\s+from\\s+public,\\s*anon`, 'i'));
    assert.match(migration, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\(uuid\\)\\s+to\\s+authenticated,\\s*service_role`, 'i'));
  }
});
