import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLRewriter??=class{on(){return this;}onDocument(){return this;}transform(r){return r;}};
const {default:worker}=await import('../education-worker.js');
import {validateResponse,summarize} from '../education-feedback.js';
import {mintGateToken,GATE_COOKIE,isGatedPath,isStrictPath} from '../education-instructor-gate.js';

const KEY='k'.repeat(48);
function r2(){const m=new Map();return {m,
  put:async(k,v)=>{m.set(k,v)},get:async k=>m.has(k)?{json:async()=>JSON.parse(m.get(k))}:null,
  list:async({prefix})=>({objects:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})};}
const ASSETS={fetch:async req=>new Response('ASSET '+new URL(req.url).pathname,{status:200,headers:{'content-type':'text/html'}})};
const answer=(over={})=>({course:'mnu-factchat-2026',session:2,device:'a'.repeat(32),scores:{overall:5,practice:4,clarity:5,apply:4},field:'academic',useful:['hwp','minutes','evil'],text:{good:'좋아요',improve:'',next:'엑셀'},...over});
const post=(body,env,origin='https://ekodi.kr')=>worker.fetch(new Request('https://ekodi.kr/study/live/feedback/api/responses',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)}),env);

test('validation: required 1–5 scores, known course/session, filtered choices, trimmed text, no personal fields',()=>{
  const v=validateResponse(answer());assert.equal(v.ok,true);
  assert.deepEqual(v.record.useful,['hwp','minutes']);
  assert.equal(Object.keys(v.record).sort().join(),'course,device,field,scores,session,text,useful');
  assert.equal(validateResponse(answer({session:7})).ok,false);
  assert.equal(validateResponse(answer({course:'x'})).ok,false);
  assert.equal(validateResponse(answer({scores:{overall:6,practice:4,clarity:5,apply:4}})).ok,false);
  assert.equal(validateResponse(answer({device:'nope'})).ok,false);
  assert.equal(validateResponse(answer({text:{improve:'가'.repeat(900)}})).record.text.improve.length,500);
});

test('anonymous answers are stored per device and 차수 (resubmit replaces); summary needs the instructor session',async()=>{
  const bucket=r2(),env={ASSETS,EDU_DOCS:bucket,EDU_GATE_SIGNING_KEY:KEY};
  assert.equal((await post(answer(),env)).status,200);
  assert.equal((await post(answer({scores:{overall:3,practice:3,clarity:3,apply:3}}),env)).status,200);
  assert.equal(bucket.m.size,1,'same device + 차수 overwrites');
  assert.equal((await post(answer({device:'b'.repeat(32)}),env)).status,200);
  assert.equal((await post(answer(),env,'https://evil.example')).status,403);
  const anon=await worker.fetch(new Request('https://ekodi.kr/study/live/feedback/api/summary?s=2'),env);
  assert.equal(anon.status,401);
  const cookie=GATE_COOKIE+'='+await mintGateToken(KEY);
  const res=await worker.fetch(new Request('https://ekodi.kr/study/live/feedback/api/summary?s=2',{headers:{cookie}}),env);
  assert.equal(res.status,200);const d=await res.json();
  assert.equal(d.count,2);assert.equal(d.avg.overall,4);assert.equal(d.useful.hwp,2);assert.deepEqual(d.comments.next,['엑셀','엑셀']);
  const all=await (await worker.fetch(new Request('https://ekodi.kr/study/live/feedback/api/summary?s=all',{headers:{cookie}}),env)).json();
  assert.equal(all.bySession[2],2);
});

test('survey page is public; the QR/results page is strict instructor-only',()=>{
  assert.equal(isGatedPath('/study/live/feedback/'),false);
  assert.equal(isGatedPath('/study/live/feedback/feedback.js'),false);
  assert.ok(isStrictPath('/study/live/guide/feedback.html'));assert.ok(isStrictPath('/study/live/guide/feedback.js'));
  const s=summarize([]);assert.equal(s.count,0);assert.equal(s.avg.overall,null);
});
