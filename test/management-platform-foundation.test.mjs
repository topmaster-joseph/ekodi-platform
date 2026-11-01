import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MANAGEMENT_ACCESS_POLICY,
  MANAGEMENT_MODULES,
  MANAGEMENT_WORKSPACE_KINDS,
  MANAGEMENT_WORKSPACE_TYPES,
  entitlementPreview,
  moduleCanMutateExternalState,
  workspaceContext
} from '../management-platform.js';

const policy=JSON.parse(readFileSync(new URL('../config/management-platform.json',import.meta.url),'utf8'));
const worker=readFileSync(new URL('../management-worker.js',import.meta.url),'utf8');

test('management platform preserves EKODI guest and Google-free-entry policy',()=>{
  assert.equal(MANAGEMENT_ACCESS_POLICY.guestMode,'guide-only');
  assert.equal(MANAGEMENT_ACCESS_POLICY.identityProvider,'google');
  assert.equal(MANAGEMENT_ACCESS_POLICY.minimumTier,'free');
  assert.equal(policy.platform.authHub,'https://ekodi.kr/auth/');
  assert.equal(policy.platform.shellRequired,true);
});

test('customer types map onto the existing canonical EKODI workspace kinds',()=>{
  for(const kind of ['person','business','organization','community','project']) assert.ok(MANAGEMENT_WORKSPACE_KINDS.includes(kind));
  const franchiseType=MANAGEMENT_WORKSPACE_TYPES.find(item=>item.id==='franchise');
  const institutionType=MANAGEMENT_WORKSPACE_TYPES.find(item=>item.id==='institution');
  assert.equal(franchiseType?.canonicalKind,'organization');
  assert.equal(franchiseType?.label,'프랜차이즈');
  assert.equal(institutionType?.canonicalKind,'organization');
  const franchise=workspaceContext({id:'brand-a',type:'franchise',role:'owner',capabilities:['menu','sales','menu']});
  const store=workspaceContext({id:'store-1',type:'business',parentId:franchise.id,role:'manager'});
  assert.equal(franchise.type,'franchise');
  assert.equal(franchise.kind,'organization');
  assert.equal(store.kind,'business');
  assert.equal(store.parentId,'brand-a');
  assert.deepEqual(franchise.capabilities,['menu','sales']);
});

test('public catalog exposes user-facing types separately from canonical kinds',()=>{
  assert.match(worker,/MANAGEMENT_WORKSPACE_TYPES/);
  assert.match(worker,/workspaceTypes:publicWorkspaceTypes\(\)/);
  assert.match(worker,/workspaceKinds:MANAGEMENT_WORKSPACE_KINDS/);
});

test('tier and module choice remain independent',()=>{
  const free=entitlementPreview({tier:'free',selectedModuleIds:['review','menu']});
  assert.equal(free.tier,'free');
  assert.deepEqual(free.selectedModules,['menu','review']);
  assert.equal(free.selectionBlockedByTier,false);
  assert.equal(free.principle,'base-tier + selected-modules + usage');
});

test('existing Marketing AI is reused and specialist catalog contains requested first wave',()=>{
  const marketing=MANAGEMENT_MODULES.find(module=>module.id==='marketing');
  assert.equal(marketing?.reuseExisting,true);
  assert.equal(marketing?.url,'https://ekodi.kr/ekodibiz/marketing-ai');
  for(const id of ['chief','marketing','menu','order','review','customer','sales']) assert.ok(MANAGEMENT_MODULES.some(module=>module.id===id));
});

test('external channel mutations fail closed without approval and official adapters',()=>{
  assert.deepEqual(moduleCanMutateExternalState('order','external_order_mutation'),{allowed:false,reason:'human_approval_required'});
  assert.deepEqual(moduleCanMutateExternalState('order','external_order_mutation',{humanApproved:true}),{allowed:false,reason:'official_adapter_disabled'});
  assert.deepEqual(moduleCanMutateExternalState('order','external_order_mutation',{humanApproved:true,adapterEnabled:true}),{allowed:true,reason:'approved_adapter'});
});

test('canonical data contract includes menu/order/review shared identifiers',()=>{
  for(const entity of ['product','menu','channel-menu-mapping','order','review']) assert.ok(policy.canonicalData.entities.includes(entity));
  assert.match(policy.canonicalData.crossModuleRule,/no private cross-module database reads/i);
});

test('management auth URLs are canonical and login return is limited to management path',async()=>{
  const {runInNewContext}=await import('node:vm');
  const app=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
  const index=readFileSync(new URL('../management/index.html',import.meta.url),'utf8');
  const authClient=readFileSync(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
  const authRouter=readFileSync(new URL('../auth-site/auth-router.js',import.meta.url),'utf8');
  const host=['auth','ekodi','kr'].join('.');
  assert.ok(!index.includes('https://'+host));
  assert.ok(!app.includes('https://'+host));
  assert.ok(index.includes('https://ekodi.kr/auth/?site=management'));
  assert.ok(authClient.includes("management:{name:'EKODI 경영플랫폼',returnTo:'https://ekodi.kr/management/'"));
  assert.match(authRouter,/firstPartyClientSites=new Set\(\[[^\]]*'management'/);
  const start=app.indexOf('function authUrl(){');
  const end=app.indexOf('\n}',start);
  assert.ok(start>=0&&end>start,'management authUrl function found');
  const fn=app.slice(start,end+2);
  const urlFor=href=>new URL(runInNewContext('('+fn+')()', {URL,location:{href}}));
  const fromActual=urlFor('https://ekodi.kr/management/reports/?period=2026-Q4#private');
  assert.equal(fromActual.origin,'https://ekodi.kr');
  assert.equal(fromActual.pathname,'/auth/');
  assert.equal(fromActual.searchParams.get('site'),'management');
  assert.equal(fromActual.searchParams.get('return_to'),'https://ekodi.kr/management/reports/?period=2026-Q4');
  const untrusted=urlFor('https://outside.example/management/?period=2026-Q4');
  assert.equal(untrusted.searchParams.get('return_to'),'https://ekodi.kr/management/');
  const anotherSite=urlFor('https://ekodi.kr/my/private');
  assert.equal(anotherSite.searchParams.get('return_to'),'https://ekodi.kr/management/');
});

test('management public Worker and both configurations refuse to publish old auth hosts',()=>{
  const worker=readFileSync(new URL('../management-worker.js',import.meta.url),'utf8');
  const prod=readFileSync(new URL('../wrangler.management.toml',import.meta.url),'utf8');
  const staging=readFileSync(new URL('../wrangler.management.staging.toml',import.meta.url),'utf8');
  const management=readFileSync(new URL('../management-platform.js',import.meta.url),'utf8');
  assert.ok(worker.includes("authUrl:'https://ekodi.kr/auth/?site=management'"));
  assert.ok(!worker.includes('env.AUTH_URL||'));
  assert.ok(worker.includes('https://ekodi.kr/admin/?route=organization&source=management'));
  assert.ok(management.includes("authHub:'https://ekodi.kr/auth/'"));
  assert.equal(policy.platform.canonicalUrl,'https://ekodi.kr/management/');
  for(const cfg of [prod,staging])assert.ok(cfg.includes('AUTH_URL = "https://ekodi.kr/auth/?site=management"'));
  // Subdomain wave 2 (2026-11-01): the legacy custom-domain binding is retired; apex /management only.
  assert.ok(!prod.includes('pattern = "'+['management','ekodi','kr'].join('.')+'"'));
});
