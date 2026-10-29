import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/deploy-ai-control.yml',import.meta.url),'utf8');
const production=workflow.slice(workflow.indexOf('\n  deploy-production:\n'));
const position=label=>production.indexOf('      - name: '+label);
const owner='Confirm exact-artifact owner approval before any production D1 writes';
const backup='Capture production D1 recovery bookmark';
const migrate='Apply additive AI ledger migrations after staging success';
const guarded='Attach supplied secrets or preserve existing Worker secrets, verify at 0%, then promote';

test('production mutation cannot precede the opt-in exact immutable owner verification',()=>{
  assert.ok(position(owner)>0);
  assert.ok(position(backup)>position(owner));
  assert.ok(position(migrate)>position(owner));
  assert.ok(position(guarded)>position(migrate));
  assert.match(production,/EKODI_FINAL_PROMOTION_MODE: \$\{\{ vars\.EKODI_FINAL_PROMOTION_MODE \}\}/);
  assert.match(production,/EKODI_RELEASE_ARTIFACT_DIGEST: \$\{\{ needs\.deploy-staging\.outputs\.artifact_digest \}\}/);
  assert.match(production,/EKODI_RELEASE_SHA: \$\{\{ github\.sha \}\}/);
});
test('missing or malformed enforcement configuration cannot silently approve production mutations',()=>{
  const section=production.slice(position(owner),position(backup));
  assert.match(section,/if\(mode!=='enforced'&&mode!==''\)/);
  assert.match(section,/EKODI_FINAL_PROMOTION_MODE_INVALID/);
  assert.match(section,/EKODI_FINAL_PROMOTION_MAIN_SHA_MISMATCH/);
  assert.match(section,/verifyEkodiProtectedPromotion\(/);
  assert.match(section,/receipt\.verified!==true/);
  assert.match(section,/EKODI_FINAL_PROMOTION_OWNER_APPROVAL_REQUIRED/);
  assert.doesNotMatch(section,/productionDeployed:\s*true/);
});
test('legacy behavior is not changed until the owner completes official migration to enforced mode',()=>{
  assert.match(production,/vars\.EKODI_FINAL_PROMOTION_MODE/);
  assert.match(production,/if\(mode==='enforced'\)/);
  const i=production.indexOf('if(mode===\'enforced\')');
  assert.ok(i>0);
  assert.match(production.slice(i,i+1150),/legacy protected release rules remain active/);
  assert.match(production,/needs: \[validate, deploy-staging\]/);
});
