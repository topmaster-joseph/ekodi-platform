import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const run=files=>execFileSync(process.execPath,['scripts/constitution-check.mjs','--files',files],{cwd:root,encoding:'utf8'});
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Constitution Registry points every active rule at the canonical Constitution',async()=>{
  const registry=JSON.parse(await read('governance/registry/constitution-registry.json'));
  const constitution=JSON.parse(await read('governance/constitution/constitution.json'));
  const resolve=pointer=>pointer.split('/').slice(1).reduce((value,key)=>value?.[key],constitution);
  for(const rule of registry.rules.filter(rule=>rule.status==='active')) assert.notEqual(resolve(rule.sourcePointer),undefined,`${rule.id} pointer`);
});

test('advisory check recognizes current authorization and workspace-routing files',()=>{
  const auth=run('auth-worker-core.js,ekodi-authorization.js');
  assert.match(auth,/Result:\*\* RELATED/);
  assert.match(auth,/AUTH-001/);
  const workspace=run('workspace-route-policy.js,space-worker.js');
  assert.match(workspace,/WORKSPACE-001/);
});

test('advisory check recognizes surface-engine and evolution intelligence changes',()=>{
  const surface=run('marketing-canonical-projection.js,my/progressive-personalization.js');
  assert.match(surface,/SURFACE-001/);
  const evolution=run('traffic-intelligence.js,scripts\/collect-traffic-intelligence.mjs');
  assert.match(evolution,/EVOLVE-001/);
});

test('advisory check recognizes Trust Layer security boundary',()=>{
  const trust=run('supabase/functions/_shared/trust.ts,supabase/functions/access-api/index.ts,supabase/functions/trust-api/index.ts,supabase/migrations/20260905020000_access_api_trust_shadow.sql,docs/security/TRUST_LAYER.md');
  assert.match(trust,/Result:\*\* RELATED/);
  assert.match(trust,/TRUST-001/);
});

test('advisory check recognizes reserved system-domain ownership',()=>{
  const systemDomain=run('wrangler.ai.toml,wrangler.site.toml,.github/workflows/deploy-ai-gateway.yml,deploy/manifests/shared-site.worker.json,test/ai-gateway-domain.test.mjs');
  assert.match(systemDomain,/Result:\*\* RELATED/);
  assert.match(systemDomain,/DOMAIN-002/);
  const sharedSiteDomain=run('wrangler.site.toml');
  assert.match(sharedSiteDomain,/Result:\*\* RELATED/);
  assert.match(sharedSiteDomain,/DOMAIN-002/);
});
