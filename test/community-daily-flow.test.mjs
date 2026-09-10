import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dailyRecommendationFlow, rankChannels } from '../community/recommendation-lens.js';

const profile={interests:['AI','지역활동'],region:'목포',languages:['한국어'],wants_to_learn:['영상편집'],skills_offered:['마케팅']};
const context={role:'owner'};

test('daily flow returns two Circles, three People and one Channel from existing candidates',()=>{
  const circles=[
    {id:'faith',tags:['기도'],match_score:1},{id:'ai',tags:['AI','영상편집'],match_score:0},{id:'local',tags:['지역활동','마케팅'],match_score:0}
  ];
  const people=[
    {user_id:'p1',shared_interests:['기도'],score:1},{user_id:'p2',shared_interests:['AI'],can_help_me_with:['영상편집']},{user_id:'p3',shared_interests:['지역활동'],i_can_help_with:['마케팅']},{user_id:'p4',shared_interests:['독서']}
  ];
  const channels=[
    {id:'youtube',name:'YouTube',tags:['영상']},{id:'lab',name:'EKODI Lab',tags:['AI','영상편집']},{id:'biz',name:'EKODI Biz',tags:['소상공인','마케팅']}
  ];
  const flow=dailyRecommendationFlow(circles,people,channels,profile,context);
  assert.deepEqual(flow.circles.map(x=>x.id),['ai','local']);
  assert.deepEqual(flow.people.map(x=>x.user_id),['p2','p3','p1']);
  assert.equal(flow.channels.length,1);
  assert.equal(flow.channels[0].id,'lab');
  assert.match(flow.channels[0].recommendation_reasons.join(' '),/AI|영상편집/);
});test('daily flow UI stays deterministic, local and synchronized with live social cards',()=>{
  const page=fs.readFileSync(new URL('../community/index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../community/app.js',import.meta.url),'utf8');
  const social=fs.readFileSync(new URL('../community/social-links.js',import.meta.url),'utf8');
  const locale=fs.readFileSync(new URL('../community/community-enhancements.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../community/community-discovery.css',import.meta.url),'utf8');
  for(const id of ['dailyFlow','dailyCircleList','dailyPeopleList','dailyChannelList'])assert.match(page,new RegExp(`id="${id}"`));
  assert.ok((page.match(/data-recommend-tags=/g)||[]).length>=8);
  assert.match(app,/dailyRecommendationFlow/);
  assert.match(app,/renderDailyFlow\(\)/);
  assert.match(app,/ekodi:social-ready/);
  assert.match(app,/channelCandidates\(\)/);
  assert.match(app,/function setSignedIn\(on\)\{\$\$\('\.signed-in-only'\)/);
  assert.match(page,/id="dailyFlow" data-defer-signed-in hidden/);
  assert.match(social,/recommendationTags/);
  assert.match(social,/ekodi:social-ready/);
  assert.equal((locale.match(/'today\.title'/g)||[]).length,4);
  assert.match(css,/\.daily-flow-grid/);
  assert.match(css,/@media\(max-width:620px\).*\.daily-flow-grid/s);
});

test('channel ranking is profile-driven and requires no model or network call',()=>{
  const ranked=rankChannels([{id:'church',tags:['기도']},{id:'biz',tags:['AI','마케팅']}],profile,context);
  assert.equal(ranked[0].id,'biz');
  const lens=fs.readFileSync(new URL('../community/recommendation-lens.js',import.meta.url),'utf8');
  assert.doesNotMatch(lens,/fetch\(|openai|anthropic|gemini/i);
});