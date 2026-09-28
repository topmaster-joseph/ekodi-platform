import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyAccount, buildCleanupPlan, buildFinancialCleanupBrief, requiresHumanGate } from '../money/core.js';
import { buildConsentPreview, buildIntegrationReadiness, providerFor, securityEvent } from '../money/integrations.js';
import { KFTC_OPENBANKING, kftcOpenBankingReadiness } from '../money/kftc-openbanking.js';

test('inactive unlinked account is cleanup candidate',()=>{
  const r=classifyAccount({id:'a',institution:'A',alias:'old',balance:50000,inactiveDays:400,autoDebits:[]});
  assert.equal(r.status,'cleanup');
});

test('loan-linked account is never suggested for autonomous cleanup',()=>{
  const r=classifyAccount({id:'a',inactiveDays:700,linkedLoan:true});
  assert.equal(r.status,'attention');
});

test('cleanup order moves autopay before balance and closure',()=>{
  const plan=buildCleanupPlan([
    {id:'main',institution:'A',alias:'생활',primary:true,balance:1000,inactiveDays:1},
    {id:'old',institution:'B',alias:'예전',balance:30000,inactiveDays:400,autoDebits:[{name:'보험료',amount:10000}]}
  ],'main');
  const types=plan.steps.filter(x=>x.accountId==='old').map(x=>x.type);
  assert.deepEqual(types,['change-autopay','transfer-balance','close-account']);
  assert.equal(plan.autonomousFinancialExecution,false);
});

test('financial actions always require human gate',()=>{
  for(const action of ['transfer-balance','close-account','change-autopay','cancel-autopay','payment','withdraw']) assert.equal(requiresHumanGate(action),true);
  assert.equal(requiresHumanGate('analyze'),false);
});

test('brief remains decision support rather than execution',()=>{
  const brief=buildFinancialCleanupBrief([{id:'a',inactiveDays:500,balance:10000,autoDebits:[]}]);
  assert.equal(brief.plan.executionMode,'human-confirmed-handoff');
  assert.equal(brief.plan.autonomousFinancialExecution,false);
  assert.match(brief.disclaimer,/명시적 승인/);
});

test('official accountinfo handoff remains available without live API access',()=>{
  const provider=providerFor('accountinfo');
  assert.equal(provider.state,'available');
  assert.equal(provider.mode,'official-handoff');
  assert.equal(provider.liveAccess,false);
});

test('open banking requires contract, canonical redirect, security stores, approved scopes and server adapter',()=>{
  const incomplete=buildIntegrationReadiness({KFTC_OPENBANKING_ENABLED:'true',KFTC_OPENBANKING_CLIENT_ID:'client',KFTC_OPENBANKING_REDIRECT_URI:KFTC_OPENBANKING.canonicalRedirectUri,OAUTH_STATE_STORE_READY:'true'});
  assert.equal(incomplete.openBankingConfigured,false);
  const configuredEnv={KFTC_OPENBANKING_ENABLED:'true',KFTC_OPENBANKING_CONTRACT_APPROVED:'true',KFTC_OPENBANKING_CLIENT_ID:'client',KFTC_OPENBANKING_REDIRECT_URI:KFTC_OPENBANKING.canonicalRedirectUri,OAUTH_STATE_STORE_READY:'true',TOKEN_ENCRYPTION_READY:'true',CONSENT_STORE_READY:'true',KFTC_OPENBANKING_APPROVED_READ_SCOPES:'accounts:read,balances:read,transactions:read'};
  const configured=buildIntegrationReadiness(configuredEnv);
  assert.equal(configured.openBankingConfigured,true);
  assert.equal(configured.openBankingReadReady,false);
  const bound=buildIntegrationReadiness({...configuredEnv,KFTC_OPENBANKING_ADAPTER:{fetch:async()=>new Response('{}')}});
  assert.equal(bound.openBankingReadReady,true);
  assert.equal(bound.financialExecution,false);
  assert.equal(kftcOpenBankingReadiness(configuredEnv).transferReady,false);
});

test('consent preview accepts read scopes only and separates execution',()=>{
  const preview=buildConsentPreview('kftc-openbanking',['accounts:read','transactions:read','cards:read','payment:write','accounts:read']);
  assert.equal(preview.ok,true);
  assert.deepEqual(preview.scopes,['accounts:read','transactions:read']);
  assert.equal(preview.humanGateRequired,true);
  assert.match(preview.execution,/분리/);
});

test('security event contains metadata only',()=>{
  const event=securityEvent('connection-begin-requested',{providerId:'kftc-openbanking',scopes:['accounts:read'],accountNumber:'123'});
  assert.equal(event.providerId,'kftc-openbanking');
  assert.equal(event.scopeCount,1);
  assert.equal('accountNumber' in event,false);
});


test('Money production contract is apex-only and Finance bridge is read-only',async()=>{
  const files=await Promise.all(['wrangler.money.toml','deploy/manifests/money.worker.json','.github/workflows/deploy-money.yml','config/ecosystem-services.json','auth-site/client-auth.js','ekodi-service-manifest.js','platform-boundaries.json','governance/constitution/constitution.json','platform-route-registry.js'].map(async path=>[path,await readFile(new URL('../'+path,import.meta.url),'utf8')]));
  const retired=['money','ekodi','kr'].join('.');
  for(const [path,source] of files)assert.equal(source.includes(retired),false,`${path} must not retain the retired Money public host`);
  const prod=files.find(([path])=>path==='wrangler.money.toml')[1];
  assert.match(prod,/workers_dev = true/);assert.doesNotMatch(prod,/\[\[routes\]\]/);assert.match(prod,/binding = "FINANCE"[\s\S]*service = "ekodi-finance-api"/);
  const manifest=JSON.parse(files.find(([path])=>path==='deploy/manifests/money.worker.json')[1]);
  assert.ok(manifest.worker.requests.some(item=>item.url==='https://ekodi.kr/money/'));assert.ok(manifest.worker.requests.some(item=>item.url==='https://ekodi.kr/money/api/finance-bridge'));
  const worker=await readFile(new URL('../money-worker.js',import.meta.url),'utf8');
  assert.match(worker,/finance\.internal\/api\/finance\/banking\/health/);assert.doesNotMatch(worker,/finance\.internal\/api\/finance\/banking\/(?:accounts|transactions|transfers)/);assert.match(worker,/financialExecution:false/);
});
