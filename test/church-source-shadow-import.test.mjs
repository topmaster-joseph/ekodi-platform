import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const churchRoot = resolve(repoRoot, 'sites', 'ekodi-church');
const manifest = JSON.parse(readFileSync(resolve(churchRoot, 'source-import-manifest.json'), 'utf8'));
const gitBlobHash = buffer => createHash('sha1')
  .update(Buffer.from('blob ' + buffer.length + '\0'))
  .update(buffer)
  .digest('hex');
const walk = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
  const absolute = resolve(folder, entry.name);
  if(entry.isDirectory()) return walk(absolute);
  assert.equal(entry.isFile(), true, 'symlink or unsupported source file: ' + absolute);
  return [relative(churchRoot, absolute).split(sep).join('/')];
});

test('Church shadow import has explicit non-production provenance and exact file set', () => {
  assert.equal(manifest.contract, 'ekodi.church-shadow-import.v1');
  assert.equal(manifest.mode, 'shadow-source-only');
  assert.equal(manifest.sourceRepository, 'topmaster-joseph/ekodi-church');
  assert.equal(manifest.sourceCommit, '520d4f2daf7e5e4dc53bf928c9df626b5f896600');
  assert.equal(manifest.sourceTree, '30f2d5396b416aec9aca9773c84710052f4f8c35');
  assert.equal(manifest.sourceOwnershipTransferred, false);
  assert.equal(manifest.productionReleaseSwitched, false);
  assert.equal(manifest.legacyRepositoryDeletionAuthorized, false);
  assert.equal(manifest.importedTrackedFileCount, 208);
  assert.equal(manifest.excludedWorkflows.length, 8);
  assert.equal(manifest.nestedWorkflowFilesInert, false);
  const expected = new Set(manifest.trackedFiles.map(item => item.path));
  assert.equal(expected.size, 208, 'duplicate manifest entries');
  assert.ok([...expected].every(p => !p.includes('..') && !p.startsWith('/') ));
  const actual = walk(churchRoot).filter(path => path !== 'source-import-manifest.json' && path !== 'MIGRATION_README.md' && path !== '.gitattributes');
  assert.deepEqual(actual.sort(), [...expected].sort(), 'source asset tree has drifted');
});

test('Church copied HTML, JS, CSS, worship assets and tests match original Git blob SHA', () => {
  for(const entry of manifest.trackedFiles) {
    assert.match(entry.blobSha, /^[a-f0-9]{40}$/);
    const actual = gitBlobHash(readFileSync(resolve(churchRoot, entry.path)));
    assert.equal(actual, entry.normalizedBlobSha || entry.blobSha, 'source content changed: ' + entry.path);
  }
});

test('Shadow copy never silently switches current guarded Church release owner', () => {
  const workflow = readFileSync(resolve(repoRoot, '.github/workflows/deploy-ekodi-church-homepage.yml'), 'utf8');
  assert.ok(workflow.includes('topmaster-joseph/ekodi-church'), 'current production checkout changed without source cutover');
  assert.ok(workflow.includes('release_branch_ref'), 'Orchestrator release provenance gate missing');
  assert.ok(workflow.includes('release_task_id'), 'Orchestrator release task gate missing');
});