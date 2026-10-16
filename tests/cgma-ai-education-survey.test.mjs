import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../prototypes/cgma-ai-education-survey.html',import.meta.url));
const html=readFileSync(file,'utf8');
test('merchant survey provides Korean mobile-accessible entry',()=>{
  assert.match(html,/<html lang="ko">/);
  assert.match(html,/name="viewport"/);
  assert.match(html,/<form id="survey">/);
  assert.match(html,/aria-live="polite"/);
});
test('merchant survey never sends responses to remote server',()=>{
  assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB/i);
  assert.match(html,/서버에 전송되거나 브라우저 저장소에 보관되지 않습니다/);
});
test('merchant survey requires needs and education topics',()=>{
  assert.match(html,/data\[2\]\[1\]\.length/);
  assert.match(html,/if\(!topics\.length\)/);
  assert.match(html,/const multi=new Set\(\[2,3,5\]\)/);
});
test('merchant survey exports only current individual response',()=>{
  assert.match(html,/merchant-ai-survey\.csv/);
  assert.match(html,/last=\{data,comment:/);
  assert.match(html,/URL\.revokeObjectURL/);
});
