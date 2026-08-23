import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_STAGES, nextStage, analyzeGuidanceChange, scoreOpportunity, fillOfficialForm, buildNextActions, requiresHumanGate } from '../support/core.js';

test('support lifecycle covers application through settlement',()=>{assert.equal(SUPPORT_STAGES[0],'discovery');assert.ok(SUPPORT_STAGES.includes('application-prep'));assert.ok(SUPPORT_STAGES.includes('settlement'));assert.equal(nextStage('selected'),'agreement')});

test('guidance analysis detects new deadline and document',()=>{const result=analyzeGuidanceChange('기존 지침','수정 지침: 결과보고서 제출기한 2026-08-28');assert.equal(result.kind,'CHANGED');assert.equal(result.deadline,'2026-08-28');assert.equal(result.document,'결과보고서')});

test('official form fill never invents missing values',()=>{const fields=fillOfficialForm([{key:'businessName',label:'기업명'},{key:'budget',label:'사업비',highImpact:true}],{businessName:'EKODI'},{});assert.equal(fields[0].value,'EKODI');assert.equal(fields[0].source,'profile');assert.equal(fields[1].value,'');assert.equal(fields[1].source,'missing');assert.equal(fields[1].needsHumanReview,true)});

test('high impact actions require human gate',()=>{for(const action of ['submit','sign','agreement','payment','budget-change','settlement','withdraw'])assert.equal(requiresHumanGate(action),true);assert.equal(requiresHumanGate('analyze'),false)});

test('fit score and next action are deterministic',()=>{const score=scoreOpportunity({region:'전남',businessType:'소상공인',businessName:'A',registrationNumber:'1',summary:'x',recentRevenue:'y'},{region:'전남',businessType:'소상공인'});assert.equal(score,100);assert.deepEqual(buildNextActions({stage:'presentation'}),['발표자료 준비','예상질문 점검'])});
