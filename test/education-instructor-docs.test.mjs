import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
globalThis.HTMLRewriter??=class{on(){return this;}onDocument(){return this;}transform(response){return response;}};
const {default:worker}=await import('../education-worker.js');
import { instructorDocs, sniffType, DOCS_PREFIX, newToken } from '../education-instructor-docs.js';
import { createVerifier, mintGateToken, GATE_COOKIE, isGatedPath } from '../education-instructor-gate.js';

const KEY='k'.repeat(48);
const SECRET=await createVerifier('test-pin-0000',{iterations:10000});
function fakeR2(){
  const store=new Map();
  return {store,
    async put(key,value,opts={}){const bytes=new Uint8Array(value instanceof ArrayBuffer?value:await new Response(value).arrayBuffer());store.set(key,{bytes,httpMetadata:opts.httpMetadata||{},customMetadata:opts.customMetadata||{}});},
    async get(key){const o=store.get(key);if(!o)return null;return {body:new Blob([o.bytes]).stream(),size:o.bytes.length,httpMetadata:o.httpMetadata,customMetadata:o.customMetadata};},
    async delete(key){store.delete(key);},
    async list({prefix}){return {objects:[...store.entries()].filter(([k])=>k.startsWith(prefix)).map(([key,o])=>({key,size:o.bytes.length,httpMetadata:o.httpMetadata,customMetadata:o.customMetadata})),truncated:false};}
  };
}
const ASSETS={fetch:async()=>new Response('<!doctype html><html><head></head><body>ASSET</body></html>',{headers:{'content-type':'text/html'}})};
const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,1,2,3]);
const PDF=new TextEncoder().encode('%PDF-1.4 test');
const env=(extra={})=>({ASSETS,EDU_DOCS:fakeR2(),EDU_INSTRUCTOR_GATE_SECRET:SECRET,EDU_GATE_SIGNING_KEY:KEY,EDU_INSTRUCTOR_GATE_MODE:'open',...extra});
const cookie=async()=>GATE_COOKIE+'='+await mintGateToken(KEY);
const BASE='https://ekodi.kr/study/live/docs/';
const call=(e,path,init={})=>worker.fetch(new Request(BASE+path,init),e);
async function upload(e,{kind='id',days='7',purpose='국립목포대학교 강사료 지급 확인용',bytes=PNG,auth=true,origin='https://ekodi.kr'}={}){
  const fd=new FormData();fd.set('kind',kind);fd.set('days',days);fd.set('purpose',purpose);fd.set('file',new File([bytes],'x.bin'));
  const headers={};if(auth)headers.cookie=await cookie();if(origin)headers.origin=origin;
  return call(e,'api/upload',{method:'POST',headers,body:fd});
}

test('management API needs an instructor password session, even when the studio runs open',async()=>{
  const e=env();
  assert.equal((await call(e,'api/list')).status,401);
  assert.equal((await upload(e,{auth:false})).status,401);
  const noPassword=env({EDU_INSTRUCTOR_GATE_SECRET:'',EDU_INSTRUCTOR_GATE:''});
  assert.equal((await call(noPassword,'api/list',{headers:{cookie:await cookie()}})).status,401,'no configured password → no session');
  assert.equal((await upload(e,{origin:'https://evil.example'})).status,403);
  assert.equal((await upload(e,{origin:''})).status,403,'POST without Origin refused');
  assert.equal((await call(env({EDU_DOCS:undefined}),'api/list',{headers:{cookie:await cookie()}})).status,503,'no storage binding (staging) → 503');
});

test('upload → share link → viewer and file for anyone with the link → revoke',async()=>{
  const e=env();
  const r=await upload(e);
  assert.equal(r.status,201);
  const {item}=await r.json();
  assert.match(item.path,/^s\/[A-Za-z0-9_-]{43}$/);assert.equal(item.label,'신분증 사본');assert.equal(item.type,'image/png');
  const view=await call(e,item.path);
  assert.equal(view.status,200);
  const html=await view.text();
  assert.match(html,/신분증 사본/);assert.match(html,/국립목포대학교 강사료 지급 확인용/);assert.match(html,/src="\.\.\/f\//);
  assert.match(view.headers.get('cache-control'),/no-store/);assert.match(view.headers.get('x-robots-tag'),/noindex/);assert.equal(view.headers.get('referrer-policy'),'no-referrer');
  assert.match(view.headers.get('content-security-policy'),/script-src 'none'/);
  const file=await call(e,item.path.replace(/^s\//,'f/'));
  assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'image/png');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()),PNG);
  assert.match((await call(e,item.path.replace(/^s\//,'f/')+'?download=1')).headers.get('content-disposition'),/^attachment; filename="id-copy\.png"/);
  const list=await (await call(e,'api/list',{headers:{cookie:await cookie()}})).json();
  assert.equal(list.items.length,1);assert.equal(list.items[0].token,item.path.slice(2));
  const del=await call(e,'api/delete',{method:'POST',headers:{cookie:await cookie(),origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({token:item.path.slice(2)})});
  assert.equal(del.status,200);
  assert.equal((await call(e,item.path)).status,404);
});

test('expired links answer 410 and delete the file; bad types, sizes and expiries are refused',async()=>{
  const e=env();
  const token=newToken();
  await e.EDU_DOCS.put(DOCS_PREFIX+token,PDF,{httpMetadata:{contentType:'application/pdf'},customMetadata:{kind:'bank',purpose:'',expiresAt:String(Date.now()-1000),createdAt:'1'}});
  assert.equal((await call(e,'s/'+token)).status,410);
  assert.equal(e.EDU_DOCS.store.size,0,'expired object deleted on access');
  assert.equal((await upload(e,{bytes:new TextEncoder().encode('<svg onload=alert(1)>')})).status,415);
  assert.equal((await upload(e,{days:'365'})).status,400);
  assert.equal((await upload(e,{kind:'passport'})).status,400);
  const big=new Uint8Array(10*1024*1024+1);big.set(PNG);
  assert.equal((await upload(e,{bytes:big})).status,413);
  assert.equal((await call(e,'s/not-a-token')).status,404);
  assert.equal(sniffType(PDF.buffer),'application/pdf');
  const pdf=await (await upload(e,{kind:'bank',bytes:PDF,days:'1'})).json();
  const view=await (await call(e,pdf.item.path)).text();
  assert.match(view,/<object class="doc-pdf" data="\.\.\/f\//);assert.match(view,/통장 사본/);
});

test('the manager page is behind the instructor password; share views are public; staging has no storage',async()=>{
  for(const p of ['/study/live/docs','/study/live/docs/','/study/live/docs/index.html'])assert.ok(isGatedPath(p),p);
  for(const p of ['/study/live/docs/s/x','/study/live/docs/f/x','/study/live/docs.js'])assert.ok(!isGatedPath(p),p);
  const page=await worker.fetch(new Request('https://ekodi.kr/study/live/docs/'),env());
  assert.equal(page.status,401);assert.match(await page.text(),/type="password"/);
  const staging=await readFile(new URL('../wrangler.education.staging.toml',import.meta.url),'utf8');
  assert.doesNotMatch(staging,/r2_buckets|EDU_DOCS/,'isolated staging never touches production storage');
  const prod=await readFile(new URL('../wrangler.education.toml',import.meta.url),'utf8');
  assert.match(prod,/\[\[r2_buckets\]\]\nbinding = "EDU_DOCS"\nbucket_name = "ekodi-storage"/);
  const health=await (await worker.fetch(new Request('https://ekodi.kr/health'),env())).json();
  assert.equal(health.instructorDocumentShare,'instructor-own-documents-expiring-links');
  const js=await readFile(new URL('../education/study/live/docs.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/localStorage|sessionStorage|document\.cookie/);
  const html=await readFile(new URL('../education/study/live/docs/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/<script(?![^>]*\ssrc=)[^>]*>|<style[\s>]|\sstyle=|\son[a-z]+=/i);
});
