import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storagePolicy = JSON.parse(await readFile(new URL('../config/storage-policy.json', import.meta.url), 'utf8'));
const aiContract = JSON.parse(await readFile(new URL('../config/external-ai-module-contract.json', import.meta.url), 'utf8'));
const storageGateway = await readFile(new URL('../storage-gateway.js', import.meta.url), 'utf8');
const writer = await readFile(new URL('../canonical-drive-writer.js', import.meta.url), 'utf8');
const storageWorker = await readFile(new URL('../storage-worker.js', import.meta.url), 'utf8');
const aiGateway = await readFile(new URL('../external-ai-module-gateway.js', import.meta.url), 'utf8');
const apiConfig = await readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8');
const storageConfig = await readFile(new URL('../wrangler.storage.toml', import.meta.url), 'utf8');

test('Shared Drive EKODI is canonical while D1/Supabase and R2 remain supporting tiers', () => {
  assert.equal(storagePolicy.canonicalStore, 'google_workspace_shared_drive');
  assert.equal(storagePolicy.canonicalDriveName, 'EKODI');
  assert.equal(storagePolicy.tiers.canonical.systemOfRecord, true);
  assert.equal(storagePolicy.tiers.operational.systemOfRecord, false);
  assert.equal(storagePolicy.tiers.delivery.systemOfRecord, false);
});

test('Storage Gateway reuses the existing drive.ekodi.kr encrypted OAuth control plane', () => {
  assert.equal(storagePolicy.controlPlane, 'drive.ekodi.kr');
  assert.match(storageGateway, /https:\/\/drive\.ekodi\.kr/);
  assert.match(writer, /storage_connections/);
  assert.match(writer, /storage_routes/);
  assert.match(writer, /supportsAllDrives=true/);
  assert.doesNotMatch(storageGateway, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
  assert.match(storageWorker, /handleStorageGateway/);
  assert.match(storageConfig, /STORAGE_PRIMARY_SHARED_DRIVE_NAME = "EKODI"/);
  assert.match(storageConfig, /STORAGE_PRIMARY_SHARED_DRIVE_ID = "0ACM_FnMYWMFuUk9PVA"/);
});

test('Google credentials stay out of the API worker', () => {
  assert.doesNotMatch(apiConfig, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
  assert.doesNotMatch(apiConfig, /GOOGLE_DRIVE_CLIENT_SECRET\s*=/);
  assert.doesNotMatch(apiConfig, /STORAGE_CREDENTIAL_KEY\s*=/);
  assert.match(apiConfig, /main = "mission-control-entry-worker\.js"/);
});

test('External AI execution is server-to-server and registered-caller attested', () => {
  assert.equal(aiContract.security.executionTrust, 'registered_ekodi_internal_caller');
  assert.equal(aiContract.security.browserDirectExecution, false);
  assert.equal(aiContract.security.providerMayAccessSharedDriveDirectly, false);
  assert.equal(aiContract.security.providerMayAccessEkodiDatabaseDirectly, false);
  assert.match(aiGateway, /EKODI_AI_MODULE_CALLERS/);
  assert.match(aiGateway, /x-ekodi-caller-id/);
  assert.match(aiGateway, /attestedBy/);
});

test('External AI durable output returns through EKODI Storage Gateway', () => {
  assert.equal(aiContract.persistence.durableOutputRoute, 'EKODI Storage Gateway');
  assert.equal(aiContract.persistence.canonicalStore, 'google_workspace_shared_drive');
  assert.match(aiGateway, /storeEkodiDurableRecord/);
  assert.doesNotMatch(aiGateway, /googleapis\.com\/drive/);
});
