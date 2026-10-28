import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const yaml=readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');

const part=job=>{
  const anchor='\n  '+job+':\n';
  const start=yaml.indexOf(anchor);
  assert.ok(start>=0,'missing postdeploy job '+job);
  const remaining=yaml.slice(start+anchor.length);
  return remaining.split(/\n  [a-z][a-z0-9_-]*:\n/)[0];
};
test('native Site Core and Admin probes are paced after the guarded deploy',()=>{
  const ordered=[
    ['native_surface_verification_desktop',null],
    ['native_surface_verification_mobile','native_surface_verification_desktop'],
    ['native_research_verification_desktop','native_surface_verification_mobile'],
    ['native_research_verification_mobile','native_research_verification_desktop'],
    ['authenticated_admin_surface_verification','native_research_verification_mobile'],
  ];
  for(const [name,previous] of ordered){
    const src=part(name);
    assert.match(src,/(?:needs: deploy|needs: \[deploy,)/,'every verification must depend on the deployment');
    assert.doesNotMatch(src,/continue-on-error:\s*true/,'failed postdeploy checks must remain blocking');
    if(previous){
      assert.ok(src.includes('needs: [deploy, '+previous+']'),'expected previous verification for '+name);
      assert.doesNotMatch(src,/if:\s*\$\{\{\s*always\(\)/,
        'CF-QUOTA-001 must stop downstream production requests after any failed predecessor');
    }else{
      assert.match(src,/needs: deploy/);
    }
  }
});

test('native desktop, mobile and Admin remain genuine independent read-only verifiers',()=>{
  assert.match(part('native_surface_verification_desktop'),/device_profile: desktop/);
  assert.match(part('native_surface_verification_mobile'),/device_profile: mobile-portrait/);
  assert.match(part('authenticated_admin_surface_verification'),/verify-admin-production-ui-e2e\.yml/);
  assert.match(part('native_research_verification_desktop'),/surface_paths: \/research\//);
  assert.match(part('native_research_verification_mobile'),/surface_paths: \/research\//);
  assert.match(yaml,/Candidate at 0%, verify routes, promote and auto-rollback on failure/);
});

test('quota or any failed predecessor blocks later verifiers with an explicit receipt-only job',()=>{
  const receipt=part('post_promotion_browser_verification_receipt');
  assert.match(receipt,/needs: \[deploy, native_surface_verification_desktop, native_surface_verification_mobile,/);
  assert.match(receipt,/if: \$\{\{ always\(\) \}\}/);
  assert.match(receipt,/policyId:'CF-QUOTA-001'/);
  assert.match(receipt,/verification:state==='success'\?'verified':state==='skipped'\?'blocked':'failed'/);
  assert.match(receipt,/upstream-failure-or-quota-circuit/);
  assert.match(receipt,/if\(!verified\)process\.exitCode=1/);
  assert.match(receipt,/productionRequestsMade:0/);
  assert.match(receipt,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(receipt,/curl |fetch\(|page\.goto|continue-on-error:\s*true/);
});
