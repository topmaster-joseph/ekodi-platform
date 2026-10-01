import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'config', 'supabase-environment-boundary.json');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(fs.existsSync(policyPath), 'missing config/supabase-environment-boundary.json');

if (failures.length === 0) {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  expect(policy.policyId === 'SUPABASE-ENV-001', 'policy id must remain SUPABASE-ENV-001');
  expect(policy.status === 'enforced', 'Supabase environment boundary must remain enforced');

  const prod = policy.productionProject || {};
  const dev = policy.developmentProject || {};
  const promotion = policy.promotion || {};
  const traffic = policy.traffic || {};
  const security = policy.security || {};

  expect(prod.projectRef === 'renzehysxirjilvdxacv', 'production project ref drifted');
  expect(dev.projectRef === 'lxcxwbdwwojjkgybbqii', 'development project ref drifted');
  expect(prod.projectRef !== dev.projectRef, 'development and production must be different projects');
  expect(prod.purpose === 'production', 'production project role mismatch');
  expect(dev.purpose === 'development', 'development project role mismatch');
  expect(prod.realUserDataAllowed === true, 'production must remain the only real-user data plane');
  expect(dev.realUserDataAllowed === false, 'real production user data must remain forbidden in development');
  expect(dev.testOnlyDataRequired === true, 'development must require test-only data');
  expect(dev.productionCredentialAccessAllowed === false, 'development may not access production credentials');
  expect(prod.directDevelopmentMutationAllowed === false, 'direct development mutation of production must remain forbidden');

  expect(promotion.source === 'development', 'promotion must start from development');
  expect(promotion.target === 'production', 'promotion target must remain production');
  expect(promotion.schemaMovesForwardViaVersionedMigrations === true, 'schema promotion must use versioned migrations');
  expect(promotion.productionDataCopiesBackToDevelopment === false, 'production data must never copy back to development');
  expect(promotion.productionMutationRequiresGuardedRelease === true, 'production mutation must use guarded release');
  expect(promotion.productionCompletionRequiresLiveVerification === true, 'production completion must require live verification');

  expect(traffic.cloudflareFirst === true, 'traffic must remain Cloudflare-first');
  expect(traffic.supabaseIsCanonicalDataPlane === true, 'Supabase must remain the canonical data plane');
  expect(traffic.publicReadsPreferEdgeCache === true, 'public reads must prefer edge cache');
  expect(traffic.realtimeSelective === true, 'Realtime must remain selective');
  expect(traffic.directDatabaseConnectionsFromBrowsersForbidden === true, 'browser direct Postgres connections must remain forbidden');

  expect(security.serviceRoleFrontendExposureForbidden === true, 'service role exposure to frontend must remain forbidden');
  expect(security.rlsRequiredForExposedTables === true, 'RLS must remain required for exposed tables');
  expect(security.securityDefinerRpcMustBeReviewed === true, 'SECURITY DEFINER RPC review must remain required');
  expect(security.productionSecretsInDevelopmentForbidden === true, 'production secrets must remain forbidden in development');
  expect(security.developmentSecretsInProductionForbidden === true, 'development secrets must remain forbidden in production');
}

if (failures.length) {
  console.error('[EKODI][SUPABASE-ENV-001] boundary validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[EKODI][SUPABASE-ENV-001] development/production boundary validated.');
console.log('[EKODI][SUPABASE-ENV-001] production data remains isolated from development.');
console.log('[EKODI][SUPABASE-ENV-001] production promotion remains migration + guarded-release + live-verification only.');
