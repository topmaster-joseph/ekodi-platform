import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Node has no Cloudflare HTMLRewriter; a pass-through keeps the Shell injection step inert in this contract test.
globalThis.HTMLRewriter??=class{on(){return this;}onDocument(){return this;}transform(response){return response;}};
const {default:worker}=await import('../education-worker.js');
import { createVerifier, verifyPassword, mintGateToken, verifyGateToken, isGatedPath, parseVerifier, GATE_COOKIE, activeVerifier, unlockReturn } from '../education-instructor-gate.js';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const PASSWORD='test-only-pass-7k2m-9qxz';
const KEY='k'.repeat(48);
const VERIFIER=await createVerifier(PASSWORD,{iterations:10000});
const ASSETS={fetch:async request=>{const p=new URL(request.url).pathname;return new Response('<!doctype html><html><head></head><body>ASSET '+p+'</body></html>',{status:200,headers:{'content-type':p.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'}});}};
const env=(extra={})=>({ASSETS,EDU_INSTRUCTOR_GATE:VERIFIER,EDU_GATE_SIGNING_KEY:KEY,...extra});
const get=(path,init={},e=env())=>worker.fetch(new Request('https://ekodi.kr'+path,init),e);
const NOTES='/study/live/courses/mnu-factchat-2026.notes.js';
const UNLOCK='/study/live/unlock/?c=mnu-factchat-2026&back=present';
const login=(password,headers={})=>get(UNLOCK,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://ekodi.kr',...headers},body:new URLSearchParams({password})});

test('only the instructor notes (and their unlock page) are gated; studio, presenter and lab stay open',()=>{
  for(const p of [NOTES,'/study/live/unlock','/study/live/unlock/','/study/live/unlock/index.html'])assert.ok(isGatedPath(p),p);
  for(const p of ['/study/live','/study/live/','/study/live/index.html','/study/live/instructor.js','/study/live/present/','/study/live/present/index.html','/study/live/present.js','/study/live/lab/','/study/live/lab.js','/study/live/live.css','/study/live/engine/render.js','/study/live/courses/mnu-factchat-2026.js','/study/live/courses/registry.js','/study/live/entry.js','/factchat/','/study/'])assert.ok(!isGatedPath(p),p);
  const u=s=>unlockReturn(new URL('https://ekodi.kr'+s));
  assert.equal(u('/study/live/unlock/?c=mnu-factchat-2026&back=present'),'../present/?c=mnu-factchat-2026');
  assert.equal(u('/study/live/unlock/?c=mnu-factchat-2026'),'../?c=mnu-factchat-2026');
  assert.equal(u('/study/live/unlock?back=https://evil.example'),'./','back only selects studio/presenter; never an external target');
  assert.equal(u('/study/live/unlock/?c=a%22%3E%3Cx&back=present'),'../present/?c=ax');
});

test('without the password: studio and presenter open, notes refused, unlock page asks for the password',async()=>{
  for(const p of ['/study/live/?c=mnu-factchat-2026','/study/live/present/?c=mnu-factchat-2026','/study/live/instructor.js','/study/live/present.js']){
    const r=await get(p);assert.equal(r.status,200,p);assert.match(await r.text(),/ASSET/,p);
  }
  const notes=await get(NOTES);assert.equal(notes.status,401);assert.doesNotMatch(await notes.text(),/ASSET/);
  const page=await get(UNLOCK);
  assert.equal(page.status,401);
  assert.match(page.headers.get('cache-control'),/no-store/);
  const html=await page.text();
  assert.match(html,/type="password"/);assert.match(html,/강사 노트 열기/);assert.doesNotMatch(html,/ASSET/);
  assert.match(html,/href="\.\.\/present\/\?c=mnu-factchat-2026"/,'a way back to the presenter without the notes');
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
  assert.equal(ok.headers.get('location'),'../present/?c=mnu-factchat-2026');
  const cookie=ok.headers.get('set-cookie');
  assert.match(cookie,new RegExp('^'+GATE_COOKIE+'=v1\\.'));
  assert.match(cookie,/Path=\/edu\/study\/live;/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
  const token=cookie.split(';')[0];
  const r=await get(NOTES,{headers:{cookie:token}});
  assert.equal(r.status,200);assert.match(await r.text(),/ASSET/);assert.match(r.headers.get('cache-control'),/private, no-store/);
  const again=await get(UNLOCK,{headers:{cookie:token}});
  assert.equal(again.status,303,'already unlocked: straight back');assert.equal(again.headers.get('location'),'../present/?c=mnu-factchat-2026');
  const out=await get('/study/live/unlock/?c=mnu-factchat-2026&gate=logout',{headers:{cookie:token}});
  assert.equal(out.status,303);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);assert.equal(out.headers.get('location'),'../?c=mnu-factchat-2026');
});

test('fails closed without a verifier or signing key, and rejects forged or expired tokens',async()=>{
  for(const e of [env({EDU_INSTRUCTOR_GATE:''}),env({EDU_GATE_SIGNING_KEY:''}),env({EDU_GATE_SIGNING_KEY:'short'})]){
    const r=await get(UNLOCK,{},e);assert.equal(r.status,503);const html=await r.text();assert.doesNotMatch(html,/ASSET/);assert.doesNotMatch(html,/type="password"/);
    const notes=await get(NOTES,{},e);assert.equal(notes.status,503);
  }
  const now=Date.now();
  const t=await mintGateToken(KEY,{now});
  assert.ok(await verifyGateToken(t,KEY,{now}));
  assert.ok(!(await verifyGateToken(t,'x'.repeat(48),{now})),'other key');
  assert.ok(!(await verifyGateToken(t,KEY,{now:now+13*3600*1000})),'expired');
  const sig=t.split('.')[2];
  for(const i of [0,20,42]){const c=sig[i]==='A'?'B':'A';assert.ok(!(await verifyGateToken(t.slice(0,t.length-43)+sig.slice(0,i)+c+sig.slice(i+1),KEY,{now})),'tampered at '+i);}
  assert.ok(!(await verifyGateToken('v1.9999999999.'+t.split('.')[2],KEY,{now})),'far-future exp');
  const forged=await get(NOTES,{headers:{cookie:GATE_COOKIE+'=v1.1999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'}});
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
  const routed=await routeCanonicalSurface(new Request('https://ekodi.kr/edu/study/live/unlock/?c=mnu-factchat-2026'),{EDUCATION:{fetch:request=>worker.fetch(request,env())}});
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
  const post=password=>get(UNLOCK,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://ekodi.kr'},body:new URLSearchParams({password})},e);
  assert.equal((await post(chosen)).status,303);
  assert.equal((await post(PASSWORD)).status,401,'the generated password stops working once a chosen one is set');
  const wf=await readFile(new URL('../.github/workflows/deploy-education.yml',import.meta.url),'utf8');
  assert.equal((wf.match(/secret put EDU_INSTRUCTOR_GATE_SECRET/g)||[]).length,2,'production and staging');
  assert.match(wf,/EDU_INSTRUCTOR_PASSWORD: \$\{\{ secrets\.EDU_INSTRUCTOR_PASSWORD \}\}/);
  assert.doesNotMatch(wf,/echo[^\n]*\$EDU_INSTRUCTOR_PASSWORD/,'never echo the password');
  for(const f of ['wrangler.education.toml','wrangler.education.staging.toml'])assert.doesNotMatch(await readFile(new URL('../'+f,import.meta.url),'utf8'),/EDU_INSTRUCTOR_GATE_SECRET|EDU_INSTRUCTOR_PASSWORD/);
});

test('open mode without a chosen password: notes open too and the unlock page just returns; unset mode keeps notes locked',async()=>{
  const open=env({EDU_INSTRUCTOR_GATE_MODE:'open'});
  const r=await get(NOTES,{},open);assert.equal(r.status,200);assert.match(await r.text(),/ASSET/);
  const u=await get(UNLOCK,{},open);assert.equal(u.status,303);assert.equal(u.headers.get('location'),'../present/?c=mnu-factchat-2026');
  assert.equal((await get(NOTES,{},env({EDU_INSTRUCTOR_GATE_MODE:'OPEN '}))).status,200);
  for(const m of ['','locked','opened','false'])assert.equal((await get(NOTES,{},env({EDU_INSTRUCTOR_GATE_MODE:m}))).status,401,'mode '+JSON.stringify(m));
  for(const f of ['wrangler.education.toml','wrangler.education.staging.toml'])assert.match(await readFile(new URL('../'+f,import.meta.url),'utf8'),/EDU_INSTRUCTOR_GATE_MODE = "(open|locked)"/);
});

test('a configured instructor PIN locks the notes even when the mode var says open; the studio stays open',async()=>{
  const secret=await createVerifier('8542',{iterations:10000});
  const e=env({EDU_INSTRUCTOR_GATE_MODE:'open',EDU_INSTRUCTOR_GATE_SECRET:secret});
  assert.equal((await get(NOTES,{},e)).status,401);
  assert.equal((await get('/study/live/?c=mnu-factchat-2026',{},e)).status,200);
  const ok=await get(UNLOCK,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://ekodi.kr'},body:new URLSearchParams({password:'8542'})},e);
  assert.equal(ok.status,303);
  const wrong=await get(UNLOCK,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://ekodi.kr'},body:new URLSearchParams({password:'1234'})},e);
  assert.equal(wrong.status,401);
});

// 2026-10-27: instructors open the notes with their EKODI account (any login path).
async function ekodiUnlock(identities,{status=200,e=env(),origin='https://ekodi.kr'}={}){
  const oldFetch=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),init});return new Response(JSON.stringify(identities),{status});};
  try{
    const res=await get(UNLOCK,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({accessToken:'user-session-token'})},e);
    return {res,body:await res.json().catch(()=>null),calls};
  }finally{globalThis.fetch=oldFetch}
}

test('a registered instructor EKODI account (any login path) unlocks the notes',async()=>{
  const {res,body,calls}=await ekodiUnlock({person:{ekodiId:'EK1',verifiedEmails:['joseph@ekodi.kr']},identities:[{provider:'kakao',is_current:true}]});
  assert.equal(res.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.location,'../present/?c=mnu-factchat-2026');
  const cookie=res.headers.get('set-cookie')||'';
  assert.match(cookie,new RegExp('^'+GATE_COOKIE+'='));
  assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
  const token=cookie.split(';')[0].split('=')[1];
  assert.equal(await verifyGateToken(token,KEY),true);
  assert.equal(calls[0].url,'https://renzehysxirjilvdxacv.supabase.co/functions/v1/identity-api/identities');
  assert.equal(calls[0].init.headers.authorization,'Bearer user-session-token');
});

test('EKODI accounts outside the instructor list, failed lookups and foreign origins never unlock',async()=>{
  for(const [identities,status] of [[{person:{verifiedEmails:['someone@example.com']}},200],[{person:{verifiedEmails:[]}},200],[{error:'unauthorized'},401]]){
    const {res,body}=await ekodiUnlock(identities,{status});
    assert.equal(res.status,403);assert.equal(body.ok,false);
    assert.equal(res.headers.get('set-cookie'),null);
  }
  const custom=await ekodiUnlock({person:{verifiedEmails:['teacher@school.kr']}},{e:env({EDU_INSTRUCTOR_EMAILS:'teacher@school.kr'})});
  assert.equal(custom.res.status,200,'instructor list is configurable');
  const foreign=await ekodiUnlock({person:{verifiedEmails:['joseph@ekodi.kr']}},{origin:'https://evil.example'});
  assert.equal(foreign.res.status,403);
  assert.equal(foreign.res.headers.get('set-cookie'),null);
});

test('unlock page offers the EKODI account first and keeps the password only as a folded fallback',async()=>{
  const html=await (await get(UNLOCK)).text();
  assert.match(html,/id="gateEkodi"/);
  assert.match(html,/<script src="\/study\/live\/gate-ekodi\.js" defer><\/script>/);
  assert.match(html,/<details class="gate-legacy">/);
  assert.ok(html.indexOf('gateEkodi')<html.indexOf('gatePassword'));
});
