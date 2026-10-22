import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Node has no Cloudflare HTMLRewriter; a pass-through keeps the Shell injection step inert in this contract test.
globalThis.HTMLRewriter??=class{on(){return this;}onDocument(){return this;}transform(response){return response;}};
const {default:worker}=await import('../education-worker.js');
import { createVerifier, verifyPassword, mintGateToken, verifyGateToken, isGatedPath, parseVerifier, GATE_COOKIE, activeVerifier } from '../education-instructor-gate.js';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const PASSWORD='test-only-pass-7k2m-9qxz';
const KEY='k'.repeat(48);
const VERIFIER=await createVerifier(PASSWORD,{iterations:10000});
const ASSETS={fetch:async request=>{const p=new URL(request.url).pathname;return new Response('<!doctype html><html><head></head><body>ASSET '+p+'</body></html>',{status:200,headers:{'content-type':p.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'}});}};
const env=(extra={})=>({ASSETS,EDU_INSTRUCTOR_GATE:VERIFIER,EDU_GATE_SIGNING_KEY:KEY,...extra});
const get=(path,init={},e=env())=>worker.fetch(new Request('https://ekodi.kr'+path,init),e);
const login=(password,headers={})=>get('/study/live/?c=mnu-factchat-2026',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://ekodi.kr',...headers},body:new URLSearchParams({password})});

test('gate covers exactly the instructor surfaces; learner surfaces stay public',()=>{
  for(const p of ['/study/live','/study/live/','/study/live/index.html','/study/live/instructor.js','/study/live/present/','/study/live/present/index.html','/study/live/present.js','/study/live/courses/mnu-factchat-2026.notes.js'])assert.ok(isGatedPath(p),p);
  for(const p of ['/study/live/lab/','/study/live/lab.js','/study/live/live.css','/study/live/engine/render.js','/study/live/courses/mnu-factchat-2026.js','/study/live/courses/registry.js','/study/live/entry.js','/factchat/','/study/'])assert.ok(!isGatedPath(p),p);
});

test('unauthenticated instructor pages show the lock page; notes and scripts are refused',async()=>{
  const page=await get('/study/live/?c=mnu-factchat-2026');
  assert.equal(page.status,401);
  assert.match(page.headers.get('cache-control'),/no-store/);
  const html=await page.text();
  assert.match(html,/type="password"/);assert.match(html,/강사 운영실/);assert.doesNotMatch(html,/ASSET/);
  for(const p of ['/study/live/present/?c=mnu-factchat-2026','/study/live/courses/mnu-factchat-2026.notes.js','/study/live/instructor.js']){
    const r=await get(p);assert.equal(r.status,401,p);assert.doesNotMatch(await r.text(),/ASSET/,p);
  }
  const lab=await get('/study/live/lab/?c=mnu-factchat-2026');
  assert.equal(lab.status,200);assert.match(await lab.text(),/ASSET/);
  assert.match(lab.headers.get('content-security-policy'),/frame-ancestors 'self'/);
  assert.equal(lab.headers.get('x-frame-options'),'SAMEORIGIN');
  const entry=await get('/factchat/');assert.equal(entry.status,200);
  assert.match(entry.headers.get('content-security-policy'),/frame-ancestors 'none'/,'only the learner lab may be framed');
});

test('password sign-in sets a scoped HttpOnly session; wrong or cross-site attempts fail',async()=>{
  const bad=await login('wrong-password-123');
  assert.equal(bad.status,401);assert.equal(bad.headers.get('set-cookie'),null);assert.match(await bad.text(),/맞지 않습니다/);
  const cross=await login(PASSWORD,{origin:'https://evil.example'});
  assert.equal(cross.status,403);assert.equal(cross.headers.get('set-cookie'),null);
  const ok=await login(PASSWORD);
  assert.equal(ok.status,303);
  assert.equal(ok.headers.get('location'),'./?c=mnu-factchat-2026');
  const cookie=ok.headers.get('set-cookie');
  assert.match(cookie,new RegExp('^'+GATE_COOKIE+'=v1\\.'));
  assert.match(cookie,/Path=\/edu\/study\/live;/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
  const token=cookie.split(';')[0];
  for(const p of ['/study/live/?c=mnu-factchat-2026','/study/live/present/?c=mnu-factchat-2026','/study/live/courses/mnu-factchat-2026.notes.js']){
    const r=await get(p,{headers:{cookie:token}});
    assert.equal(r.status,200,p);assert.match(await r.text(),/ASSET/);assert.match(r.headers.get('cache-control'),/private, no-store/,p);
  }
  const out=await get('/study/live/?c=mnu-factchat-2026&gate=logout',{headers:{cookie:token}});
  assert.equal(out.status,303);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
});

test('fails closed without a verifier or signing key, and rejects forged or expired tokens',async()=>{
  for(const e of [env({EDU_INSTRUCTOR_GATE:''}),env({EDU_GATE_SIGNING_KEY:''}),env({EDU_GATE_SIGNING_KEY:'short'})]){
    const r=await get('/study/live/',{},e);assert.equal(r.status,503);const html=await r.text();assert.doesNotMatch(html,/ASSET/);assert.doesNotMatch(html,/type="password"/);
    const notes=await get('/study/live/courses/mnu-factchat-2026.notes.js',{},e);assert.equal(notes.status,503);
  }
  const now=Date.now();
  const t=await mintGateToken(KEY,{now});
  assert.ok(await verifyGateToken(t,KEY,{now}));
  assert.ok(!(await verifyGateToken(t,'x'.repeat(48),{now})),'other key');
  assert.ok(!(await verifyGateToken(t,KEY,{now:now+13*3600*1000})),'expired');
  const sig=t.split('.')[2];
  for(const i of [0,20,42]){const c=sig[i]==='A'?'B':'A';assert.ok(!(await verifyGateToken(t.slice(0,t.length-43)+sig.slice(0,i)+c+sig.slice(i+1),KEY,{now})),'tampered at '+i);}
  assert.ok(!(await verifyGateToken('v1.9999999999.'+t.split('.')[2],KEY,{now})),'far-future exp');
  const forged=await get('/study/live/',{headers:{cookie:GATE_COOKIE+'=v1.1999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'}});
  assert.equal(forged.status,401);
});

test('deployed verifiers are well-formed PBKDF2 within the Workers iteration cap; no plaintext password in config',async()=>{
  for(const f of ['wrangler.education.toml','wrangler.education.staging.toml']){
    const text=await readFile(new URL('../'+f,import.meta.url),'utf8');
    const m=/EDU_INSTRUCTOR_GATE = "([^"]+)"/.exec(text);assert.ok(m,f);
    const v=parseVerifier(m[1]);assert.ok(v,f);assert.ok(v.iterations<=100000&&v.iterations>=100000,f);
    assert.doesNotMatch(text,/EDU_GATE_SIGNING_KEY\s*=/,'signing key is a Worker secret, never a var');
  }
  assert.ok(await verifyPassword(PASSWORD,VERIFIER));assert.ok(!(await verifyPassword('',VERIFIER)));
});

test('lock page survives the canonical /edu router (asset links prefixed, form posts back to itself)',async()=>{
  const routed=await routeCanonicalSurface(new Request('https://ekodi.kr/edu/study/live/?c=mnu-factchat-2026'),{EDUCATION:{fetch:request=>worker.fetch(request,env())}});
  assert.equal(routed.status,401);
  const html=await routed.text();
  assert.match(html,/href="\/edu\/study\/live\/live\.css"/);
  assert.match(html,/href="\/edu\/study\/live\/lab\/\?c=mnu-factchat-2026"/);
  assert.match(html,/<form method="post" action=""/);
});

test('an instructor-chosen password (Worker secret) replaces the generated one; the workflow never prints it',async()=>{
  const chosen='우리-강의실-2026!';
  const secret=await createVerifier(chosen,{iterations:10000});
  const e=env({EDU_INSTRUCTOR_GATE_SECRET:secret});
  assert.equal(activeVerifier(e),secret);
  assert.equal(activeVerifier(env({EDU_INSTRUCTOR_GATE_SECRET:'garbage'})),VERIFIER,'malformed secret falls back to the generated verifier');
  const post=password=>get('/study/live/',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://ekodi.kr'},body:new URLSearchParams({password})},e);
  assert.equal((await post(chosen)).status,303);
  assert.equal((await post(PASSWORD)).status,401,'the generated password stops working once a chosen one is set');
  const wf=await readFile(new URL('../.github/workflows/deploy-education.yml',import.meta.url),'utf8');
  assert.equal((wf.match(/secret put EDU_INSTRUCTOR_GATE_SECRET/g)||[]).length,2,'production and staging');
  assert.match(wf,/EDU_INSTRUCTOR_PASSWORD: \$\{\{ secrets\.EDU_INSTRUCTOR_PASSWORD \}\}/);
  assert.doesNotMatch(wf,/echo[^\n]*\$EDU_INSTRUCTOR_PASSWORD/,'never echo the password');
  for(const f of ['wrangler.education.toml','wrangler.education.staging.toml'])assert.doesNotMatch(await readFile(new URL('../'+f,import.meta.url),'utf8'),/EDU_INSTRUCTOR_GATE_SECRET|EDU_INSTRUCTOR_PASSWORD/);
});

test('open mode (instructor decision): studio, presenter and notes open without a password; unset mode stays locked',async()=>{
  const open=env({EDU_INSTRUCTOR_GATE_MODE:'open'});
  for(const p of ['/study/live/?c=mnu-factchat-2026','/study/live/present/?c=mnu-factchat-2026','/study/live/courses/mnu-factchat-2026.notes.js']){
    const r=await get(p,{},open);assert.equal(r.status,200,p);assert.match(await r.text(),/ASSET/);
  }
  assert.equal((await get('/study/live/',{},env({EDU_INSTRUCTOR_GATE_MODE:'OPEN '}))).status,200);
  for(const m of ['','locked','opened','false'])assert.equal((await get('/study/live/',{},env({EDU_INSTRUCTOR_GATE_MODE:m}))).status,401,'mode '+JSON.stringify(m));
  for(const f of ['wrangler.education.toml','wrangler.education.staging.toml'])assert.match(await readFile(new URL('../'+f,import.meta.url),'utf8'),/EDU_INSTRUCTOR_GATE_MODE = "(open|locked)"/);
});

test('a configured instructor PIN locks even when the mode var says open',async()=>{
  const secret=await createVerifier('8542',{iterations:10000});
  const e=env({EDU_INSTRUCTOR_GATE_MODE:'open',EDU_INSTRUCTOR_GATE_SECRET:secret});
  assert.equal((await get('/study/live/',{},e)).status,401);
  const ok=await get('/study/live/',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://ekodi.kr'},body:new URLSearchParams({password:'8542'})},e);
  assert.equal(ok.status,303);
  const wrong=await get('/study/live/',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://ekodi.kr'},body:new URLSearchParams({password:'1234'})},e);
  assert.equal(wrong.status,401);
});
