import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const read=path=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),'utf8');
const html=read('../prototypes/cgma-ai-education-survey.html');
const runtime=read('../prototypes/cgma-ai-education-survey.js');
const build=read('../scripts/build.mjs');
const edge=read('../platform-router-entry-worker.js');
const headers=read('../_headers');
const wrangler=read('../wrangler.site.toml');
test('merchant survey provides accessible Korean mobile entry and CGMA back link',()=>{
  assert.match(html,/<html lang="ko">/);
  assert.match(html,/name="viewport"/);
  assert.match(html,/<form id="survey">/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/href="\/cgma\/"/);
});
test('script uses external protected route, no inline script',()=>{
  assert.match(html,/<script src="\/cgma\/ai-education\/app.js" defer><\/script>/);
  assert.doesNotMatch(html,/<script\s*>/);
  assert.match(headers,/\/cgma\/ai-education\/\*/);
  assert.match(headers,/script-src 'self'/);
});
test('merchant survey never sends responses to remote server or browser storage',()=>{
  assert.doesNotMatch(runtime,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB/i);
  assert.match(html,/서버에 전송되거나 브라우저 저장소에 보관되지 않습니다/);
});
test('merchant survey requires needs and education topics',()=>{
  assert.match(runtime,/data\[2\]\[1\]\.length/);
  assert.match(runtime,/if\(!topics\.length\)/);
  assert.match(runtime,/const multi=new Set\(\[2,3,5\]\)/);
});
test('merchant survey exports only the current individual response',()=>{
  assert.match(runtime,/merchant-ai-survey\.csv/);
  assert.match(runtime,/last=\{data,comment:/);
  assert.match(runtime,/URL\.revokeObjectURL/);
});
test('build publishes survey HTML and JS to canonical organization path',()=>{
  assert.match(build,/cgma\/ai-education\/index.html/);
  assert.match(build,/cgma\/ai-education\/app.js/);
  assert.match(edge,/routeCgmaAiEducation\(request,env\)/);
  assert.match(wrangler,/\/"\/cgma\*"/);
});
