import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [workflow,helper]=await Promise.all([
  readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8'),
  readFile(new URL('../scripts/github-status-transient.sh',import.meta.url),'utf8'),
]);
const step=workflow.slice(workflow.lastIndexOf('      - name: Publish Control API production status'));

test('status transport is strictly after guarded release and cannot redeploy',()=>{
  const guarded=workflow.indexOf('      - name: Guarded 0-percent Control candidate then promote');
  const publisher=workflow.lastIndexOf('      - name: Publish Control API production status');
  assert.ok(guarded>=0 && publisher>guarded);
  assert.match(step,/if: always\(\)/);
  assert.match(step,/source scripts\/github-status-transient\.sh/);
  assert.match(step,/case "\$JOB_STATUS" in/);
  assert.match(step,/success\) state=success/);
  assert.match(step,/cancelled\) state=error/);
  assert.match(step,/\*\) state=failure/);
  assert.match(step,/curl --fail-with-body -sS/);
  assert.match(step,/\/statuses\/\$\{GITHUB_SHA\}/);
  assert.doesNotMatch(step,/\|\|\s*true|wrangler\s+(?:deploy|versions deploy)/);
});

test('GitHub installation quota and permissions are distinct fail-closed transport outcomes',()=>{
  assert.match(helper,/quota_primary/);
  assert.match(helper,/quota_secondary/);
  assert.match(helper,/permission_denied/);
  assert.match(helper,/authentication_denied/);
  assert.match(helper,/validation_denied/);
  assert.match(helper,/status_kind='quota_primary'/);
  assert.match(helper,/status_kind='permission_denied'/);
  assert.match(helper,/return 22/);
  assert.doesNotMatch(helper,/success.*quota_primary|quota_primary.*success/);
});

test('denial reports do not echo tokens, raw response bodies or impersonate production verification',()=>{
  assert.match(step,/prior guarded deployment job outcome/i);
  assert.match(step,/a denial is not a new deployment or rollback/);
  assert.match(helper,/Never log raw response headers\/body/);
  assert.match(helper,/EKODI GitHub status transport/);
  assert.doesNotMatch(step,/echo\s+\$GH_TOKEN|cat\s+\$GH_TOKEN/);
});
