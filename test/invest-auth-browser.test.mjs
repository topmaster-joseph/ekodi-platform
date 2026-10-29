import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {INVEST_MEMBER_SESSION_BROWSER_SOURCE} from '../invest-auth-browser.js';
import {investAnalysisScript} from '../invest-access-ui.js';
import {investMyRoute} from '../invest-my-workspace.js';

const NOW=Date.UTC(2026,9,29,0,0,0);
function readToken(entries,now=NOW){
 const keys=Object.keys(entries);
 const localStorage={
  get length(){return keys.length},
  key:i=>keys[i]||null,
  getItem:k=>entries[k]??null,
 };
 const context={localStorage,Date:{now:()=>now},JSON,Number,String};
 return vm.runInNewContext(INVEST_MEMBER_SESSION_BROWSER_SOURCE+'\nreadEkodiMemberToken()',context);
}
const authKey='sb-renzehysxirjilvdxacv-auth-token';
const validSession={access_token:'valid-oauth-token',user:{id:'oauth-subject-1'},expires_at:Math.floor(NOW/1000)+3600};
const saved=session=>JSON.stringify(session);
test('common Invest follows the real EKODI Supabase auth storage key, not an orphan custom key',()=>{
 assert.equal(readToken({[authKey]:saved(validSession)}),'valid-oauth-token');
 assert.equal(readToken({'ekodi_platform_session_v1':saved(validSession)}),'');
 assert.equal(readToken({'random-auth-token':saved(validSession)}),'');
});
test('Supabase auth storage supports persisted wrapped sessions and numbered keys',()=>{
 assert.equal(readToken({[authKey+'.0']:saved({currentSession:validSession})}),'valid-oauth-token');
 assert.equal(readToken({[authKey+'.2']:saved({session:validSession})}),'valid-oauth-token');
});
test('expired, malformed, identity-free or oversized sessions are not treated as signed-in',()=>{
 assert.equal(readToken({[authKey]:saved({...validSession,expires_at:Math.floor(NOW/1000)-1})}),'');
 assert.equal(readToken({[authKey]:'bad-json'}),'');
 assert.equal(readToken({[authKey]:saved({...validSession,user:{}})}),'');
 assert.equal(readToken({[authKey]:saved({...validSession,access_token:'X'.repeat(8193)})}),'');
});
test('unusable sessions do not conceal a later valid Supabase OAuth session',()=>{
 const fallback={
  'sb-unrelated-auth-token':saved({...validSession,expires_at:Math.floor(NOW/1000)-1}),
  [authKey]:saved(validSession),
 };
 assert.equal(readToken(fallback),'valid-oauth-token');
});
test('public Invest client uses the canonical reader but retains the server-verified member gate',async()=>{
 const source=await investAnalysisScript().text();
 assert.ok(source.includes(INVEST_MEMBER_SESSION_BROWSER_SOURCE));
 assert.match(source,/token=readEkodiMemberToken\(\)/);
 assert.match(source,/EKODI_MEMBER_SESSION_KEY\.test\(e\.key\)/);
 assert.match(source,/\/workspace-api\/v1\/invest\/common-analysis/);
 assert.match(source,/if\(!response\.ok\)throw Error\(\)/);
 assert.doesNotMatch(source,/ekodi_platform_session_v1/);
});
test('My Invest client reads canonical session, then requires server-side owner authorization and local step-up',async()=>{
 const response=await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{});
 assert.equal(response.status,200);
 const source=await response.text();
 assert.ok(source.includes(INVEST_MEMBER_SESSION_BROWSER_SOURCE));
 assert.match(source,/readEkodiMemberToken\(\)/);
 assert.match(source,/sessionClient\.auth\.getSession\(\)/);
 assert.match(source,/\/my\/invest\/access/);
 assert.doesNotMatch(source,/ekodi_platform_session_v1/);
 const denied=await investMyRoute(new Request('https://ekodi.kr/invest/access'),{});
 assert.equal(denied.status,401);
});
test('member browser key convention matches the central homepage OAuth contract',()=>{
 const homepage=readFileSync(new URL('../homepage-auth-state.js',import.meta.url),'utf8');
 assert.match(homepage,/SESSION_KEY = \/\^sb-/);
 assert.match(INVEST_MEMBER_SESSION_BROWSER_SOURCE,/EKODI_MEMBER_SESSION_KEY=\/\^sb-/);
});
