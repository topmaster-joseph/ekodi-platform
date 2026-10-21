import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'config', 'supabase-environment-boundary.json');
const legacyDrainPath = path.join(root, 'config', 'supabase-dev-legacy-drain.json');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(fs.existsSync(policyPath), 'missing config/supabase-environment-boundary.json');
expect(fs.existsSync(legacyDrainPath), 'missing config/supabase-dev-legacy-drain.json');

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
  expect(prod.currentSupabaseName === 'ekodi-platform-prod', 'production Supabase name drifted');
  expect(dev.projectRef === 'lxcxwbdwwojjkgybbqii', 'development project ref drifted');
  expect(dev.currentSupabaseName === 'ekodi-platform-dev', 'development Supabase name drifted');
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
  expect(security.anonymousSecurityDefinerRpcRequiresExplicitReviewComment === true, 'anonymous SECURITY DEFINER RPCs must require explicit review comments');
  expect(security.productionSecretsInDevelopmentForbidden === true, 'production secrets must remain forbidden in development');
  expect(security.developmentSecretsInProductionForbidden === true, 'development secrets must remain forbidden in production');
}

if (failures.length === 0) {
  const legacy = JSON.parse(fs.readFileSync(legacyDrainPath, 'utf8'));
  expect(legacy.policyId === 'SUPABASE-DEV-LEGACY-DRAIN-001', 'legacy drain policy id drifted');
  expect(legacy.status === 'enforced', 'legacy drain policy must remain enforced');
  expect(legacy.developmentProjectRef === 'lxcxwbdwwojjkgybbqii', 'legacy drain development ref drifted');
  expect(legacy.developmentProjectName === 'ekodi-platform-dev', 'legacy drain development name drifted');
  expect(legacy.productionProjectRef === 'renzehysxirjilvdxacv', 'legacy drain production ref drifted');
  expect(legacy.productionProjectName === 'ekodi-platform-prod', 'legacy drain production name drifted');
  expect(legacy.retirementMode === '410-tombstone', 'retired development functions must remain fail-closed tombstones');
  const preserved = new Set(legacy.preservedFunctions || []);
  const retired = new Set(legacy.retiredFunctions || []);
  expect(preserved.size === 3, 'unexpected preserved development Edge Function set');
  for (const required of ['church-pastor-api','ekodi-resource-telemetry','free-tier-usage']) {
    expect(preserved.has(required), `missing preserved development function: ${required}`);
  }
  expect(retired.size === 16, 'unexpected retired development Edge Function set');
  for (const name of preserved) expect(!retired.has(name), `function cannot be both preserved and retired: ${name}`);
  expect(legacy.rules?.noNewProductionDependenciesOnDevelopment === true, 'new production dependencies on development must remain forbidden');
  expect(legacy.rules?.retiredFunctionsMustReturnGone === true, 'retired functions must remain fail-closed');
  expect(legacy.rules?.destructiveDeletionRequiresDependencyProof === true, 'destructive deletion must require dependency proof');
  expect(legacy.rules?.productionDataCopyToDevelopmentForbidden === true, 'production data copy to development must remain forbidden');
}

if (failures.length) {
  console.error('[EKODI][SUPABASE-ENV-001] boundary validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[EKODI][SUPABASE-ENV-001] development/production boundary validated.');
console.log('[EKODI][SUPABASE-ENV-001] production data remains isolated from development.');
console.log('[EKODI][SUPABASE-ENV-001] production promotion remains migration + guarded-release + live-verification only.');
