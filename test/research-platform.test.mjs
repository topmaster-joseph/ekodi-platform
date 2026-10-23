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
 assert.equal(data.authoritativeData,false);
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
 const denied=await worker.fetch(new Request('https://ekodi.kr/research/api/projects'),{RESEARCH_STORAGE_ENABLED:'true',RESEARCH_DB:fakeDB,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key'});
 assert.equal(denied.status,401);
 const blocked=await worker.fetch(new Request('https://ekodi.kr/research/api/projects',{method:'POST',headers:{origin:'https://evil.test'}}),{RESEARCH_STORAGE_ENABLED:'true',RESEARCH_DB:fakeDB,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key'});
 assert.equal(blocked.status,403);
});

test('canonical Research homepage never fetches /research/index.html and loops on a 307',async()=>{
 const paths=[];
 const env={ASSETS:{fetch:async request=>{
  const url=new URL(request.url);paths.push(url.pathname);
  if(url.pathname==='/research/index.html')return new Response(null,{status:307,headers:{location:'/research/'}});
  if(url.pathname==='/research/')return new Response('research-home',{status:200,headers:{'content-type':'text/plain; charset=utf-8'}});
  return new Response(null,{status:404});
 }}};
 const home=await worker.fetch(new Request('https://ekodi.kr/research/?source=nav'),env);
 assert.equal(home.status,200);
 assert.equal(await home.text(),'research-home');
 assert.deepEqual(paths,['/research/']);
 const explicit=await worker.fetch(new Request('https://ekodi.kr/research/index.html?source=nav'),env);
 assert.equal(explicit.status,308);
 assert.equal(explicit.headers.get('location'),'https://ekodi.kr/research/?source=nav');
 assert.deepEqual(paths,['/research/'],'index.html must redirect without invoking the assets canonicalizer');
 const slash=await worker.fetch(new Request('https://ekodi.kr/research?source=nav'),env);
 assert.equal(slash.status,308);
 assert.equal(slash.headers.get('location'),'https://ekodi.kr/research/?source=nav');
});

test('Research mobile screen uses one canonical footer and disables unrelated generic AI command dock',async()=>{
 const [html,css,shellAi,shellInjector]=await Promise.all([
  read('education/research/index.html'),read('education/research/app.css'),
  read('shell/user-ai-entry.js'),read('ekodi-shell-injector.js')
 ]);
 assert.match(html,/<html lang="ko" data-ekodi-user-ai-entry="off">/);
 assert.match(shellAi,/dataset\?\.ekodiUserAiEntry/);
 assert.match(shellAi,/==='off'\)return false/);
 assert.doesNotMatch(html,/<footer(?:\s|>)/i,'do not create a second Research footer');
 assert.doesNotMatch(css,/(?:^|})\s*footer\s*\{/m,'do not override the EKODI corporate footer with global Research CSS');
 assert.match(shellInjector,/renderEkodiUserFooter\(\)/,'shared EKODI company footer remains');
 assert.match(html,/class="integrity-note"/,'Research integrity text stays within Research content');
 assert.match(css,/@media\(max-width:730px\)/);
 assert.match(css,/max-width:calc\(100% - 100px\)/);
 assert.match(css,/main\{width:100%;max-width:100%;min-width:0;padding-inline:16px\}/);
 assert.match(css,/\.ethics\{padding:22px 16px;margin:24px 0\}/);
 assert.match(html,/id="diagnosisForm"/);
 assert.match(html,/id="projectForm"/);
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
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 assert.match(html,/id="cancelProjectEdit"/);
 assert.match(html,/id="exportPlans"/);
 assert.match(app,/function startEditProject/);
 assert.match(app,/saveEditProject/);
 assert.match(app,/sensitivity:'non-sensitive-planning-only'/);
 assert.match(app,/config.consultationEnabled/);
 assert.match(await read('education/research/worker.js'),/RESEARCH_CONSULTATION_ENABLED/);
 assert.match(await read('education/research/worker.js'),/UPDATE research_projects SET title=\?,field=\?,kind=\?,stage=\?/);
 assert.match(await read('platform-route-registry.js'),/prefix:'\/research',binding:'EDUCATION',preservePrefix:true/);
 assert.match(stage,/isolated-staging/);
 assert.match(sql,/owner_id TEXT NOT NULL/);
 assert.doesNotMatch(html,/onclick=|<script(?![^>]*src=)/i);
 assert.doesNotMatch(app,/service_role|private_key|payment_secret/i);
});
