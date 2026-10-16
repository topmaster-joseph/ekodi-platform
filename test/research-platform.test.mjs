import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessResearch,cleanResearchInput} from '../education/research/planner.js';
import worker from '../education/research/worker.js';

const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('deterministic diagnosis never claims AI generated or verified literature',()=>{
 const data=assessResearch(cleanResearchInput({stage:'design',hurdle:'statistics',method:'undecided'}));
 assert.equal(data.kind,'rule_based_research_guidance');
 assert.equal(data.verifiedLiterature,false);
 assert.equal(data.aiGenerated,false);
 assert.match(data.recommendation,/통계/);
 assert.equal(data.tasks.length>=4,true);
});

test('health exposes phase and disabled high-risk operations truthfully',async()=>{
 const response=await worker.fetch(new Request('https://ekodi.kr/research/health'),{});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.phase,'foundation');
 assert.equal(data.dataMode,'local-planning-only');
 assert.equal(data.privateDocuments,false);
 assert.equal(data.payments,false);
 assert.equal(data.aiExecution,false);
 assert.equal(response.headers.get('cache-control'),'no-store');
});

test('diagnosis validates input and cannot leak request to an external model',async()=>{
 const r=await worker.fetch(new Request('https://ekodi.kr/research/api/diagnosis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hurdle:'literature'})}),{});
 assert.equal(r.status,200);
 assert.equal((await r.json()).diagnosis.aiGenerated,false);
 const wrong=await worker.fetch(new Request('https://ekodi.kr/research/api/diagnosis',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'}),{});
 assert.equal(wrong.status,415);
 const massive=await worker.fetch(new Request('https://ekodi.kr/research/api/diagnosis',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(4000)}),{});
 assert.equal(massive.status,413);
});

test('private workspace is fail-closed without storage and verified identity',async()=>{
 const r=await worker.fetch(new Request('https://ekodi.kr/research/api/projects'),{});
 assert.equal(r.status,503);
 const fakeDB={prepare:()=>({})};
 const denied=await worker.fetch(new Request('https://ekodi.kr/research/api/projects'),{RESEARCH_DB:fakeDB,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key'});
 assert.equal(denied.status,401);
 const blocked=await worker.fetch(new Request('https://ekodi.kr/research/api/projects',{method:'POST',headers:{origin:'https://evil.test'}}),{RESEARCH_DB:fakeDB,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key'});
 assert.equal(blocked.status,403);
});

test('public UI maintains accessible responsive layout and no fake paid/AI claims',async()=>{
 const [html,css,app,prod,stage,sql]=await Promise.all([
  read('education/research/index.html'),read('education/research/app.css'),read('education/research/app.js'),
  read('wrangler.education.toml'),read('wrangler.education.staging.toml'),
  read('research/migrations/0001_init.sql')
 ]);
 assert.match(html,/id="diagnosisForm"/);
 assert.match(html,/id="projectForm"/);
 assert.match(html,/id="consultingForm"/);
 assert.match(html,/규칙 기반/);
 assert.match(html,/원고나 민감한 연구데이터는 아직 업로드할 수 없습니다/);
 assert.match(css,/@media\(max-width:730px\)/);
 assert.match(css,/word-break:keep-all/);
 assert.match(app,/localStorage/);
 assert.match(await read('platform-route-registry.js'),/prefix:'\/research',binding:'EDUCATION',preservePrefix:true/);
 assert.match(stage,/isolated-staging/);
 assert.match(sql,/owner_id TEXT NOT NULL/);
 assert.doesNotMatch(html,/onclick=|<script(?![^>]*src=)/i);
 assert.doesNotMatch(app,/service_role|private_key|payment_secret/i);
});
