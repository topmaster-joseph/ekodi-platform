import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildInvestLens } from '../invest-personalization-runtime.js';
import { officialDataConnections, createOfficialProfileDataBinding } from '../profile-official-data-adapter.js';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('person, business, organization and project receive materially different review lenses',()=>{
  const person=buildInvestLens('person','person',[]);
  const business=buildInvestLens('business','tenant',[]);
  const organization=buildInvestLens('organization','tenant',[]);
  const project=buildInvestLens('project','tenant',[]);
  assert.equal(person.key,'person');
  assert.equal(business.key,'business');
  assert.equal(organization.key,'organization');
  assert.equal(project.key,'project');
  assert.match(person.summary,/개인의 목적/);
  assert.match(business.summary,/현금흐름|운전자금/);
  assert.match(organization.summary,/투자정책|승인구조/);
  assert.match(project.summary,/마일스톤|실행위험/);
  assert.notDeepEqual(person.questions.map(q=>q.fieldPath),organization.questions.map(q=>q.fieldPath));
});

test('confirmed evidence reduces user questions instead of asking for the same data again',()=>{
  const lens=buildInvestLens('organization','tenant',[{fieldPath:'governance.investmentPolicy',value:'보수적 운용',sourceClass:'user',humanConfirmed:true}]);
  const policy=lens.questions.find(item=>item.fieldPath==='governance.investmentPolicy');
  assert.equal(policy.status,'confirmed');
  assert.equal(policy.value,'보수적 운용');
});

test('official connection status is explicit and never exposes secret values',()=>{
  const connections=officialDataConnections({OPENDART_API_KEY:'secret-value'});
  const dart=connections.find(item=>item.id==='opendart');
  assert.equal(dart.status,'ready');
  assert.equal(JSON.stringify(connections).includes('secret-value'),false);
  assert.equal(connections.find(item=>item.id==='krx').status,'license_and_key_required');
  assert.equal(connections.find(item=>item.id==='financial_mydata').status,'licensed_partner_required');
});

test('embedded official provider refuses personal discovery and keeps financial data behind consent and licensed partner',async()=>{
  const binding=createOfficialProfileDataBinding({});
  const response=await binding.fetch('https://ekodi.internal/profile/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({entityType:'person',displayName:'사용자',publicIdentifier:''})});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.evidence,[]);
  assert.equal(data.policy.personalExternalDiscovery,false);
  assert.equal(data.policy.financialDataRequiresConsentAndLicensedPartner,true);
});

test('Invest runtime is information-and-analysis only and exposes authorized subject switching',async()=>{
  const runtime=await read('invest-personalization-runtime.js');
  for(const route of ['/v1/invest/context','/v1/invest/data-connections','/v1/invest/subjects'])assert.ok(runtime.includes(route));
  assert.match(runtime,/investmentAdvice:false/);
  assert.match(runtime,/buySellInstruction:false/);
  assert.match(runtime,/portfolioAllocation:false/);
  assert.match(runtime,/transactionExecution:false/);
  assert.match(runtime,/custody:false/);
  assert.match(runtime,/guaranteedReturn:false/);
  assert.match(runtime,/customer_access_grants/);
});

test('Invest page preserves legacy review flow while adding evidence-first personalized UI',async()=>{
  const page=await read('invest-user-page.js');
  assert.match(page,/EVIDENCE FIRST/);
  assert.match(page,/investLensTitle/);
  assert.match(page,/investConnections/);
  assert.match(page,/opportunityList/);
  assert.match(page,/diligenceForm/);
  assert.match(page,/\/app\.js/);
  assert.match(page,/\/invest-ui\.js/);
  assert.match(page,/매수·매도 지시/);
});

test('My EKODI keeps Invest inside progressive discovery and passes only an authorized workspace hint',async()=>{
  const userAi=await read('my/user-ai-ui.js');
  const app=await read('my/app.js');
  const worker=await read('my-worker.js');
  const subject=await read('invest-subject-ui.js');
  const invest=EKODI_SERVICE_MANIFEST.services.find(service=>service.id==='invest');
  assert.equal(invest?.url,'https://invest.ekodi.kr/');
  assert.equal(invest?.sso,true);
  assert.equal(invest?.targetable,true);
  assert.match(userAi,/data-personalization-recommended/);
  assert.doesNotMatch(userAi,/https:\/\/invest\.ekodi\.kr\//,'User AI must not hard-code Invest as a fixed recommendation');
  assert.match(app,/function serviceRoute\(id,url\)/);
  assert.match(app,/TARGETABLE_WORKSPACE_SITES\.has\(id\)/);
  assert.match(app,/searchParams\.set\('workspace',current\.workspace_key\)/);
  assert.doesNotMatch(app,/searchParams\.set\('subject_key'/);
  assert.match(worker,/service\.targetable===true/);
  assert.match(subject,/\/v1\/invest\/subjects/);
  assert.match(subject,/matchesHint/);
  assert.match(subject,/location\.replace/);
});

test('workspace and site entry workers route the new services and health markers',async()=>{
  const workspace=await read('workspace-platform-entry-worker.js');
  const site=await read('platform-router-entry-worker.js');
  assert.match(workspace,/createOfficialProfileDataBinding/);
  assert.match(workspace,/investPersonalization:'v1'/);
  assert.match(workspace,/officialDataProvider:'embedded-v1'/);
  assert.match(site,/investUserPage/);
  assert.match(site,/investSubjectUiScript/);
});
