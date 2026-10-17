import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext,Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

const key='sb-renzehysxirjilvdxacv-auth-token';
const serialized=(access,expires,refresh='')=>JSON.stringify({access_token:access,expires_at:expires,refresh_token:refresh});
async function scriptFor(url){
 const response=await board.fetch(new Request(url),{});
 assert.equal(response.status,200);
 const html=await response.text();
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Script(scripts[0][1]));
 return scripts[0][1];
}
async function storedToken(script,local,session,fetcher=async()=>{throw Error('refresh-unavailable')}){
 const first=script.indexOf('const storageList=()=>'),last=script.indexOf('async function request(',first);
 assert.ok(first>=0&&last>first);
 const code=script.slice(first,last);
 return await runInNewContext('(async()=>{'+code+'return await accessToken()})()',{
  localStorage:{getItem:k=>k===key?local:null,setItem(){}},
  sessionStorage:{getItem:k=>k===key?session:null,setItem(){}},
  fetch:fetcher,Date,JSON,Math,KEY:key
 });
}
test('stale local token does not conceal a newer Google return in session storage',async()=>{
 for(const url of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
  const script=await scriptFor(url);
  assert.equal(await storedToken(script,serialized('expired',1),serialized('valid',4102444800)),'valid');
  assert.equal(await storedToken(script,serialized('older',2300000000),serialized('newer',4102444800)),'newer');
  assert.equal(await storedToken(script,'bad-json',serialized('valid',4102444800)),'valid');
  assert.equal(await storedToken(script,serialized('expired',1),serialized('expired-too',1)),'');
 }
});
test('expired refresh failure returns empty token without accepting unverified identity',async()=>{
 const script=await scriptFor('https://seonammedi.kr/board/voices');
 const token=await storedToken(script,serialized('expired',1,'expired-refresh'),null,async()=>{throw Error('network unavailable')});
 assert.equal(token,'');
 assert.match(script,/d\?\.authenticated===true&&d\?\.provider==='google'/);
 assert.match(script,/if\(await session\(\)\)/);
 assert.match(script,/beginLogin\(\)/);
});
