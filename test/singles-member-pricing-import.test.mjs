import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [ui,router,social,bank,migration]=await Promise.all([
 read('../sites/ekodi-singles/public/app.js'),
 read('../singles-surface.js'),
 read('../supabase/functions/singles-api/social.ts'),
 read('../supabase/functions/singles-api/bank-transfer.ts'),
 read('../supabase/migrations/20261011154500_singles_profile_links_pricing_and_event_fees.sql'),
]);
test('anonymous navigation hides member-only profile, messages, discovery and finance links',async()=>{
 const response=await routeSinglesSurface(new Request('https://ekodi.kr/singles/'),{ASSETS:{fetch:async()=>new Response('asset')}});
 const html=await response.text();
 for(const title of ['내 프로필','메시지','동행 찾기','구독·입금']){
  const anchor=html.match(new RegExp('<a[^>]+>'+title+'</a>'))?.[0];
  assert.ok(anchor?.includes('data-member-nav hidden'),title);
 }
 assert.match(ui,/querySelectorAll\('\[data-member-nav\]'\)/);
 assert.match(html,/data-guest-nav>로그인<\/a>/);
 assert.match(html,/data-member-nav hidden>내 프로필<\/a>/);
 assert.match(ui,/querySelectorAll\('\[data-guest-nav\]'\)/);
});
test('vCard import runs in browser and cannot itself publish or verify identity',()=>{
 assert.match(ui,/importFile\.addEventListener\('change'/);
 assert.match(ui,/file\.size>65536/);
 assert.match(ui,/discover\.checked=false/);
 assert.match(ui,/file\.text\(\)/);
 assert.match(ui,/state\.session\?\.user\?\.user_metadata\?\.full_name/);
 assert.match(ui,/정부 공공 마이데이터/);
 assert.doesNotMatch(ui,/adult_verified_at\s*:\s*true/);
});
test('profile share URL requires explicit visibility, verified adult, and https',()=>{
 assert.match(migration,/add column if not exists public_link/);
 assert.match(social,/link\.protocol!=='https:'/);
 assert.match(social,/const allowDiscover=visibilityRequested&&verified\(m\)&&m\.religion_consent===true/);
 assert.match(social,/public_link:profileUrl\|\|null/);
});
test('multi-period price plans require verified bank grants and paid event fee does not silently enroll',()=>{
 assert.match(migration,/community_90/);
 assert.match(migration,/community_365/);
 assert.match(bank,/const codes=planCode==='community'/);
 assert.match(bank,/\.eq\('plan_code',code\)/);
 assert.match(bank,/can_configure/);
 assert.match(social,/event_fee_verification_not_configured/);
 assert.match(social,/event_pricing_capability_required/);
 assert.match(social,/fee_locked_after_registration/);
 assert.match(router,/\/api\/admin\/events/);
 assert.match(ui,/showEventPricing/);
 assert.match(ui,/tier_prices:\{community_90:amount\(tier90\),community_365:amount\(tier365\)\}/);
});
