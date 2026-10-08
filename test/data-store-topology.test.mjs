import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditDataStoreTopology, declaredBindings, declaredVar } from '../scripts/data-store-topology.mjs';

const root = new URL('../', import.meta.url);
const topology = JSON.parse(readFileSync(new URL('config/data-store-topology.json', root), 'utf8'));
const contents = Object.fromEntries([...new Set(topology.stores.map(s => s.source))]
  .map(file => [file, readFileSync(new URL(file, root), 'utf8')]));

test('production source manifests are registered without claiming live verification', () => {
  const result = auditDataStoreTopology(topology, contents);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.inventory.length, topology.stores.length);
  assert.ok(result.inventory.every(s => s.liveVerified === false));
  assert.ok(result.warnings.some(w => w.includes('independent-board-d1')));
});

test('ready store rejects unresolved identifiers', () => {
  const mutated = structuredClone(topology);
  mutated.stores.find(s => s.id === 'independent-board-d1').state = 'configured';
  const result = auditDataStoreTopology(mutated, contents);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('independent-board-d1')));
});

test('the shared core D1 and independent board D1 cannot be confused', () => {
  const mutated = structuredClone(topology);
  mutated.stores.find(s => s.id === 'independent-board-d1').expectedName = 'ekodi-auth';
  assert.equal(auditDataStoreTopology(mutated, contents).ok, false);
});

test('declaredBindings respects array sections and excludes comments', () => {
  const src = '# [[d1_databases]]\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "x"\ndatabase_id = "abc"\n[[services]]\nbinding = "OTHER"';
  assert.deepEqual(declaredBindings(src, 'd1_databases'), [{ binding:'DB', database_name:'x', database_id:'abc' }]);
});

test('declaredVar reads vars only rather than matching a similarly named nested value', () => {
  const src = '[vars]\nMY_SUPABASE_URL = "https://db.supabase.co"\n[other]\nMY_SUPABASE_URL = "wrong"';
  assert.equal(declaredVar(src, 'MY_SUPABASE_URL'), 'https://db.supabase.co');
});

test('migration backup and no-auto-cutover rules may not be removed', () => {
  const mutated = structuredClone(topology);
  mutated.releaseSafeguards.backupAndRestoreDrillBeforeMigration = false;
  assert.equal(auditDataStoreTopology(mutated, contents).ok, false);
});

test('full Wrangler D1 inventory includes site manifests without leaking provider IDs', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const inventory = JSON.parse(execFileSync(process.execPath,
    ['scripts/inventory-declared-data-stores.mjs'],
    { cwd:fileURLToPath(new URL('../', import.meta.url)), encoding:'utf8' }));
  assert.ok(inventory.declarations >= topology.stores.filter(s=>s.engine==='cloudflare-d1').length);
  assert.ok(inventory.stores.some(s => s.source === 'wrangler.independent-board.toml' &&
    s.binding === 'BOARD_DB' && s.readiness === 'placeholder'));
  assert.ok(inventory.stores.every(s => !('database_id' in s)));
});
