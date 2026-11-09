import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../search-visibility-admin.js',import.meta.url),'utf8');
const prompts=readFileSync(new URL('../promotion-status-admin.js',import.meta.url),'utf8');

test('public audit rejects non-HTML responses and redirected page substitutions',()=>{
  assert.match(source,/validatePublicAuditResponse\(site,receipt\)/);
  assert.match(source,/contentType/);
  assert.match(source,/\['text\/html','application\/xhtml\+xml'\]/);
  assert.match(source,/공개 문서가 HTML로 응답하지 않았습니다/);
  assert.match(source,/요청한 공개 경로 대신 다른 페이지로 이동했습니다/);
  assert.match(source,/state\.audited\.set\(site\.url,\{basic:'점검 실패'/);
});

test('search prompts distinguish unknown provider registration from missing registration',()=>{
  assert.doesNotMatch(prompts,/미등록 검색엔진/);
  assert.match(prompts,/등록 여부가 미확인인 사이트/);
  assert.match(prompts,/공급자 근거가 없는 곳은 미확인으로 표시/);
  assert.match(prompts,/IndexNow 제출 이력/);
});
