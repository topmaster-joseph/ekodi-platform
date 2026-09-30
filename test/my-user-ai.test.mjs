import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserSuggestions, EKODI_USER_AI } from '../my/user-ai.js';


test('EKODI User AI preserves suggest-and-handoff boundary',()=>{
  assert.equal(EKODI_USER_AI.name,'EKODI User AI');
  assert.equal(EKODI_USER_AI.role,'개인 AI 비서');
  assert.equal(EKODI_USER_AI.boundary,'suggest-and-handoff');
  assert.equal(EKODI_USER_AI.dependsOnExternalAI,false);
  assert.equal(EKODI_USER_AI.specialistDirectControl,false);
});


test('User AI works without an external AI provider',()=>{
  const suggestions=buildUserSuggestions({
    workspaces:[{name:'개인'},{name:'사업장'}],
    recentItems:[{title:'최근 문서'}],
    notifications:[],
    services:[{name:'EKODI Biz'}]
  });
  assert.ok(suggestions.length>=1);
  assert.ok(suggestions.length<=3);
  assert.ok(suggestions.some(item=>item.type==='continue'));
  assert.ok(suggestions.some(item=>item.type==='workspace'));
});


test('User AI stays calm when no action is required',()=>{
  const suggestions=buildUserSuggestions({
    workspaces:[{name:'개인'}],
    recentItems:[],
    notifications:[],
    services:[{name:'My EKODI'}]
  });
  assert.deepEqual(suggestions.map(item=>item.type),['calm']);
});
