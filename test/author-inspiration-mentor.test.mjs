import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENTOR_FIELDS, MENTOR_STAGES, resolveMentorField, writingMentorStep, privateMentorNotebook } from '../author/writing-mentor.js';

test('all editorial disciplines and eight inspiration stages are offered without membership or paid APIs',()=>{
  assert.ok(MENTOR_FIELDS.length>=15);
  assert.equal(MENTOR_STAGES.length,8);
  for(const [id] of MENTOR_FIELDS){
    const view=writingMentorStep({field:id,stage:'inspiration'});
    assert.equal(view.requiresPaidPlan,false);
    assert.equal(view.providerInvocation,false);
    assert.ok(view.question.length>20);
    assert.ok(view.expertLens.length>8);
  }
  assert.equal(resolveMentorField('신학'),'theology');
  assert.equal(resolveMentorField('business'),'business');
  assert.equal(resolveMentorField('unrecognized'),'other');
  assert.equal(writingMentorStep({field:'theology',stage:'critique'}).stage,'critique');
});

test('private notebook retains actual author responses and never exposes sale entitlement or tokens',()=>{
  const notes=privateMentorNotebook({title:'나의 이야기',field:'theology',answers:{
    inspiration:'이곳의 삶에서 시작합니다.',
    critique:'근거 없는 단정을 줄이고 반론을 담습니다.'
  }});
  assert.equal(notes.answered,2);
  assert.equal(notes.total,8);
  assert.equal(notes.privateOnly,true);
  assert.equal(notes.saleRegistrationAllowed,false);
  assert.equal(notes.automaticProviderCostKrw,0);
  assert.match(notes.markdown,/이곳의 삶에서 시작합니다/);
  assert.match(notes.markdown,/저작권은 저자의 창작 기여/);
  assert.doesNotMatch(notes.markdown,/undefined|Bearer |service_role/);
  const other=privateMentorNotebook({title:'',answers:{anything:'ignore'}});
  assert.equal(other.answered,0);
  assert.doesNotMatch(other.markdown,/ignore/);
});

test('unknown field and stage use safe grounded default, not a fake credential',()=>{
  const view=writingMentorStep({field:'unknown',stage:'not-a-real-stage'});
  assert.equal(view.field,'other');
  assert.equal(view.stage,'inspiration');
  assert.match(view.guidance,/전문가 감수나 출판 승인을 대체하지 않습니다/);
});

test('Creator writer modal exposes free mentorship to all writer tiers without sale registration or provider calls',()=>{
  const app=readFileSync(new URL('../author/app.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../author/writing-mentor-ui.js',import.meta.url),'utf8');
  assert.match(app,/data-mentor>무료 분야별 집필 멘토/);
  assert.match(app,/openWritingMentor\(\{ session, project:/);
  assert.match(app,/data-books>에코디서점 둘러보기/);
  assert.doesNotMatch(app,/books\.handoff\.requested/);
  assert.match(ui,/owner_user_id!==session\.user\.id/);
  assert.match(ui,/URL\.createObjectURL/);
  assert.match(ui,/비공개|임시 메모/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|fetch\(|\.from\(|\/api\/|payments|OPENAI_API_KEY/);
});

test('this phase does not mutate production membership, contracts, or payment configuration',()=>{
  const guide=readFileSync(new URL('../author/writing-mentor-ui.js',import.meta.url),'utf8');
  assert.doesNotMatch(guide,/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
