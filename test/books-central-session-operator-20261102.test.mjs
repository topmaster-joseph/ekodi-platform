import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const client = readFileSync(new URL('../books/buy/commerce-client.js', import.meta.url),'utf8');
const commerce = readFileSync(new URL('../books-commerce.js', import.meta.url),'utf8');
const reader = readFileSync(new URL('../books/buy/library.js', import.meta.url),'utf8');
const panels = readFileSync(new URL('../books/buy/library-tabs.js', import.meta.url),'utf8');
const voice = readFileSync(new URL('../books/buy/voice-studio.js', import.meta.url),'utf8');
const CENTRAL = 'sb-renzehysxirjilvdxacv-auth-token', OWN = 'ekodi-books-buyer-session';

function fixture({central=null,own=null,response=null}={}) {
  const values = new Map();
  if(central)values.set(CENTRAL,JSON.stringify(central));
  if(own)values.set(OWN,JSON.stringify(own));
  const localStorage={
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
  };
  const fetchCalls=[];
  const context={
    window:{},location:{pathname:'/books/library/',href:'https://ekodi.kr/books/library/'},
    localStorage,console,AbortController,setTimeout,clearTimeout,URL,
    fetch:async (url,opts={})=>{
      fetchCalls.push({url,method:opts.method||'GET'});
      if(response)return response(url,opts);
      return new Response(JSON.stringify({}),{status:500,headers:{'content-type':'application/json'}});
    },
  };
  vm.runInNewContext(client,context);
  return {commerce:context.window.EkodiBooksCommerce,values,fetchCalls};
}
const valid=(token)=>({access_token:token,refresh_token:token+'-refresh',expires_at:Math.floor(Date.now()/1000)+3600});
const legacy=(token)=>({accessToken:token,refreshToken:token+'-refresh',expiresAt:Math.floor(Date.now()/1000)+3600});
test('central Google login takes precedence over old book-local Kakao session',async()=>{
  const testSession=fixture({
    own:legacy('old-kakao-session'),
    central:{currentSession:valid('verified-google-session')},
  });
  const current=await testSession.commerce.session();
  assert.equal(current.accessToken,'verified-google-session');
  assert.equal(current.source,'central');
});
test('legacy bookstore login works only when no central session exists',async()=>{
  const state=fixture({own:legacy('book-only-legacy')});
  assert.equal((await state.commerce.session()).accessToken,'book-only-legacy');
  assert.equal((await state.commerce.session()).source,'legacy');
});
test('expired central session refreshes central storage without reviving old bookstore token',async()=>{
  const central={currentSession:{...valid('old-central'),expires_at:1,user:{id:'test-only-user'}}};
  const data=fixture({
    central,own:legacy('stale-kakao'),
    response:async(url,opts)=>new Response(JSON.stringify({...valid('new-central')}),{
      status:200,headers:{'content-type':'application/json'}
    }),
  });
  const current=await data.commerce.session();
  assert.equal(current.accessToken,'new-central');
  assert.equal(current.source,'central');
  assert.equal(JSON.parse(data.values.get(CENTRAL)).currentSession.access_token,'new-central');
  assert.equal(JSON.parse(data.values.get(CENTRAL)).currentSession.user.id,'test-only-user');
  assert.equal(data.values.has(OWN),false);
});
test('invalid central refresh never silently reselects an old different identity',async()=>{
  const data=fixture({
    central:{currentSession:{...valid('expired-primary'),expires_at:1}},
    own:legacy('old-different-person'),
    response:async()=>new Response('{"error":"invalid_grant"}',{status:400,headers:{'content-type':'application/json'}}),
  });
  assert.equal(await data.commerce.session(),null);
  assert.equal(data.values.has(OWN),false);
  assert.equal(data.values.has(CENTRAL),false);
});
test('server owns bookstore operator authorization: verified account email only',()=>{
  assert.match(commerce,/operator: operatorEmails\(env\)\.has\(buyer\.email\)/);
  assert.match(commerce,/if \(!buyer \|\| !operatorEmails\(env\)\.has\(buyer\.email\)\) return \{ status: 403/);
  assert.match(reader,/data\.operator === true/);
  assert.match(reader,/window\.EkodiLibraryTabs\?\.render\(items,libraryAccount,data\.operator === true\)/);
  assert.match(panels,/library-operator-status/);
  assert.match(panels,/operatorAuthorized \? '에코디서점 운영자 권한: 서버 확인 완료'/);
  assert.match(voice,/error\.status === 401 \|\| error\.status === 403/);
  assert.match(voice,/비공개 보관함 연결을 점검해 주세요/);
  assert.doesNotMatch(commerce,/user_metadata.*operator/);
});
