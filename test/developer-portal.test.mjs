import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../experience-worker.js';
import { DEVELOPER_PORTAL_META, PUBLIC_CONFORMANCE_CONTRACT } from '../developer-public-contract.js';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/^\uFEFF/,'');

test('developer portal projects the enforced service contract without exposing internals',()=>{
  const internal=JSON.parse(read('governance/architecture/responsible-independent-service-contract.v1.json'));
  for(const key of internal.required)assert.ok(PUBLIC_CONFORMANCE_CONTRACT.required.includes(key),`public contract missing ${key}`);
  assert.equal(PUBLIC_CONFORMANCE_CONTRACT.status,internal.status);
  assert.equal(PUBLIC_CONFORMANCE_CONTRACT.invariants.responsibilityClass,internal.invariants.responsibilityClass);
  assert.equal(PUBLIC_CONFORMANCE_CONTRACT.invariants['actionPolicy.defaultMaximum'],'L2');
  assert.equal(PUBLIC_CONFORMANCE_CONTRACT.invariants['dataBoundary.crossServicePrivateDatabaseAccess'],false);
  const serialized=JSON.stringify(PUBLIC_CONFORMANCE_CONTRACT);
  for(const forbidden of ['databaseName','databaseBinding','workerName','repository','secret','accessToken','apiKey'])assert.doesNotMatch(serialized,new RegExp(`"${forbidden}"`,'i'));
});

test('public conformance rules stay aligned with the machine validator',()=>{
  const validator=read('scripts/validate-responsible-independent-services.mjs');
  const rules={
    'serviceBoundary.failureIsolation':'failure isolation must be declared',
    'serviceBoundary.extractable':'extraction readiness must be declared',
    'identity.serviceDoesNotOwnCanonicalIdentity':'service must not own canonical identity',
    'identity.workspaceIdNeverDerivedFromUrl':'workspace identity must not derive from URL',
    'dataBoundary.crossServicePrivateDatabaseAccess':'cross-service private DB access must be false',
    'lifecycle.providerReplacementSupported':'provider replacement path must exist',
    'providerStrategy.externalProviderPrivateDbAccess':'external providers may not access private service DB',
    'evidencePolicy.insightRequiresEvidence':'AI advice must be evidence-linked'
  };
  for(const [path,message] of Object.entries(rules)){
    assert.ok(Object.hasOwn(PUBLIC_CONFORMANCE_CONTRACT.invariants,path),`missing public invariant ${path}`);
    assert.ok(validator.includes(message),`validator rule drifted: ${path}`);
  }
});
test('developer portal is public, read-only and canonical at dev.ekodi.kr',async()=>{
  assert.equal(DEVELOPER_PORTAL_META.canonicalOrigin,'https://dev.ekodi.kr');
  const health=await worker.fetch(new Request('https://dev.ekodi.kr/health'),{});
  assert.equal(health.status,200);
  const healthJson=await health.json();
  assert.equal(healthJson.service,'ekodi-developer-portal');
  assert.equal(healthJson.dataPolicy,'public-contract-only');
  const contract=await worker.fetch(new Request('https://dev.ekodi.kr/api/contract'),{});
  assert.equal(contract.status,200);
  assert.equal((await contract.json()).id,'ekodi.responsible-service.v1');
  const post=await worker.fetch(new Request('https://dev.ekodi.kr/api/contract',{method:'POST'}),{});
  assert.equal(post.status,405);
});

test('developer browser preflight never submits manifest data',()=>{
  const html=read('experience/developer.html');
  const js=read('experience/developer.js');
  assert.match(html,/https:\/\/dev\.ekodi\.kr\//);
  assert.match(html,/https:\/\/exp\.ekodi\.kr\//);
  assert.match(html,/CONFORMANCE PREFLIGHT/);
  assert.match(js,/fetch\('\/api\/contract'/);
  assert.doesNotMatch(js,/method\s*:\s*['"]POST['"]/i);
  assert.doesNotMatch(js,/fetch\(['"]https:\/\//i);
  assert.match(html,/JSON은 서버로 전송하지 않습니다/);
  const workerSource=read('experience-worker.js');
  assert.match(workerSource,/htmlAsset\(env,request,'\/developer','developer'\)/);
  assert.doesNotMatch(workerSource,/htmlAsset\(env,request,'\/developer\.html','developer'\)/);
});

test('legacy try.ekodi.kr permanently redirects to canonical exp.ekodi.kr',async()=>{
  const response=await worker.fetch(new Request('https://try.ekodi.kr/developer?mode=user'),{});
  assert.equal(response.status,308);
  assert.equal(response.headers.get('location'),'https://exp.ekodi.kr/developer?mode=user');
});

test('developer and experience use service-specific EKODI user characters',()=>{
  const character=read('shell/user-character.js');
  const design=read('shell/service-design-inheritance.js');
  const recommendations=read('design-profile-runtime.js');
  const illustration=JSON.parse(read('config/illustration-system.json'));
  const dna=JSON.parse(read('config/user-ui-dna.json'));
  assert.match(character,/developer:\{pose:'guide',prop:'route'/);
  assert.match(character,/experience:\{pose:'welcome',prop:'spark'/);
  assert.match(design,/developer:\{accent:'.+mood:'connection-workbench'/);
  assert.match(design,/experience:\{accent:'.+mood:'guided-portal'/);
  assert.match(recommendations,/developer:\{tone:'calm',character:'guide'/);
  assert.match(recommendations,/experience:\{tone:'night',character:'welcome'/);
  assert.equal(illustration.services.developer.scene,'field-research');
  assert.equal(illustration.services.experience.scene,'personal-journey');
  assert.equal(dna.services.developer.family,'connection-workbench');
  assert.equal(dna.services.experience.family,'guided-portal');
});
