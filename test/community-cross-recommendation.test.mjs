import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rankPeopleForCircle, bestCircleForPerson } from '../community/recommendation-lens.js';

test('Circle bridge ranks only from already-disclosed person signals',()=>{
  const circle={id:'c1',name:'AI 가게 Lab',tags:['AI','마케팅']};
  const people=[
    {user_id:'a',display_name:'A',score:99,shared_interests:['독서']},
    {user_id:'b',display_name:'B',score:1,shared_interests:['AI'],can_help_me_with:['마케팅']},
  ];
  const ranked=rankPeopleForCircle(people,circle);
  assert.equal(ranked[0].user_id,'b');
  assert.deepEqual(ranked[0].circle_bridge_reasons,['Circle 공통 관심 AI','함께 배울 수 있음 마케팅']);
  assert.equal(ranked[1].circle_bridge_score,0);
});

test('Person bridge chooses a Circle only when public recommendation signals overlap',()=>{
  const person={shared_interests:['AI'],can_help_me_with:['영상편집'],i_can_help_with:['마케팅']};
  const circles=[
    {id:'c1',name:'독서',tags:['독서'],recommendation_score:100},
    {id:'c2',name:'AI 콘텐츠',tags:['AI','영상편집','마케팅'],recommendation_score:1},
  ];
  const selected=bestCircleForPerson(circles,person);
  assert.equal(selected.id,'c2');
  assert.deepEqual(selected.cross_recommendation_reasons,['AI','영상편집','마케팅']);
  assert.equal(bestCircleForPerson(circles,{shared_interests:['기도']}),null);
});
test('Community UI keeps People-Circle bridge local and reversible',async()=>{
  const [app,html]=await Promise.all([
    readFile(new URL('../community/app.js',import.meta.url),'utf8'),
    readFile(new URL('../community/index.html',import.meta.url),'utf8'),
  ]);
  assert.match(app,/rankPeopleForCircle\(state\.people,bridge\)/);
  assert.match(app,/bestCircleForPerson\(state\.circles,p\)/);
  assert.match(app,/전체 추천으로/);
  assert.match(app,/circle-people/);
  assert.match(app,/person-circle-link/);
  assert.match(html,/id="crossRecommendationNotice" hidden/);
});
