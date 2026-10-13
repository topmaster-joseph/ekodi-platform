import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';

const env={
  SINGLES_PUBLIC_PREVIEW_ENABLED:'true',
  SINGLES_M1_ENABLED:'false',
  SINGLES_SOCIAL_ENABLED:'false',
  SINGLES_PAID_ACTIONS_ENABLED:'false',
  ASSETS:{fetch:async request=>new Response('asset:'+new URL(request.url).pathname,{
    headers:{'content-type':request.url.endsWith('.webp')?'image/webp':'text/plain'}
  })}
};
const request=(path,method='GET')=>new Request('https://ekodi.kr'+path,{method});

test('Donghaeng main hero uses the consented self-hosted photograph, concise copy and working links',async()=>{
  const result=await routeSinglesSurface(request('/singles'),env);
  assert.equal(result.status,200);
  const html=await result.text();
  assert.match(html,/<body class="romantic-home" data-page="">/);
  assert.match(html,/<section class="romantic-hero"/);
  assert.match(html,/<img src="\/singles\/donghaeng-couple\.webp"/);
  assert.match(html,/함께라서 더 아름다운 우리/);
  assert.match(html,/href="\/singles\/my">지금 시작하기/);
  assert.match(html,/href="\/singles\/events">만남 둘러보기/);
  assert.match(html,/href="\/singles\/groups"/);
  assert.match(html,/href="\/singles\/discover"/);
  assert.doesNotMatch(html,/FAITH · COMMUNITY · RELATIONSHIP/);
  assert.match(html,/href="\/auth\/\?site=singles&amp;return_to=/);
  assert.match(result.headers.get('content-security-policy'),/img-src 'self'/);
});

test('homepage image is a valid, optimized WebP and served through the isolated static asset route',async()=>{
  const asset=await readFile(new URL('../sites/ekodi-singles/public/donghaeng-couple.webp',import.meta.url));
  assert.equal(asset.toString('ascii',0,4),'RIFF');
  assert.equal(asset.toString('ascii',8,12),'WEBP');
  assert.ok(asset.byteLength>10000&&asset.byteLength<100000,'image should remain small enough for mobile');
  const get=await routeSinglesSurface(request('/singles/donghaeng-couple.webp'),env);
  assert.equal(get.status,200);
  assert.equal(get.headers.get('content-type'),'image/webp');
  assert.equal(await get.text(),'asset:/singles/donghaeng-couple.webp');
  assert.equal((await routeSinglesSurface(request('/singles/donghaeng-couple.webp','POST'),env)).status,405);
});

test('existing home, subpages and administrator shell remain addressable while prelaunch private APIs stay closed',async()=>{
  const pages=['/singles/','/singles/my','/singles/groups','/singles/events','/singles/discover',
    '/singles/messages','/singles/subscribe','/singles/admin'];
  for(const page of pages){
    const response=await routeSinglesSurface(request(page),env);
    assert.equal(response.status,200,page);
    assert.match(await response.text(),/<div id="memberContent" hidden>/,page);
    if(page!=='/singles/')assert.equal(response.headers.get('cache-control'),'private, no-store',page);
  }
  for(const path of ['/singles/api/me','/singles/api/profile','/singles/api/events',
    '/singles/api/discover','/singles/api/subscription','/singles/api/bank/orders']){
    assert.equal((await routeSinglesSurface(request(path),env)).status,503,path);
  }
  const publicView=await routeSinglesSurface(request('/singles/api/public'),env);
  assert.deepEqual((await publicView.json()).events,[]);
});

test('central EKODI Google handoff can verify identity in prelaunch without bypassing protected member permissions',async()=>{
  const app=await readFile(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');
  const auth=await readFile(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
  assert.match(app,/searchParams\.set\('site','singles'\)/);
  assert.match(app,/searchParams\.set\('return_to','https:\/\/ekodi\.kr\/singles'/);
  assert.match(auth,/singles:\{name:'EKODI 동행',returnTo:'https:\/\/ekodi\.kr\/singles\/'/);
  assert.match(app,/if\(!status\?\.auth\?\.supabase_url\|\|!status\?\.auth\?\.publishable_key\)return/);
  assert.match(app,/if\(!status\?\.onboarding_enabled\)\{/);
  assert.match(app,/회원가입·프로필·행사·메시지·결제는 안전 검증을 마친 후 열립니다/);
  assert.match(app,/if\(!h\.querySelector\('\[data-donghaeng-login\]'\)\)/);
  assert.match(app,/history\.replaceState\(null,'',location\.pathname\+location\.search\)/);
  const liveGate=await routeSinglesSurface(request('/singles/api/status'),env);
  const status=await liveGate.json();
  assert.equal(status.onboarding_enabled,false);
  assert.equal(status.social_enabled,false);
  assert.equal(status.paid_actions_enabled,false);
});
