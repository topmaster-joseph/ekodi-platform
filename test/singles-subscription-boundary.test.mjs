import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const load=p=>readFile(new URL(p,import.meta.url),'utf8');
const [social,schema,worker,ui]=await Promise.all([
 load('../supabase/functions/singles-api/social.ts'),
 load('../supabase/migrations/20261009121000_singles_social_subscription_skeleton.sql'),
 load('../singles-surface.js'),load('../sites/ekodi-singles/public/app.js')
]);
const env={ASSETS:{fetch:async()=>new Response('asset')}};
const request=(p,method='GET')=>new Request('https://ekodi.kr'+p,{method});
test('guest cannot list events or see profiles; only descriptions are public',async()=>{
 const x=await routeSinglesSurface(request('/singles/api/public'),env);
 assert.equal(x.status,200);const d=await x.json();assert.deepEqual(d.events,[]);
 const landing=await routeSinglesSurface(request('/singles'),env);
 const publicHtml=await landing.text();
 assert.doesNotMatch(publicHtml,/cdn\\.jsdelivr\\.net\/npm\/@supabase/);
 assert.match(publicHtml,/\/singles\/app\.js/);
 for(const p of ['/singles/api/events','/singles/api/discover','/singles/api/subscription','/singles/api/profile']){
  const x=await routeSinglesSurface(request(p),env);
  assert.equal(x.status,503,p);
 }
 assert.match(ui,/if\(!state\.session\)\{showGuest\(\);return\}/);
});
test('server authorizes premium actions only with independent launch gates and trusted central billing',()=>{
 assert.match(worker,/SINGLES_PAID_ACTIONS_ENABLED/);
 assert.match(worker,/paid_actions_not_launched/);
 assert.match(social,/SINGLES_PAYMENTS_ENABLED/);
 assert.match(social,/source==='verified_central_billing'/);
 assert.match(social,/Date\.parse\(record\.expires_at\)>Date\.now\(\)/);
 assert.match(social,/if\(!await subscribed\(admin,userId\)\)/);
 assert.match(social,/subscription_required/);
 assert.doesNotMatch(social.replace(/\/\/[^\n]*/g,''),/user_metadata|raw_user_meta_data/);
});
test('interests, mutual acceptance and refusal remain separate from payment',()=>{
 assert.match(social,/if\(p==='\/requests'/);
 assert.match(social,/if\(!\['accepted','declined'\]\.includes\(decision\)\)/);
 assert.match(social,/interest\.status!=='accepted'/);
 assert.match(social,/mutual_consent_required/);
 assert.match(social,/async function blocked\(/);
 assert.match(social,/reportTarget&&method==='POST'/);
});
test('DEV schema is default-private and includes no client-accessible entitlements',()=>{
 for(const n of ['singles_profiles','singles_events','singles_event_rsvps','singles_entitlements','singles_interests','singles_messages','singles_blocks']){
  assert.match(schema,new RegExp('create table if not exists public\\.'+n));
  assert.match(schema,new RegExp('alter table public\\.'+n+' enable row level security'));
 }
 assert.match(schema,/revoke all on table[\s\S]*from public,anon,authenticated/);
 assert.match(schema,/check\(source='verified_central_billing'\)/);
 assert.match(schema,/adult_verified_at is not null/);
 assert.doesNotMatch(schema,/grant .* to authenticated/i);
});
test('UI has named subscriber gates for events, first messages, replies',()=>{
 assert.match(ui,/paywall\(card,'행사 참가 신청'\)/);
 assert.match(ui,/paywall\(card,'메시지 발송'\)/);
 assert.match(ui,/호감 수락/);
 assert.match(ui,/정중히 거절/);
 assert.match(ui,/로그인 후 무료로 볼 수 있습니다/);
});
