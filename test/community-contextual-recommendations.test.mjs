import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rankCircles, rankPeople, recommendationBasis } from '../community/recommendation-lens.js';

const profile={
  interests:['AI','소상공인'],
  region:'목포',
  languages:['한국어'],
  wants_to_learn:['영상편집'],
  skills_offered:['마케팅'],
};

test('Community ranks circles from signed-in profile and Shell role without AI',()=>{
  const source=[
    {id:'far',name:'기도 모임',tags:['기도'],location_text:'서울',match_score:9},
    {id:'near',name:'AI 가게 연구회',tags:['AI','마케팅','영상편집'],location_text:'목포 원도심',match_score:1},
  ];
  const ranked=rankCircles(source,profile,{role:'owner'});
  assert.equal(ranked[0].id,'near');
  assert.ok(ranked[0].recommendation_reasons.some(reason=>reason.includes('관심 AI')));
  assert.ok(ranked[0].recommendation_reasons.includes('가까운 지역'));
  assert.deepEqual(source.map(item=>item.id),['far','near']);
});
test('Community ranks people with transparent reasons and preserves server ordering as a signal',()=>{
  const people=[
    {user_id:'a',display_name:'A',score:12,shared_interests:[],region:'서울'},
    {user_id:'b',display_name:'B',score:1,shared_interests:['AI'],region:'목포',can_help_me_with:['영상편집']},
  ];
  const ranked=rankPeople(people,profile,{role:'owner'});
  assert.equal(ranked[0].user_id,'b');
  assert.ok(ranked[0].recommendation_reasons.some(reason=>reason.includes('공통 관심')));
  assert.ok(ranked[0].recommendation_reasons.includes('가까운 지역'));
});

test('Recommendation basis exposes only the factors actually available',()=>{
  assert.deepEqual(recommendationBasis(profile,{role:'owner'}),['관심사','지역','언어','배움·나눔','현재 역할']);
  assert.deepEqual(recommendationBasis({},{}),[]);
});

test('Community app reacts to person-space-role context and shows deterministic reasons',async()=>{
  const app=await readFile(new URL('../community/app.js',import.meta.url),'utf8');
  assert.match(app,/rankCircles\(list,state\.profile,recommendationContext\(\)\)/);
  assert.match(app,/rankPeople\(state\.people,state\.profile,recommendationContext\(\)\)/);
  assert.match(app,/ekodi:shell-context/);
  assert.match(app,/recommendation_reasons/);
  assert.doesNotMatch(app,/recommendation_score[^\n]*%/);
});
