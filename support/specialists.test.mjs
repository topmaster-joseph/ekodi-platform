import test from 'node:test';
import assert from 'node:assert/strict';
import {OPPORTUNITY_SERVICES,resolveOpportunityService} from './core.js';
import {SPECIALIST_WORKSPACES,getSpecialistWorkspace,validateSpecialistWorkspace,buildSpecialistProfile,profileCompleteness,explainOpportunity} from './specialists.js';

test('every opportunity service has one valid specialist workspace',()=>{
  assert.equal(Object.keys(SPECIALIST_WORKSPACES).length,OPPORTUNITY_SERVICES.length);
  for(const service of OPPORTUNITY_SERVICES){
    const workspace=getSpecialistWorkspace(service.id);
    assert.equal(workspace.id,service.id);
    assert.equal(validateSpecialistWorkspace(workspace),true);
    assert.ok(workspace.fields.length>=3);
    assert.ok(workspace.examples.length>=2);
  }
});

test('specialist routes resolve to independent workspace contracts',()=>{
  const routes={
    '/grants':'grant','/subsidies':'subsidy','/scholarships':'scholarship','/contests':'contest','/welfare':'welfare','/private-support':'private','/sponsorship':'sponsorship'
  };
  for(const [path,id] of Object.entries(routes))assert.equal(resolveOpportunityService(path),id);
});

test('specialist profile keeps common data and only declared non-sensitive fields',()=>{
  const profile=buildSpecialistProfile(
    {profileType:'학생',region:'전남',need:'대학원 장학금',interests:['경영학']},
    {studyLevel:'대학원 박사',majorArea:'경영학',scholarshipPurpose:'연구·논문',undeclaredSecret:'do-not-copy'},
    'scholarship'
  );
  assert.equal(profile.serviceId,'scholarship');
  assert.equal(profile.attributes.studyLevel,'대학원 박사');
  assert.equal(profile.attributes.undeclaredSecret,undefined);
  assert.ok(profile.keywords.includes('대학원 장학금'));
  assert.ok(profile.keywords.includes('연구·논문'));
});

test('profile completeness is deterministic without forcing every field',()=>{
  const empty=profileCompleteness({}, {}, 'welfare');
  const partial=profileCompleteness({profileType:'개인',region:'목포',need:'주거'}, {lifeStage:'청년'}, 'welfare');
  assert.equal(empty,0);
  assert.ok(partial>empty&&partial<100);
});

test('match explanation is transparent and never claims selection probability',()=>{
  const reasons=explainOpportunity(
    {region:'전남',keywords:['AI','소상공인']},
    {official:true,title:'전남 소상공인 AI 지원사업',region:'전남',tags:['AI'],urgency:{daysLeft:4}}
  );
  assert.ok(reasons.includes('공식 출처'));
  assert.ok(reasons.some(reason=>reason.includes('지역 전남')));
  assert.ok(reasons.some(reason=>reason.includes('마감 7일 이내')));
  assert.equal(reasons.some(reason=>reason.includes('선정확률')),false);
});
