import test from 'node:test';
import assert from 'node:assert/strict';
import {assessNeedState,NEED_SIGNAL_SOURCES,opportunityNeedAlignment} from '../support/need-sensing.js';

test('explicit user need can become proactive only with explicit proactive consent',()=>{
  const profile={profileType:'사업자',region:'전남 무안군',need:'AI 마케팅과 냉난방 설비 교체 지원이 필요해요',interests:['소상공인']};
  const withoutConsent=assessNeedState(profile,{});
  assert.equal(withoutConsent.proactiveEligible,false);
  assert.ok(withoutConsent.needScore>=50);

  const withConsent=assessNeedState(profile,{consent:{proactiveBenefits:true}});
  assert.equal(withConsent.proactiveEligible,true);
  assert.ok(withConsent.categories.some(category=>category.id==='grant'));
  assert.ok(withConsent.categories.some(category=>category.id==='subsidy'));
  assert.ok(opportunityNeedAlignment(withConsent,'grant')>30);
});

test('activity context is ignored unless separately enabled',()=>{
  const assessment=assessNeedState({profileType:'개인',region:'서울'}, {
    consent:{proactiveBenefits:true},
    signals:[{source:NEED_SIGNAL_SOURCES.ACTIVITY_CONTEXT,key:'page-interest',value:'주거 지원 페이지 반복 방문'}]
  });
  assert.equal(assessment.acceptedSignalCount,0);
  assert.equal(assessment.ignoredSignals[0].reason,'activity_context_not_enabled');
  assert.equal(assessment.proactiveEligible,false);
});

test('sensitive signals never enter inference without explicit sensitive-benefit consent',()=>{
  const assessment=assessNeedState({profileType:'개인',region:'전남'}, {
    consent:{proactiveBenefits:true},
    signals:[{source:NEED_SIGNAL_SOURCES.LIFE_EVENT,key:'health',value:'의료비 지원 필요',sensitive:true}]
  });
  assert.equal(assessment.acceptedSignalCount,0);
  assert.equal(assessment.ignoredSignals[0].reason,'sensitive_signal_requires_explicit_consent');
  assert.equal(assessment.proactiveEligible,false);
});

test('verified external signals require separate external-data consent',()=>{
  const signal={source:NEED_SIGNAL_SOURCES.EXTERNAL_VERIFIED,key:'business-event',value:'사업 개업',category:'사업자'};
  const blocked=assessNeedState({profileType:'사업자',region:'전남'},{consent:{proactiveBenefits:true},signals:[signal]});
  assert.equal(blocked.acceptedSignalCount,0);
  assert.equal(blocked.ignoredSignals[0].reason,'external_data_not_enabled');

  const allowed=assessNeedState({profileType:'사업자',region:'전남'},{consent:{proactiveBenefits:true,externalData:true},signals:[signal]});
  assert.equal(allowed.acceptedSignalCount,1);
  assert.equal(allowed.proactiveEligible,true);
});

test('low-confidence profiles ask only the minimum follow-up questions',()=>{
  const assessment=assessNeedState({},{});
  assert.ok(assessment.questions.length>0);
  assert.ok(assessment.questions.length<=2);
  assert.equal(assessment.confidenceLabel,'추가 확인 필요');
});
