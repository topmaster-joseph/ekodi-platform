import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';

const env={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',SINGLES_M1_ENABLED:'false',SINGLES_SOCIAL_ENABLED:'false',SINGLES_PAID_ACTIONS_ENABLED:'false',ASSETS:{fetch:async()=>new Response('asset')}};
const req=(p,method='GET')=>new Request('https://ekodi.kr'+p,{method});

test('service-specific privacy document is reachable to guests and unindexed until review',async()=>{
 const response=await routeSinglesSurface(req('/singles/privacy'),env);
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/text\/html/);
 assert.match(response.headers.get('x-robots-tag'),/noindex/);
 const html=await response.text();
 for(const phrase of ['개통 전 검토용','신앙·신념 정보','만 19세 이상 자기확인','프로필은 기본 비공개','동행으로 돌아가기'])assert.ok(html.includes(phrase),phrase);
 assert.ok(html.includes('href="/privacy"'));
 assert.doesNotMatch(html,/\b(?:신분증\s*업로드|이미\s*성인인증|회원가입\s*개통\s*완료)\b/);
});
test('privacy HEAD is empty; no request may mutate draft notice',async()=>{
 const head=await routeSinglesSurface(req('/singles/privacy','HEAD'),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
 const post=await routeSinglesSurface(req('/singles/privacy','POST'),env);assert.equal(post.status,405);
});
test('main and consent shell link to privacy review but launch gates remain closed',async()=>{
 for(const path of ['/singles','/singles/my']){
  const res=await routeSinglesSurface(req(path),env);const html=await res.text();assert.match(html,/href="\/singles\/privacy"/);
 }
 assert.equal((await routeSinglesSurface(req('/singles/api/me'),env)).status,503);
 assert.equal((await routeSinglesSurface(req('/singles/api/discover'),env)).status,503);
 const native=await readFile(new URL('../.github/workflows/verify-singles-native-browser.yml',import.meta.url),'utf8');
 assert.equal((native.match(/\\/singles\\/privacy/g)||[]).length,2,'both native profiles must inspect the privacy draft');
 const source=await readFile(new URL('../singles-surface.js',import.meta.url),'utf8');
 assert.match(source,/SINGLES_M1_ENABLED==='true'/);
 assert.match(source,/paid_brokerage_enabled:false/);
});
