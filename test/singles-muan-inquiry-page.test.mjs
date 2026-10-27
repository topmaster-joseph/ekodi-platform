import test from 'node:test';
import assert from 'node:assert/strict';
import {routeSinglesSurface} from '../singles-surface.js';

const env={ASSETS:{fetch:()=>new Response('')}};
test('무안군 질의서 페이지: 링크로 열리고 검색·스크립트 없이 제공', async()=>{
 const r=await routeSinglesSurface(new Request('https://ekodi.kr/singles/inquiry/muan-2026'),env);
 assert.equal(r.status,200);
 assert.match(r.headers.get('x-robots-tag')||'',/noindex/);
 assert.match(r.headers.get('cache-control'),/no-store/);
 const body=await r.text();
 assert.match(body,/<meta name="robots" content="noindex,nofollow,noarchive">/);
 assert.doesNotMatch(body,/<script/);
 for(const s of ['질 의 서','국내결혼중개업 신고','50,000원','500,000원','10,000원','가.','라.','EKODIBIZ'])assert.ok(body.includes(s),s);
 assert.doesNotMatch(body,/확인필요|작성 참고/);
});
test('질의서 페이지는 읽기 전용', async()=>{
 const r=await routeSinglesSurface(new Request('https://ekodi.kr/singles/inquiry/muan-2026',{method:'POST'}),env);
 assert.equal(r.status,405);
 const n=await routeSinglesSurface(new Request('https://ekodi.kr/singles/inquiry/other'),env);
 assert.equal(n.status,404);
});
