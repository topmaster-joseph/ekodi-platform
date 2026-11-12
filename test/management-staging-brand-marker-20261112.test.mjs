import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const management=read('management/index.html');
const workflow=read('.github/workflows/deploy-management.yml');
const match=(s)=>s.match(/<p class="eyebrow">[^<]*<\/p>/)?.[0]||'';

test('management protected staging smoke expects exact current official masthead',()=>{
  const publicMarker=match(management);
  assert.equal(publicMarker,'<p class="eyebrow">EKODI MANAGEMENT</p>');
  assert.ok(workflow.includes("grep -Fq '"+publicMarker+"' /tmp/management.html"));
  assert.ok(!workflow.includes('<p class="eyebrow">MANAGEMENT PLATFORM</p>'));
});
test('staging retains access shield, local isolated fallback, guest-only and no authentication execution',()=>{
  for(const marker of ['Cloudflare Access','wrangler.management.staging.toml',
    'isolated-staging','\"executionEnabled\":false',
    'identity_integration_disabled','\"guestMode\":\"guide-only\"',
    'POST','"503"','deploy-production']){
    assert.ok(workflow.includes(marker),'missing invariant: '+marker);
  }
  assert.match(workflow,/remote_protected=1/);
});
