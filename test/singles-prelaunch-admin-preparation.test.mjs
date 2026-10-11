import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {routeSinglesSurface} from '../singles-surface.js';
const source=await readFile(new URL('../supabase/functions/singles-api/index.ts',import.meta.url),'utf8');
const app=await readFile(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');
const env={
 SINGLES_M1_ENABLED:'false',
 SINGLES_SOCIAL_ENABLED:'false',
 SINGLES_BANK_TRANSFER_ENABLED:'false',
 SINGLES_API_URL:'https://example.supabase.co/functions/v1/singles-api',
 SUPABASE_URL:'https://example.supabase.co',
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_fixture',
 ASSETS:{fetch:async()=>new Response('asset')}
};
const req=(path,method='GET')=>new Request('https://ekodi.kr'+path,{method,headers:method==='PUT'?{'origin':'https://ekodi.kr','content-type':'application/json'}:{}});
test('admin may configure a verified session before member enrollment while all public services stay off',async()=>{
 const result=await routeSinglesSurface(req('/singles/api/status'),env);
 const body=await result.json();
 assert.equal(body.onboarding_enabled,false);
 assert.equal(body.social_enabled,false);
 assert.equal(body.paid_actions_enabled,false);
 assert.equal(body.admin_preparation_enabled,true);
 assert.equal(body.auth.supabase_url,env.SUPABASE_URL);
 assert.equal(body.auth.publishable_key,env.SUPABASE_PUBLISHABLE_KEY);
});
test('prelaunch price and license endpoints remain private, never publicly exposed',async()=>{
 for(const [path,method] of [
  ['/singles/api/bank/admin/catalog','GET'],
  ['/singles/api/bank/admin/catalog/message_1','PUT'],
  ['/singles/api/bank/admin/brokerage-readiness','GET'],
  ['/singles/api/bank/admin/brokerage-readiness','PUT']
 ]){
  const response=await routeSinglesSurface(req(path,method),env);
  assert.equal(response.status,401,path);
 }
});
test('prelaunch membership, orders, charging and matchmaking all fail closed',async()=>{
 for(const path of ['/singles/api/me','/singles/api/profile','/singles/api/bank/orders','/singles/api/bank/admin/config','/singles/api/discover']){
  const response=await routeSinglesSurface(req(path),env);
  assert.equal(response.status,503,path);
 }
});
test('operator preparation requires authenticated identity plus server-side capability',()=>{
 const auth=source.indexOf('db().auth.getUser(bearer)');
 const call=source.indexOf('handleSinglesBank(req');
 assert.ok(auth>=0&&call>auth);
 assert.match(source,/if \(!enabled\(\) && !prelaunchAdmin\)/);
 assert.match(app,/if\(prelaunchAdmin\)/);
 assert.match(app,/await showBrokerageReadiness\(h\)/);
 assert.match(app,/await showAllPricing\(h\)/);
});
test('unconfigured backend cannot surface preparation credentials or readiness',async()=>{
 const {SINGLES_API_URL,...broken}=env;
 const body=await (await routeSinglesSurface(req('/singles/api/status'),broken)).json();
 assert.equal(body.admin_preparation_enabled,false);
 assert.equal('auth' in body,false);
});
