import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../search-visibility-admin.js',import.meta.url),'utf8');
const prompts=readFileSync(new URL('../promotion-status-admin.js',import.meta.url),'utf8');

test('SEO audit never scores JSON or another non-HTML HTTP 200 response as a page',()=>{
  assert.match(source,/requireHtml = false/);
  assert.match(source,/requireHtml && !\/\^\(\?:text/);
  assert.match(source,/HTML 문서가 아닌 응답/);
  assert.match(source,/fetchBounded\(site\.url,\{requireHtml:true\}\)/);
  assert.match(source,/state\.audited\.set\(site\.url,\{basic:'점검 실패'/);
});

test('AI recommendations never report unknown provider registration as missing registration',()=>{
  assert.doesNotMatch(prompts,/미등록 검색엔진/);
  assert.match(prompts,/등록 여부가 미확인인 사이트/);
  assert.match(prompts,/공급자 근거가 없는 곳은 미확인으로 표시/);
  assert.match(prompts,/IndexNow 제출 이력/);
});
