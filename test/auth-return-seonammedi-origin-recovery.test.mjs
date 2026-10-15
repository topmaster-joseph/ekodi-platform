import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const client=read('auth-site/client-auth.js');
const my=read('my/app.js');
const entry=read('auth-site/auth-entry.js');
const seonammediReturn='https://seonammedi.kr/board/voices?compose=1';
const origins=['https://seonammedi.kr','https://www.seonammedi.kr',
 'https://xn--3e0b8b58jw4co4mnpll3k.kr','https://www.xn--3e0b8b58jw4co4mnpll3k.kr'];

function centralSafeReturn(raw){
 const start=client.indexOf('function safeReturn(raw){');
 const end=client.indexOf('const RETURN_TO=',start);
 assert.ok(start>=0&&end>start,'central live safeReturn function must be present');
 const source=client.slice(start,end);
 return runInNewContext(source+'\nsafeReturn(raw)',{
  raw,URL,DIRECT_LOGIN:true,
  config:{kind:'seonammedi',returnTo:'https://seonammedi.kr/',origins}
 });
}

function myRecovery(returnTo){
 const originsDeclaration=my.match(/^const SEONAMMEDI_RETURN_ORIGINS=.*$/m)?.[0];
 assert.ok(originsDeclaration,'explicit trusted customer origins must be available');
 const start=my.indexOf('function misroutedServiceReturn(){');
 const end=my.indexOf('const MISROUTED_SERVICE_RETURN=',start);
 assert.ok(start>=0&&end>start);
 const script=originsDeclaration+'\n'+my.slice(start,end)+'\nmisroutedServiceReturn()';
 const query='?return_to='+encodeURIComponent(returnTo);
 const result=runInNewContext(script,{
  URL,URLSearchParams,
  location:{search:query,hash:'#ekodi_token=once-only-code&ekodi_type=email'}
 });
 return result?.href||null;
}

test('registered SeonamMedi origins and canonical mount preserve exact login-starting page',()=>{
 for(const url of [
  seonammediReturn,
  'https://www.seonammedi.kr/board/voices?compose=1&id=4',
  'https://ekodi.kr/seonammedi/board/voices?compose=1',
  'https://xn--3e0b8b58jw4co4mnpll3k.kr/board/voices?compose=1'
 ])assert.equal(centralSafeReturn(url),url);
});

test('SeonamMedi identity cannot send a caller to My EKODI, other services or untrusted domains',()=>{
 for(const url of [
  'https://ekodi.kr/my/',
  'https://ekodi.kr/ekodimall/',
  'https://ekodi.kr/admin/',
  'https://phishing.invalid/board/voices?compose=1',
  'http://seonammedi.kr/board/voices',
  'https://user:password@seonammedi.kr/board/voices'
 ])assert.equal(centralSafeReturn(url),'https://seonammedi.kr/','reject '+url);
});

test('My EKODI immediately returns misrouted single-use token to SeonamMedi without consuming it',()=>{
 const actual=myRecovery(seonammediReturn);
 assert.equal(actual,seonammediReturn+'#ekodi_token=once-only-code&ekodi_type=email');
 assert.equal(myRecovery('https://evil.invalid/board/voices'),null);
 assert.equal(myRecovery('https://ekodi.kr/my/'),null);
 assert.ok(my.indexOf('if(MISROUTED_SERVICE_RETURN)')<my.indexOf('try{await handoff()}'));
});

test('auth loop guard cancellation preserves customer destination and never uses My as generic fallback',()=>{
 assert.match(entry,/const customerOrigin = \(site === 'seonammedi' \|\| site === 'portal'\)/);
 assert.match(entry,/const foreignMy = site !== 'my' && site !== 'portal'/);
 assert.match(entry,/if \(!target && site === 'seonammedi'\) target = 'https:\/\/seonammedi.kr\/board\/voices'/);
 assert.doesNotMatch(entry,/let target = 'https:\/\/ekodi.kr\/'/);
});
