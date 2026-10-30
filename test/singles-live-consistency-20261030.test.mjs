import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const app=await read('sites/ekodi-singles/public/app.js');
const css=await read('sites/ekodi-singles/public/styles.css');
const terms=await read('docs/EKODI-SINGLES-TERMS-BILLING.md');
const migration=await read('supabase/migrations/20261030192000_singles_contact_price_floor_consistency.sql');
const baseMigration=await read('supabase/migrations/20261028030000_singles_paid_membership.sql');
const env={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',SINGLES_M1_ENABLED:'true',SINGLES_SOCIAL_ENABLED:'true',ASSETS:{fetch:async()=>new Response('asset')}};

test('contact floor matches actual 50% discount computation without changing rate',()=>{
 assert.match(baseMigration,/\('contact','연락처 교환 요청·수락',100000,10000,50\)/);
 assert.match(baseMigration,/r\.standard_krw\*\(1-\(r\.max_discount_pct\/100\.0\)/);
 const effectiveFloor=(standard,floor,pct)=>Math.max(floor,Math.floor(standard*(1-pct/100)/1000)*1000);
 assert.equal(effectiveFloor(100000,10000,50),50000);
 assert.equal(effectiveFloor(10000,10000,0),10000);
 assert.match(migration,/set floor_krw=50000/);
 assert.match(migration,/where kind='contact'/);
 assert.match(migration,/standard_krw=100000/);
 assert.match(migration,/floor_krw=10000/);
 assert.match(migration,/max_discount_pct=50/);
 assert.match(app,/const effectiveFloor=Math\.max\(/);
 assert.match(app,/money\(effectiveFloor\)/);
 assert.match(terms,/\| 연락처 교환 요청·수락 \| 100,000원 \| 최대 50% \| 50,000원 \|/);
 assert.doesNotMatch(terms,/\| 연락처 교환 요청·수락 \| 100,000원 \| 최대 50% \| 10,000원 \|/);
});

test('live pilot notice is accurate; legal draft is not presented as final approval',async()=>{
 const res=await routeSinglesSurface(new Request('https://ekodi.kr/singles/privacy'),env);
 assert.equal(res.status,200);
 assert.match(res.headers.get('x-robots-tag')||'',/noindex/);
 const body=await res.text();
 assert.match(body,/제한적 시범 운영/);
 assert.match(body,/최종 검토 중/);
 assert.doesNotMatch(body,/동행 회원가입은 아직 개통되지 않았습니다/);
 assert.match(body,/성인확인과 공개 범위/);
 assert.match(body,/프로필은 기본 비공개/);
});

test('inner pages prioritize their own page content and keep free public landing',async()=>{
 const guest=await routeSinglesSurface(new Request('https://ekodi.kr/singles'),env);
 const home=await guest.text();
 assert.match(home,/romantic-hero/);
 const profile=await routeSinglesSurface(new Request('https://ekodi.kr/singles/my'),env);
 const markup=await profile.text();
 assert.match(markup,/<h1>내 프로필<\/h1>/);
 assert.match(css,/\.romantic-inner \.pillars\{display:none\}/);
 assert.match(css,/\.romantic-inner \.content\{padding-top:18px\}/);
});

test('refund/expiry messaging distinguishes pending scheduled processing from automatic refund completion',()=>{
 assert.match(app,/14일 무응답은 만료 처리 후 반환됩니다/);
 assert.match(app,/미사용 적립금 환불 기준과 신청 절차는 현재 법률 검토·운영 준비 중입니다/);
 assert.match(terms,/자동 반환 스케줄러와 적립금 환불 업무·원장 대사/);
});
