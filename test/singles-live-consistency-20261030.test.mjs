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
 // 2026-10-31 개정(1.5배): 표시 최저 요금도 실제 50% 할인 금액(75,000원)과 같아야 한다.
 assert.equal(effectiveFloor(150000,75000,50),75000);
 assert.match(terms,/\| 연락처 교환 요청·수락 \| 150,000원 \| 최대 50% \| 75,000원 \|/);
 assert.doesNotMatch(terms,/\| 연락처 교환 요청·수락 \| 150,000원 \| 최대 50% \| 15,000원 \|/);
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

test('refund/expiry messaging distinguishes automatic cleanup from refund completion (postpaid, 2026-10-31)',()=>{
 assert.match(app,/14일 동안 답이 없으면 자동으로 정리됩니다/);
 assert.match(app,/7일 안에 결제가 끝나지 않으면 연결이 취소되고, 먼저 결제한 분은 환불해 드립니다/);
 assert.match(terms,/환불 대상 표시 후 실제 송금은 운영자가 처리합니다/);
 assert.doesNotMatch(app,/가입비 500,000원을 계좌이체/);
});
