import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext,Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

async function scriptFor(url){
  const response=await board.fetch(new Request(url),{});
  assert.equal(response.status,200);
  const html=await response.text();
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
  return scripts[0][1];
}
const session=(access,expires,refresh='')=>JSON.stringify({access_token:access,expires_at:expires,refresh_token:refresh});
const key='sb-renzehysxirjilvdxacv-auth-token';

test('expired local session cannot mask valid sessionStorage Google token on either host',async()=>{
  for(const url of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
    const script=await scriptFor(url);
    const start=script.indexOf('function token(){'),end=script.indexOf('function mounted(url)',start);
    assert.ok(start>=0&&end>start);
    const evaluate=(localValue,sessionValue)=>runInNewContext(script.slice(start,end)+'token()',{
      localStorage:{getItem:k=>k===key?localValue:null},
      sessionStorage:{getItem:k=>k===key?sessionValue:null}
    });
    assert.equal(evaluate(session('expired-local',1),session('valid-session',4102444800)),'valid-session');
    assert.equal(evaluate(session('older-local',2300000000),session('newer-session',4102444800)),'newer-session');
    assert.equal(evaluate(session('newer-local',4102444800),session('older-session',2300000000)),'newer-local');
    assert.equal(evaluate('invalid-json',session('valid',4102444800)),'valid');
    assert.equal(evaluate(session('expired',1),session('also-expired',1)),'');
  }
});
test('when all stored access tokens expire, browser attempts refresh before new account selection',async()=>{
  const script=await scriptFor('https://seonammedi.kr/board/voices');
  assert.match(script,/if\(!current&&allowRefresh&&await refreshVoiceToken\(\)\)return verifyVoiceAccount\(false\)/);
  assert.match(script,/if\(composeRequested&&!allowed\)/);
  assert.match(script,/if\(!params\.has\("auth_attempt"\)\)\{voiceLogin\(\);return\}/);
  assert.match(script,/\/board\/api\/auth\/session/);
  assert.match(script,/data\.authenticated===true&&data\.provider==="google"/);
});
