import test from 'node:test';
import assert from 'node:assert/strict';
import {exchangeGoogleReturn,refreshGoogleSession} from '../services/independent-board/v2/google-handoff.mjs';
import {SESSION_KEY} from '../services/independent-board/v2/citizen-controller.mjs';
function storage(){const map=new Map();const db={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};return {local:db,session:db};}
test('auth exchange verifies one-time hash, persists session, then clears URL fragment',async()=>{
  const store=storage(),calls=[];let replaced='';
  const result=await exchangeGoogleReturn({href:'https://seonammedi.kr/board/voices?compose=1#ekodi_token=testhash&ekodi_type=email',storage:store,replace:s=>replaced=s,fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({access_token:'t',refresh_token:'r',expires_in:3600})}}});
  assert.equal(result,true);assert.equal(replaced,'/board/voices?compose=1');
  assert.equal(JSON.parse(store.local.getItem(SESSION_KEY)).access_token,'t');
  assert.deepEqual(JSON.parse(calls[0].options.body),{token_hash:'testhash',type:'email'});
});
test('failed exchange leaves fragment for retry and does not save invalid tokens',async()=>{
  const store=storage();let replaced=false;
  await assert.rejects(exchangeGoogleReturn({href:'https://seonammedi.kr/board/voices#ekodi_token=x',storage:store,replace:()=>{replaced=true},fetcher:async()=>({ok:false,json:async()=>({})})}),/auth_exchange_failed/);
  assert.equal(replaced,false);assert.equal(store.local.getItem(SESSION_KEY),null);
});
test('expired credentials can refresh without repeat Google account selection',async()=>{
  const store=storage();store.local.setItem(SESSION_KEY,JSON.stringify({access_token:'old',refresh_token:'refresh-old',expires_at:1}));
  const ok=await refreshGoogleSession({storage:store,fetcher:async()=>({ok:true,json:async()=>({access_token:'new',refresh_token:'refresh-new',expires_in:3600})})});
  assert.equal(ok,true);assert.equal(JSON.parse(store.local.getItem(SESSION_KEY)).access_token,'new');
});
