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
      assert.ok(src.includes("if: ${{ always() && needs.deploy.result == 'success' }}"),
        'downstream browser verification must run after a failed prior probe but never after failed deployment');
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
