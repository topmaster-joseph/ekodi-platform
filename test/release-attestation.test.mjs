import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('shared-site release exposes Cloudflare version metadata attestation', async () => {
  const [worker, wrangler, manifest, release] = await Promise.all([
    read('platform-router-entry-worker.js'),
    read('wrangler.site.toml'),
    read('deploy/manifests/shared-site.worker.json'),
    read('scripts/guarded-worker-release.mjs'),
  ]);
  assert.match(wrangler, /\[version_metadata\][\s\S]*binding = "CF_VERSION_METADATA"/);
  assert.match(wrangler, /"\/__ekodi\/version"/);
  assert.match(worker, /RELEASE_ATTESTATION_PATH='\/__ekodi\/version'/);
  assert.match(worker, /x-ekodi-release-version/);
  assert.match(worker, /CF_VERSION_METADATA/);
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.worker.attestationPath,'/__ekodi/version');
  assert.match(release, /verifyReleaseAttestation\(candidateVersion, 'candidate'\)/);
  assert.match(release, /verifyReleaseAttestation\(candidateVersion, 'production'\)/);
  assert.match(release, /expected version/);
});
