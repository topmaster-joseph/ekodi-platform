import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const qtin=source('qtin-order-worker.js');
const admin=source('sites/seonammedi/public/admin/admin.js');
const minutes=source('sites/seonammedi/public/admin/admin-minutes.js');
const calendar=source('sites/seonammedi/public/calendar-sidebar.js');
const publicSite=source('sites/seonammedi/public/app.js');
const KEY='sb-renzehysxirjilvdxacv-auth-token';
const expiry=()=>Math.floor(Date.now()/1000)+3600;
const central=(token,expires=expiry())=>JSON.stringify({currentSession:{access_token:token,refresh_token:token+'-refresh',expires_at:expires}});
function storage(seed={}){const values=new Map(Object.entries(seed));return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),values};}
function section(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a);assert.ok(a>=0&&b>a,start);return s.slice(a,b);}
function qtinFixture({main=null,oldBuyer=null,oldAdmin=null,signedOut=false}={}){
 const localStorage=storage({...main?{[KEY]:main}:{},...oldBuyer?{'ekodi-qtin-buyer-session':JSON.stringify(oldBuyer)}:{},...signedOut?{'ekodi-qtin-signed-out':'1'}:{}});
 const sessionStorage=storage(oldAdmin?{'ekodi-qtin-admin-session':JSON.stringify(oldAdmin)}:{});
 const impl=section(qtin,'  function read(store, key) {','  // ---- Google sign-in');
 const declarations="const BUYER_KEY='ekodi-qtin-buyer-session',CENTRAL_KEY='sb-renzehysxirjilvdxacv-auth-token',SIGNED_OUT_KEY='ekodi-qtin-signed-out';let session=null;";
 const result=runInNewContext('(function(){'+declarations+impl+'return {stored,validSession,saveCentralSession,forget};})()',{
   localStorage,sessionStorage,Date,Math,JSON,AbortController,setTimeout,clearTimeout,
   fetch:async()=>{throw Error('offline')},SUPABASE_URL:'https://test.invalid',SUPABASE_KEY:'public-test'
 });
 return {...result,localStorage,sessionStorage};
}
test('QTIN picks central Google ahead of older Kakao buyer and site admin',()=>{
 const f=qtinFixture({main:central('new-google'),oldBuyer:{accessToken:'kakao-old'},oldAdmin:{accessToken:'site-admin-old'}});
 assert.equal(f.stored().accessToken,'new-google');
 assert.equal(f.stored().source,'central');
});
test('QTIN logout stays local until explicit sign in, without deleting central login',()=>{
 const f=qtinFixture({main:central('current'),signedOut:true});
 assert.equal(f.stored(),null);
 assert.ok(f.localStorage.getItem(KEY));
 f.saveCentralSession({accessToken:'explicit-new',refreshToken:'new-refresh',expiresAt:expiry()});
 assert.equal(f.stored().accessToken,'explicit-new');
 assert.equal(f.localStorage.getItem('ekodi-qtin-signed-out'),null);
});
test('QTIN expired central session does not regress to previous user',async()=>{
 const f=qtinFixture({main:central('expired',1),oldBuyer:{accessToken:'old-buyer',expiresAt:expiry()}});
 assert.equal(await f.validSession(),null);
 assert.ok(f.localStorage.getItem(KEY));
 assert.equal(qtinFixture({oldBuyer:{accessToken:'legacy',expiresAt:expiry()}}).stored().source,'legacy');
});
async function seonamToken(main,hash=''){
 const code=section(admin,'async function token(){','\nasync function api(');
 const localStorage=storage(main?{[KEY]:main}:{});
 const sessionStorage=storage({'ekodi-auth-token':'old-platform'});
 return runInNewContext('(async()=>{'+code+'return await token()})()',{
  localStorage,sessionStorage,location:{hash},Date,Math,JSON,
  centralSessionToken:()=>{if(!main)return '';const x=JSON.parse(main).currentSession;return x.expires_at>Math.floor(Date.now()/1000)+30?x.access_token:'';},
  userToken:async()=>'explicit-handoff'
 });
}
test('Seonam admin prioritizes current central identity, except fresh auth handoff',async()=>{
 assert.equal(await seonamToken(central('new-google')),'new-google');
 assert.equal(await seonamToken(central('expired',1)),'');
 assert.equal(await seonamToken(null),'old-platform');
 assert.equal(await seonamToken(central('old'), '#ekodi_token=proof'),'explicit-handoff');
});
function tokenEval(code,method,main){
 const localStorage=storage(main?{[KEY]:main}:{});
 const sessionStorage=storage({'ekodi-auth-token':'old-platform','ekodi-seonam-admin-session':JSON.stringify({accessToken:'old-site',expiresAt:expiry()})});
 return runInNewContext('(function(){'+code+'return '+method+'()})()',{
  localStorage,sessionStorage,Date,Math,JSON,CENTRAL_SESSION_KEY:KEY,
  PLATFORM_TOKEN_KEY:'ekodi-auth-token',SESSION_KEY:'ekodi-seonam-admin-session'
 });
}
test('Seonam minutes and calendar use same account and never fall back on expired central token',()=>{
 const parts=[
  [section(minutes,'function sessionToken(){','\nconst authHeaders='),'sessionToken'],
  [section(calendar,'  function authToken(){','\n  function mount('),'authToken']
 ];
 for(const [code,name] of parts){
  assert.equal(tokenEval(code,name,central('new-google')),'new-google');
  assert.equal(tokenEval(code,name,central('expired',1)),'');
  assert.equal(tokenEval(code,name,null),'old-platform');
 }
});
test('Seonam public notices and inline administrator prefer the central user',()=>{
 const notice=section(publicSite,'function noticeToken(){','\nfunction noticeSession(){');
 const panel=section(publicSite,'function publicAdminToken(){','\nfunction sharedPublicAdmin(){');
 assert.ok(notice.indexOf('localStorage.getItem')<notice.indexOf('sessionStorage.getItem'));
 assert.ok(panel.indexOf('noticeToken()')<panel.indexOf('sessionStorage.getItem'));
});
test('server authority is still required',()=>{
 assert.match(qtin,/if \(r\.status === 401\)/);
 assert.match(admin,/state\.me=await api\('\/api\/seonammedi\/admin\/me'\)/);
});
