import fs from 'node:fs';

const storage = JSON.parse(fs.readFileSync(new URL('../config/storage-policy.json', import.meta.url), 'utf8'));
const ai = JSON.parse(fs.readFileSync(new URL('../config/external-ai-module-contract.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(storage.canonicalStore === 'google_workspace_shared_drive', 'Shared Drive must be canonical store');
assert(storage.canonicalDriveName === 'EKODI', 'Canonical Shared Drive must be EKODI');
assert(storage.principles?.durableRecordsGoToDrive === true, 'Durable records must go to Drive');
assert(storage.principles?.externalModulesMayAccessDriveDirectly === false, 'External modules must not access Drive directly');
assert(storage.tiers?.canonical?.systemOfRecord === true, 'Canonical tier must be system of record');
assert(storage.tiers?.operational?.systemOfRecord === false, 'Operational DB must not replace canonical durable store');
assert(storage.tiers?.delivery?.systemOfRecord === false, 'R2 delivery tier must not replace canonical durable store');
assert(storage.knownFolders?.core?.folderId, '01_CORE folder id is required');
assert(storage.knownFolders?.backup?.folderId, '99_BACKUP folder id is required');
assert(Array.isArray(storage.forbiddenPaths) && storage.forbiddenPaths.includes('external_ai -> google_drive_direct'), 'Direct external AI Drive access must be forbidden');

assert(ai.version === '1.0.0', 'External AI contract version must be 1.0.0');
assert(ai.executionPath === '/v1/execute', 'External AI execute path must be stable');
assert(ai.security?.providerMayReceiveGoogleCredentials === false, 'Providers must never receive Google credentials');
assert(ai.security?.providerMayAccessSharedDriveDirectly === false, 'Providers must never access Shared Drive directly');
assert(ai.security?.providerMayAccessEkodiDatabaseDirectly === false, 'Providers must never access EKODI DB directly');
assert(ai.persistence?.canonicalStore === storage.canonicalStore, 'AI persistence and storage canonical store must match');
assert(ai.persistence?.durableOutputRoute === 'EKODI Storage Gateway', 'AI durable output must use Storage Gateway');
assert(Array.isArray(ai.moduleManifestRequired) && ai.moduleManifestRequired.includes('secretBinding'), 'Module manifest must use server-side secret binding');

const storageRuntime = fs.readFileSync(new URL('../storage-gateway.js', import.meta.url), 'utf8');
const aiRuntime = fs.readFileSync(new URL('../external-ai-module-gateway.js', import.meta.url), 'utf8');
const missionControl = fs.readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8');

assert(storageRuntime.includes('/api/storage/v1'), 'Storage runtime prefix missing');
assert(storageRuntime.includes('supportsAllDrives=true'), 'Shared Drive upload support missing');
assert(storageRuntime.includes('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'), 'Service account authentication support missing');
assert(aiRuntime.includes('/api/ai-modules/v1'), 'AI module gateway prefix missing');
assert(aiRuntime.includes("new URL('/v1/execute'"), 'Vendor execute contract missing');
assert(aiRuntime.includes('handleStorageGateway'), 'AI module persistence must route through Storage Gateway');
assert(missionControl.includes("import { handleStorageGateway } from './storage-gateway.js'"), 'Canonical Mission Control must import Storage Gateway');
assert(missionControl.includes("import { handleExternalAiModuleGateway } from './external-ai-module-gateway.js'"), 'Canonical Mission Control must import External AI Module Gateway');
assert(missionControl.includes("path.startsWith('/api/storage/v1')"), 'Canonical Mission Control must route Storage Gateway');
assert(missionControl.includes("path.startsWith('/api/ai-modules/v1')"), 'Canonical Mission Control must route External AI Module Gateway');
assert(/main\s*=\s*"mission-control-entry-worker\.js"/.test(wrangler), 'wrangler.api.toml must preserve canonical Mission Control entry');

console.log('EKODI storage + external AI module contracts: OK');
