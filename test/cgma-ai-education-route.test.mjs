import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isCgmaAiEducationPath,routeCgmaAiEducation,CGMA_AI_EDUCATION_ROUTE,CGMA_AI_EDUCATION_SOURCE} from '../cgma-ai-education-route.js';

const base='https://ekodi.kr/cgma/ai-education';
const req=(suffix='/',method='GET')=>new Request(base+suffix,{method});
const read=path=>readFileSync(fileURLToPath(new URL('../'+path,import.meta.url)),'utf8');
const quiet=async fn=>{const original=console.error;console.error=()=>{};try{return await fn()}finally{console.error=original}};

test('canonical CGMA path matches only survey subtree',()=>{
  assert.equal(isCgmaAiEducationPath('/cgma/ai-education'),true);
  assert.equal(isCgmaAiEducationPath('/cgma/ai-education/'),true);
  assert.equal(isCgmaAiEducationPath('/cgma/ai-education-other'),false);
  assert.equal(isCgmaAiEducationPath('/cheonggye/ai-education/'),false);
});

test('Shared Site never serves a survey: every survey path fails closed with no-store',async()=>{
  const assets={ASSETS:{fetch:async()=>new Response('<form id="survey">',{headers:{'content-type':'text/html'}})}};
  for(const suffix of ['','/','/index.html','/app.js','/questions.mjs','/report/','/api/stats','/api/responses']){
    const res=await quiet(()=>routeCgmaAiEducation(req(suffix),assets));
    assert.equal(res.status,503,suffix);
    assert.equal(res.headers.get('cache-control'),'no-store',suffix);
    assert.equal(res.headers.get('x-ekodi-route'),CGMA_AI_EDUCATION_ROUTE,suffix);
    assert.equal(res.headers.get('x-ekodi-source-of-truth'),CGMA_AI_EDUCATION_SOURCE,suffix);
    const body=await res.text();
    assert.doesNotMatch(body,/<form|<script/i,suffix);
  }
});

test('retired guard notice explains no non-persisting form is offered',async()=>{
  const res=await quiet(()=>routeCgmaAiEducation(req('/')));
  assert.match(res.headers.get('content-type'),/text\/html/);
  assert.match(res.headers.get('content-security-policy'),/default-src 'none'/);
  assert.match(res.headers.get('content-security-policy'),/form-action 'none'/);
  assert.match(await res.text(),/응답이 저장되지 않는 화면은 제공하지 않습니다/);
});

test('writes are rejected and non-survey paths are not claimed',async()=>{
  const write=await routeCgmaAiEducation(req('/','POST'));
  assert.equal(write.status,405);
  assert.equal(write.headers.get('allow'),'GET, HEAD');
  assert.equal(await routeCgmaAiEducation(new Request('https://ekodi.kr/cgma/board')),null);
  const head=await quiet(()=>routeCgmaAiEducation(req('/','HEAD')));
  assert.equal(head.status,503);
});

test('regression guard: no non-persisting survey prototype is built or shipped by the Shared Site',()=>{
  assert.equal(existsSync(fileURLToPath(new URL('../prototypes/cgma-ai-education-survey.html',import.meta.url))),false);
  assert.equal(existsSync(fileURLToPath(new URL('../prototypes/cgma-ai-education-survey.js',import.meta.url))),false);
  const build=read('scripts/build.mjs');
  assert.doesNotMatch(build,/cgma\/ai-education\/(index\.html|app\.js)/);
  assert.doesNotMatch(read('_headers'),/X-EKODI-Route: cgma-ai-education-survey/);
});

test('production edge verification still pins the D1-backed operating survey from cheonggye-market',()=>{
  const wf=read('.github/workflows/deploy-cgma-apex-edge.yml');
  assert.ok(wf.includes("check_cgma '/cgma/ai-education/app.js' 'const questions = [' 'cgma-ai-education-survey'"));
  assert.ok(wf.includes("x-ekodi-route: cgma-ai-education-api"));
  assert.ok(wf.includes('CGMA_SOURCE_REPO: topmaster-joseph/cheonggye-market'));
  // 접수현황 drawer regression guard (cheonggye-market #183).
  assert.ok(wf.includes(`grep -Fq "frame-src 'self'" <<<"$survey_csp"`));
  assert.ok(wf.includes(`grep -Fq "frame-ancestors 'none'" <<<"$survey_csp"`));
  assert.ok(wf.includes('test "$survey_csp_ok" = true'));
});
