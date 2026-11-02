import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const mission=src('space/ekodimission-presence.js');
const voice=src('sites/seonammedi/public/voice-public-admin.js');
const notices=src('sites/seonammedi/public/notices/index.html');
const centralKey='sb-renzehysxirjilvdxacv-auth-token';
const valid=token=>JSON.stringify({currentSession:{access_token:token,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:token+'-refresh'}});
const expired=token=>JSON.stringify({currentSession:{access_token:token,expires_at:1,refresh_token:token+'-refresh'}});
function store(values={}){const data=new Map(Object.entries(values));return {getItem:key=>data.get(key)||null,setItem:(key,v)=>data.set(key,String(v)),removeItem:key=>data.delete(key),values:data};}
function section(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a);assert.ok(a>=0&&b>a,start);return s.slice(a,b);}

test('mission attendance uses current central user before old mission member/pastor token',()=>{
  const code=section(mission,'const CENTRAL_AUTH_KEY=','function tokenValue(');
  const localStorage=store({
    [centralKey]:valid('current-google'),
    'ekodimission-member-session-v1':JSON.stringify({accessToken:'old-kakao'}),
    'ekodimission-pastor-session':JSON.stringify({accessToken:'old-pastor'})
  });
  const sessionStorage=store();
  const current=runInNewContext('(function(){'+code+'return {sessionFromStorage,saveCentralSession};})()',{localStorage,sessionStorage,Date,Math,JSON});
  assert.equal(current.sessionFromStorage().access_token,'current-google');
  assert.equal(current.sessionFromStorage().source,'central');
  current.saveCentralSession({access_token:'new-google',refresh_token:'refresh',expires_at:9999999999,user:{email:'owner@example.test'}},
    {access_token:'new-google',refresh_token:'refresh',expires_at:9999999999,user:{email:'owner@example.test'}});
  assert.equal(current.sessionFromStorage().user.email,'owner@example.test');
  assert.equal(localStorage.getItem('ekodimission-member-session-v1'),null);
  assert.equal(localStorage.getItem('ekodimission-pastor-session'),null);
});
test('mission legacy fallback remains available without central session',()=>{
  const code=section(mission,'const CENTRAL_AUTH_KEY=','function tokenValue(');
  const localStorage=store({'ekodimission-member-session-v1':JSON.stringify({accessToken:'legacy'})});
  const old=runInNewContext('(function(){'+code+'return sessionFromStorage();})()',{localStorage,sessionStorage:store(),Date,Math,JSON});
  assert.equal(old.accessToken,'legacy');
  assert.equal(old.source,'legacy');
});
test('Seonam voice moderation never uses old admin token while central login is present',()=>{
  const code=section(voice,'function token(){','\nasync function adminRequest(');
  const run=main=>runInNewContext('(function(){'+code+'return token()})()',{
    localStorage:store(main?{[centralKey]:main}:{}),
    sessionStorage:store({'ekodi-auth-token':'old-admin'}),
    SESSION_KEY:centralKey,Date,Math,JSON
  });
  assert.equal(run(valid('current-google')),'current-google');
  assert.equal(run(expired('central-expired')),'');
  assert.equal(run(null),'old-admin');
});
test('Seonam notices composer prioritizes central login with expiry check',()=>{
  const code=section(notices,'const token=()=>','\nconst authUrl=');
  const run=main=>runInNewContext('(function(){'+code+'return token()})()',{
    localStorage:store(main?{[centralKey]:main}:{}),
    sessionStorage:store({'ekodi-auth-token':'old-admin'}),Date,Math,JSON
  });
  assert.equal(run(valid('new-google')),'new-google');
  assert.equal(run(expired('expired')),'');
  assert.equal(run(null),'old-admin');
});
test('mission and Seonam server permission checks remain authoritative',()=>{
  assert.match(mission,/response\.status===403/);
  assert.match(voice,/if\(response\.status===401\|\|response\.status===403\)clearVoiceAdmin\(\)/);
});
