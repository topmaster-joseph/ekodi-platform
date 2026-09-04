import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyPreferenceAction,
  buildPersonalizedServiceView,
  PERSONALIZATION_STATES,
} from '../my/progressive-personalization.js';

const SERVICES=[
  {id:'support',name:'Support',url:'https://support.ekodi.kr/',order:1},
  {id:'work',name:'Work',url:'https://work.ekodi.kr/',order:2},
  {id:'marketing',name:'Marketing',url:'https://marketing.ekodi.kr/',order:3},
];
const NOW=new Date('2026-09-04T17:10:00+09:00');
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('available services stay quiet until interest or context crosses the recommendation threshold',()=>{
  const quiet=buildPersonalizedServiceView({services:SERVICES,now:NOW});
  assert.deepEqual(quiet.recommended,[]);
  assert.equal(quiet.available.length,3);
  const interest=applyPreferenceAction({service_id:'support'},'interest',NOW);
  const view=buildPersonalizedServiceView({services:SERVICES,preferences:[interest],now:NOW});
  assert.deepEqual(view.recommended.map(item=>item.id),['support']);
  assert.equal(view.active.length,0);
});
test('system, admin and AI signals may recommend but never activate or pin a service',()=>{
  const signals=[
    {service_id:'work',source:'system',signal_type:'recent-context',weight:3,created_at:NOW.toISOString()},
    {service_id:'marketing',source:'ai',signal_type:'conversation',weight:3,created_at:NOW.toISOString()},
  ];
  const view=buildPersonalizedServiceView({services:SERVICES,signals,now:NOW});
  assert.ok(view.recommended.some(item=>item.id==='work'));
  assert.ok(view.recommended.some(item=>item.id==='marketing'));
  assert.equal(view.active.length,0);
  assert.equal(view.pinned.length,0);
});

test('only the user preference action promotes a recommendation to active or pinned',()=>{
  const interested=applyPreferenceAction({service_id:'support'},'interest',NOW);
  const active=applyPreferenceAction(interested,'activate',NOW);
  const pinned=applyPreferenceAction(active,'pin',NOW);
  assert.equal(active.state,PERSONALIZATION_STATES.ACTIVE);
  assert.equal(pinned.state,PERSONALIZATION_STATES.PINNED);
  const view=buildPersonalizedServiceView({services:SERVICES,preferences:[pinned],now:NOW});
  assert.deepEqual(view.pinned.map(item=>item.id),['support']);
});

test('dismiss hides a suggestion for 30 days and restore makes it eligible again',()=>{
  const interested=applyPreferenceAction({service_id:'support'},'interest',NOW);
  const dismissed=applyPreferenceAction(interested,'dismiss',NOW);
  const hidden=buildPersonalizedServiceView({services:SERVICES,preferences:[dismissed],now:NOW});
  assert.equal(hidden.recommended.length,0);
  const restored=applyPreferenceAction(dismissed,'restore',NOW);
  const again=applyPreferenceAction(restored,'interest',NOW);
  const visible=buildPersonalizedServiceView({services:SERVICES,preferences:[again],now:NOW});
  assert.deepEqual(visible.recommended.map(item=>item.id),['support']);
});

test('unpinned active services fade after prolonged inactivity while pinned services stay visible',()=>{
  const old='2026-07-01T00:00:00.000Z';
  const active={service_id:'work',state:'active',interest_score:5,last_engaged_at:old,activated_at:old,updated_at:old};
  const pinned={...active,service_id:'marketing',state:'pinned'};
  const view=buildPersonalizedServiceView({services:SERVICES,preferences:[active,pinned],now:NOW});
  assert.ok(!view.active.some(item=>item.id==='work'));
  assert.ok(view.available.some(item=>item.id==='work'&&item.faded));
  assert.deepEqual(view.pinned.map(item=>item.id),['marketing']);
});

test('connected entitlement can surface a service but user dismissal only changes presentation',()=>{
  const dismissed=applyPreferenceAction({service_id:'work',state:'active',interest_score:5},'dismiss',NOW);
  const view=buildPersonalizedServiceView({services:SERVICES,connectedIds:['work'],preferences:[dismissed],now:NOW});
  assert.ok(!view.active.some(item=>item.id==='work'));
  const work=view.available.find(item=>item.id==='work');
  assert.equal(work?.connected,true);
  assert.equal(work?.dismissed,true);
});

test('recommendations are deliberately bounded instead of turning My EKODI into a catalog',()=>{
  const signals=SERVICES.map(service=>({service_id:service.id,source:'admin',signal_type:'context',weight:5,created_at:NOW.toISOString()}));
  const view=buildPersonalizedServiceView({services:SERVICES,signals,now:NOW});
  assert.equal(view.recommended.length,2);
});
test('My EKODI UI exposes progressive discovery while keeping optional surfaces collapsed by default',async()=>{
  const [html,app,userAi]=await Promise.all([read('my/index.html'),read('my/app.js'),read('my/user-ai-ui.js')]);
  assert.match(html,/id="discoverServicesButton"/);
  assert.match(html,/id="serviceDiscoveryList"/);
  assert.match(html,/data-intent-service="support"/);
  assert.match(html,/data-progressive-services="marketing" hidden/);
  assert.match(html,/data-progressive-services="author,publishing,books" hidden/);
  assert.match(app,/buildPersonalizedServiceView/);
  assert.match(app,/set_my_personalization_preference/);
  assert.match(app,/ekodi:personalization-signal/);
  assert.match(userAi,/personalizationSuggestion/);
  assert.doesNotMatch(userAi,/investSuggestion/);
});

test('personalization storage is person scoped and cannot grant EKODI authorization',async()=>{
  const migration=await read('supabase/migrations/20260904171000_my_progressive_personalization.sql');
  assert.match(migration,/person_id uuid not null references public\.people\(id\)/);
  assert.match(migration,/source in \('system','admin','ai'\)/);
  assert.match(migration,/private\.current_person_id\(\)/);
  assert.match(migration,/grant select on table public\.my_personalization_signals to authenticated/);
  assert.doesNotMatch(migration,/grant insert on table public\.my_personalization_signals to authenticated/);
  assert.match(migration,/Never grants service authorization/);
  assert.match(migration,/service access remains governed by canonical membership\/RBAC/);
});
