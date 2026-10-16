import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/backup-ekodi-core.yml', import.meta.url), 'utf8');
const step = name => {
  const marker = '      - name: ' + name + '\n';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'missing workflow step: ' + name);
  const next = workflow.indexOf('      - name: ', start + marker.length);
  return workflow.slice(start, next < 0 ? undefined : next);
};

test('production backup SQL is never uploaded to GitHub Actions artifacts', () => {
  const upload = step('Upload isolated PR restore report only');
  assert.match(upload, /if: github\.event_name == 'pull_request' && steps\.verify\.outcome == 'success'/);
  assert.match(upload, /path: backup\/restore-report\.txt/);
  assert.doesNotMatch(upload, /backup\/ekodi-auth\.sql/);
  assert.doesNotMatch(workflow, /GitHub Artifact fallback retained/);
});

test('production backup requires private R2 persistence and checksum roundtrip', () => {
  const bucket = step('Ensure private R2 backup bucket');
  const persist = step('Persist verified backup to R2');
  assert.doesNotMatch(bucket, /continue-on-error: true/);
  assert.doesNotMatch(persist, /continue-on-error: true/);
  assert.match(persist, /r2 object put/);
  assert.match(persist, /r2 object get/);
  assert.match(persist, /test "\$ACTUAL_CHECKSUM" = "\$EXPECTED_CHECKSUM"/);
  assert.match(step('Erase local backup export after verification and any report upload'), /if: always\(\)/);
});
