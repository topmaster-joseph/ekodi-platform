import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

async function liveSource(){return read('live/live.js')}

function extractFunction(source,name,nextName){
  const start=source.indexOf(`function ${name}`);
  const end=source.indexOf(`function ${nextName}`,start);
  assert.notEqual(start,-1,`${name} must exist`);
  assert.notEqual(end,-1,`${nextName} must follow ${name}`);
  return source.slice(start,end).trim();
}

test('live auth return target strips one-time auth fragments without losing studio intent',async()=>{
  const source=await liveSource();
  const fnSource=extractFunction(source,'safeReturnTo','login');
  const sandbox={
    URL,
    URLSearchParams,
    location:{href:'https://ekodi.kr/ekodichurch/live/?mode=studio#ekodi_token=once&ekodi_type=email'}
  };
  const safeReturnTo=vm.runInNewContext(`(${fnSource})`,sandbox);
  assert.equal(safeReturnTo(),'https://ekodi.kr/ekodichurch/live/?mode=studio');

  sandbox.location.href='https://ekodi.kr/ekodichurch/live/?mode=studio#agenda';
  assert.equal(safeReturnTo(),'https://ekodi.kr/ekodichurch/live/?mode=studio#agenda');
});

test('live auth consumes handoff URL before OTP verification can fail',async()=>{
  const source=await liveSource();
  const start=source.indexOf('async function bootstrapCentralAuth');
  const end=source.indexOf('async function waitIce',start);
  assert.notEqual(start,-1);
  assert.notEqual(end,-1);
  const bootstrap=source.slice(start,end);
  const cleanIndex=bootstrap.indexOf("history.replaceState(null,'',location.pathname+location.search)");
  const verifyIndex=bootstrap.indexOf('/auth/v1/verify');
  assert.ok(cleanIndex>=0,'handoff URL must be cleared');
  assert.ok(verifyIndex>=0,'REST OTP verification must still run');
  assert.ok(cleanIndex<verifyIndex,'handoff URL must be cleared before OTP verification');
  assert.match(bootstrap,/sessionStorage\.removeItem\(AUTH_ATTEMPT_KEY\)/,'successful auth must clear the redirect guard');
  assert.doesNotMatch(source,/cdn\.jsdelivr\.net|esm\.sh/,'Live auth must not depend on a third-party script CDN');
});

test('central login redirect always uses the sanitized return target',async()=>{
  const source=await liveSource();
  assert.match(source,/return_to=\$\{encodeURIComponent\(safeReturnTo\(studio\)\)\}/);
  assert.doesNotMatch(source,/const back=location\.href;location\.href=`https:\/\/ekodi\.kr\/auth/);
});

test('studio entry prepares local media without forcing an authenticated room or login redirect',async()=>{
  const source=await liveSource();
  const init=source.slice(source.lastIndexOf('void bootstrapCentralAuth()'));
  assert.match(init,/setupParams\.get\('mode'\)==='studio'/);
  assert.match(init,/await prepareStudio\(\)/);
  assert.doesNotMatch(init,/setupParams\.get\('mode'\)==='studio'\)startHost\(\)/);
  assert.match(source,/\$\('goLiveButton'\)\.addEventListener\('click',startBroadcast\)/);
});

test('broadcast start preserves one explicit intent across login and does not erase studio mode',async()=>{
  const source=await liveSource();
  const loginSource=extractFunction(source,'login','liveTitle');
  const start=source.indexOf('async function startBroadcast');
  const end=source.indexOf('async function endLive',start);
  const startBroadcast=source.slice(start,end);
  assert.doesNotMatch(loginSource,/searchParams\.delete\('mode'\)/,'login guard must not erase studio intent');
  assert.match(startBroadcast,/sessionStorage\.setItem\(PENDING_START_KEY,'1'\)/);
  assert.match(startBroadcast,/if\(!token\(\)\)/);
  assert.match(startBroadcast,/login\(true\)/);
  assert.match(source,/authenticated&&sessionStorage\.getItem\(PENDING_START_KEY\)==='1'/,'successful auth return should resume the single pending start');
});

test('live auth bootstrap accepts an existing same-tab EKODI token so login return can resume broadcast',async()=>{
  const source=await liveSource();
  const start=source.indexOf('async function bootstrapCentralAuth');
  const end=source.indexOf('async function refreshAuthToken',start);
  assert.notEqual(start,-1);
  assert.notEqual(end,-1);
  const bootstrap=source.slice(start,end);
  assert.match(bootstrap,/if\(token\(\)\)\{sessionStorage\.removeItem\(AUTH_ATTEMPT_KEY\);return true\}/,'an already-established same-tab token must count as an authenticated return');
});


test('failed one-time handoff falls back to the persisted same-origin EKODI session instead of stopping the broadcast start',async()=>{
  const source=await liveSource();
  const start=source.indexOf('async function bootstrapCentralAuth');
  const end=source.indexOf('async function refreshAuthToken',start);
  const bootstrap=source.slice(start,end);
  const verifyIndex=bootstrap.indexOf('/auth/v1/verify');
  const fallbackIndex=bootstrap.indexOf('const stored=storedSupabaseSession()',verifyIndex);
  assert.ok(verifyIndex>=0);
  assert.ok(fallbackIndex>verifyIndex,'persisted EKODI session fallback must run after a failed one-time handoff');
  assert.match(bootstrap,/\[EKODI Live auth handoff\]/);
  assert.match(bootstrap,/stored\?\.refresh_token&&await refreshAuthToken\(\)/);
});
