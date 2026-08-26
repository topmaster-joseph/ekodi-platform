import fs from 'node:fs';

const storage = JSON.parse(fs.readFileSync(new URL('../config/storage-policy.json', import.meta.url), 'utf8'));
const ai = JSON.parse(fs.readFileSync(new URL('../config/external-ai-module-contract.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(storage.canonicalStore === 'google_workspace_shared_drive', 'Shared Drive must be canonical store');
assert(storage.canonicalDriveName === 'EKODI', 'Canonical Shared Drive must be EKODI');
assert(storage.controlPlane === 'drive.ekodi.kr', 'drive.ekodi.kr must remain canonical storage control plane');
assert(storage.credentialsSource.includes('storage_connections'), 'Existing encrypted storage connection must be reused');
assert(storage.routeSource === 'storage_routes', 'Canonical folder routing must use storage_routes');
assert(storage.principles?.durableRecordsGoToDrive === true, 'Durable records must go to Drive');
assert(storage.principles?.externalModulesMayAccessDriveDirectly === false, 'External modules must not access Drive directly');
assert(storage.principles?.reuseCanonicalDriveConnection === true, 'Gateway must reuse canonical Drive connection');
assert(storage.tiers?.canonical?.systemOfRecord === true, 'Canonical tier must be system of record');
assert(storage.tiers?.operational?.systemOfRecord === false, 'Operational DB must not replace canonical durable store');
assert(storage.tiers?.delivery?.systemOfRecord === false, 'R2 delivery tier must not replace canonical durable store');
assert(storage.canonicalFolderNames?.includes('01_CORE') && storage.canonicalFolderNames?.includes('99_BACKUP'), 'Canonical folder structure must be declared');
assert(Array.isArray(storage.forbiddenPaths) && storage.forbiddenPaths.includes('external_ai -> google_drive_direct'), 'Direct external AI Drive access must be forbidden');
assert(storage.forbiddenPaths.includes('parallel_google_credential_system -> canonical_drive'), 'Parallel Google credential systems must be forbidden');

assert(ai.version === '1.0.0', 'External AI contract version must be 1.0.0');
assert(ai.executionPath === '/v1/execute', 'External AI execute path must be stable');
assert(ai.security?.executionTrust === 'registered_ekodi_internal_caller', 'AI execution must require registered EKODI callers');
assert(ai.security?.browserDirectExecution === false, 'Browser direct AI module execution must be forbidden');
assert(ai.security?.providerMayReceiveGoogleCredentials === false, 'Providers must never receive Google credentials');
assert(ai.security?.providerMayAccessSharedDriveDirectly === false, 'Providers must never access Shared Drive directly');
assert(ai.security?.providerMayAccessEkodiDatabaseDirectly === false, 'Providers must never access EKODI DB directly');
assert(ai.persistence?.canonicalStore === storage.canonicalStore, 'AI persistence and storage canonical store must match');
assert(ai.persistence?.durableOutputRoute === 'EKODI Storage Gateway', 'AI durable output must use Storage Gateway');
assert(Array.isArray(ai.moduleManifestRequired) && ai.moduleManifestRequired.includes('secretBinding'), 'Module manifest must use server-side secret binding');

const storageRuntime = fs.readFileSync(new URL('../storage-gateway.js', import.meta.url), 'utf8');
const driveWriter = fs.readFileSync(new URL('../canonical-drive-writer.js', import.meta.url), 'utf8');
const storageWorker = fs.readFileSync(new URL('../storage-worker.js', import.meta.url), 'utf8');
const driveControl = fs.readFileSync(new URL('../google-drive-storage-control.js', import.meta.url), 'utf8');
const aiRuntime = fs.readFileSync(new URL('../external-ai-module-gateway.js', import.meta.url), 'utf8');
const missionControl = fs.readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
const wranglerApi = fs.readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8');
const wranglerStorage = fs.readFileSync(new URL('../wrangler.storage.toml', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0039_storage_ai_gateway.sql', import.meta.url), 'utf8');

assert(storageRuntime.includes('/api/storage/v1'), 'Storage runtime prefix missing');
assert(storageRuntime.includes('https://drive.ekodi.kr'), 'API storage facade must terminate at drive.ekodi.kr');
assert(!storageRuntime.includes('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'), 'Storage Gateway must not create a parallel service-account credential system');
assert(driveWriter.includes('storage_connections'), 'Canonical writer must reuse encrypted storage_connections');
assert(driveWriter.includes('storage_routes'), 'Canonical writer must reuse storage_routes');
assert(driveWriter.includes('supportsAllDrives=true'), 'Canonical writer must support Shared Drives');
assert(driveControl.includes('AES-GCM'), 'Canonical OAuth credentials must remain encrypted');
assert(storageWorker.includes("handleStorageGateway"), 'drive.ekodi.kr worker must serve Storage Gateway');
assert(wranglerStorage.includes('STORAGE_PRIMARY_SHARED_DRIVE_ID = "0ACM_FnMYWMFuUk9PVA"'), 'Canonical EKODI Shared Drive id must remain pinned');

assert(aiRuntime.includes('/api/ai-modules/v1'), 'AI module gateway prefix missing');
assert(aiRuntime.includes("new URL('/v1/execute'"), 'Vendor execute contract missing');
assert(aiRuntime.includes('storeEkodiDurableRecord'), 'AI module persistence must route through EKODI Storage Gateway');
assert(aiRuntime.includes('EKODI_AI_MODULE_CALLERS'), 'AI module execution must require registered internal callers');
assert(aiRuntime.includes('attestedBy'), 'Vendor context must carry EKODI caller attestation');
assert(migration.includes('storage_audit_logs') && migration.includes('ai_module_audit_logs'), 'Gateway audit tables must be migration-managed');

assert(missionControl.includes("import { handleStorageGateway } from './storage-gateway.js'"), 'Canonical Mission Control must import Storage Gateway');
assert(missionControl.includes("import { handleExternalAiModuleGateway } from './external-ai-module-gateway.js'"), 'Canonical Mission Control must import External AI Module Gateway');
assert(missionControl.includes("path.startsWith('/api/storage/v1')"), 'Canonical Mission Control must route Storage Gateway');
assert(missionControl.includes("path.startsWith('/api/ai-modules/v1')"), 'Canonical Mission Control must route External AI Module Gateway');
assert(/main\s*=\s*"mission-control-entry-worker\.js"/.test(wranglerApi), 'wrangler.api.toml must preserve canonical Mission Control entry');

console.log('EKODI storage + external AI module contracts: OK');
