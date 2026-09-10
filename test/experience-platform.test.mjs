import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../experience-worker.js';
import { getExperienceCatalog } from '../experience-catalog.js';
import { projectValue } from '../secure-projection.js';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/^\uFEFF/,'');

test('experience is a registered common-service boundary at exp.ekodi.kr',()=>{
  const boundary=JSON.parse(read('platform-boundaries.json')).platforms.experience;
  assert.equal(boundary.kind,'common-service-platform');
  assert.ok(boundary.domains.includes('exp.ekodi.kr'));
  assert.equal(boundary.deployWorkflow,'.github/workflows/deploy-experience.yml');
  assert.match(boundary.database,/none/i);
});

test('public catalog is synthetic, read-only and contains no internal architecture fields',()=>{
  const catalog=getExperienceCatalog();
  assert.equal(catalog.meta.dataPolicy,'synthetic-only');
  assert.equal(catalog.meta.sideEffects,'none');
  assert.equal(catalog.safety.productionWrites,false);
  assert.equal(catalog.safety.sourceCodeVisible,false);
  assert.equal(catalog.safety.internalTopologyVisible,false);
  assert.ok(catalog.personas.length>=6);
  assert.ok(catalog.services.length>=8);
  const projected=projectValue(catalog,{profile:'experience_public',purpose:'test'});
  const text=JSON.stringify(projected);
  for(const forbidden of ['repository','branch','databaseUrl','sourcePath','workerName','apiKey','accessToken']) assert.doesNotMatch(text,new RegExp(`"${forbidden}"`,'i'));
});

test('experience exposes user and developer modes from the same safe catalog',()=>{
  const catalog=getExperienceCatalog();
  assert.deepEqual(catalog.modes.map(mode=>mode.id),['user','developer']);
  for(const service of catalog.services){
    assert.ok(Array.isArray(service.flow));
    assert.ok(service.flow.length>=3);
    assert.ok(['live','beta','preparing','planned'].includes(service.status));
    assert.ok(['simulation','preview','real-link'].includes(service.experience));
  }
});

test('experience worker health and catalog are public GET-only contracts',async()=>{
  const env={};
  const health=await worker.fetch(new Request('https://exp.ekodi.kr/health'),env);
  assert.equal(health.status,200);
  const healthJson=await health.json();
  assert.equal(healthJson.service,'ekodi-experience');
  assert.equal(healthJson.dataPolicy,'synthetic-only');
  assert.equal(healthJson.projection,'experience_public');
  const catalogResponse=await worker.fetch(new Request('https://exp.ekodi.kr/api/catalog'),env);
  assert.equal(catalogResponse.status,200);
  const catalog=await catalogResponse.json();
  assert.equal(catalog.safety.productionWrites,false);
  const post=await worker.fetch(new Request('https://exp.ekodi.kr/api/catalog',{method:'POST'}),env);
  assert.equal(post.status,405);
});

test('experience UI clearly labels modes, synthetic boundary and simulation',()=>{
  const html=read('experience/index.html');
  const app=read('experience/app.js');
  for(const marker of ['사용자모드','개발자모드','가상 데이터','SYNTHETIC WORKSPACE','PUBLIC STATUS']) assert.match(html,new RegExp(marker));
  assert.match(app,/실제 저장·결제·게시·메시지는 발생하지 않았습니다/);
  assert.match(app,/소스코드 · 저장소 · 내부 API · DB · Worker/);
});

test('experience deploy files use isolated staging and guarded production release',()=>{
  const prod=read('wrangler.experience.toml');
  const staging=read('wrangler.experience.staging.toml');
  const workflow=read('.github/workflows/deploy-experience.yml');
  assert.match(prod,/try\.ekodi\.kr/);
  assert.match(prod,/custom_domain = true/);
  assert.match(staging,/ekodi-experience-staging/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/experience\.worker\.json/);
  assert.match(workflow,/wrangler@\$\{WRANGLER_VERSION\} triggers deploy --config wrangler\.experience\.toml/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/experience\.worker\.json --wrangler-version \$\{WRANGLER_VERSION\}/);
  assert.ok(workflow.indexOf('Synchronize Experience production routes') < workflow.indexOf('Guarded Experience production release'));
  assert.match(workflow,/ekodi-experience-staging\.ekodi-development\.workers\.dev/);
});
