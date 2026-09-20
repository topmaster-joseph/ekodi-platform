import test from 'node:test';
import assert from 'node:assert/strict';

test('release verification bypasses stale Shell bundle cache and refreshes the canonical cache entry',async()=>{
  const {default:worker}=await import('../ekodi-shell-worker.js');
  const priorCaches=globalThis.caches;
  let matchCalls=0;
  let putCalls=0;
  let storedBody='';
  const pending=[];
  globalThis.caches={default:{
    match:async()=>{matchCalls+=1;return new Response('stale-shell');},
    put:async(_request,response)=>{putCalls+=1;storedBody=await response.text();},
  }};
  try{
    const env={ASSETS:{fetch:async request=>{
      const path=new URL(request.url).pathname;
      if(path==='/shell.js')return new Response('window.shellCore=true;',{status:200});
      if(path==='/user-language.js')return new Response("const I18N_API='https://ekodi.kr/api/i18n/v1';",{status:200});
      if(path==='/media-meeting-adapter.js')return new Response("const RESOLVER_DEFAULT='https://social.ekodi.kr/api/media/youtube/status';",{status:200});
      return new Response(`// ${path}`,{status:200});
    }}};
    const response=await worker.fetch(new Request('https://ekodi-shell.internal/shell.js?release=abc123&attempt=1'),env,{waitUntil(promise){pending.push(promise);}});
    const body=await response.text();
    await Promise.all(pending);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-ekodi-shell-bundle-cache'),'refresh');
    assert.equal(matchCalls,0,'release verification must not serve a stale cached bundle');
    assert.equal(putCalls,1,'fresh release bundle must replace the canonical cache entry');
    assert.match(body,/https:\/\/ekodi\.kr\/api\/i18n\/v1/);
    assert.match(body,/https:\/\/ekodi\.kr\/social\/api\/media\/youtube\/status/);
    assert.match(storedBody,/https:\/\/ekodi\.kr\/api\/i18n\/v1/);
    assert.match(storedBody,/https:\/\/ekodi\.kr\/social\/api\/media\/youtube\/status/);
    assert.doesNotMatch(body,/https:\/\/api\.ekodi\.kr\/api\/i18n\/v1/);
    assert.doesNotMatch(body,/https:\/\/social\.ekodi\.kr\/api\/media\/youtube\/status/);
    assert.doesNotMatch(storedBody,/https:\/\/api\.ekodi\.kr\/api\/i18n\/v1/);
    assert.doesNotMatch(storedBody,/https:\/\/social\.ekodi\.kr\/api\/media\/youtube\/status/);
  } finally {
    if(priorCaches===undefined)delete globalThis.caches;else globalThis.caches=priorCaches;
  }
});
