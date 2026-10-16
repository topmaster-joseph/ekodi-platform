import test from 'node:test';
import assert from 'node:assert/strict';
import {authUrl,composeReturn,consumeComposeIntent,mounted,safeSession,createVoiceController,SESSION_KEY} from '../services/independent-board/v2/citizen-controller.mjs';
const path='https://seonammedi.kr/board/voices?compose=1&choose_account=1';
const internal='https://ekodi.kr/seonammedi/board/voices?compose=1';
const valid=JSON.stringify({access_token:'fake-token',expires_at:4102444800});
test('V2 preserves original domain, path and compose context',()=>{
  for(const target of [path,internal]){
    const login=new URL(authUrl(target));
    assert.equal(login.searchParams.get('purpose'),'seonammedi-board-write');
    assert.equal(login.searchParams.get('return_to'),composeReturn(target));
    const intent=consumeComposeIntent(target);
    assert.equal(intent.wanted,true);
    assert.ok(!intent.clean.includes('choose_account'));
  }
  assert.equal(mounted('/board/api/posts','/seonammedi/board/voices'),'/seonammedi/board/api/posts');
  assert.equal(mounted('/board/api/posts','/board/voices'),'/board/api/posts');
  assert.throws(()=>authUrl('https://attacker.example/board/voices'));
});
test('V2 refuses stale tokens and does not treat browser flags as identity',()=>{
  assert.equal(safeSession('{'),null);
  assert.equal(safeSession(JSON.stringify({access_token:'expired',expires_at:1})),null);
});
test('V2 opens composer with an already verified Google session, no login redirect',async()=>{
  const storage={getItem:k=>k===SESSION_KEY?valid:null};
  const requests=[];
  const fetcher=async(url,opts)=>{requests.push({url,opts});return {ok:true,json:async()=>url.endsWith('/auth/session')?{ok:true,authenticated:true,provider:'google'}:{ok:true,items:[]}}};
  const ctrl=await createVoiceController({href:path,storage,fetcher});
  const state=await ctrl.initialize();
  assert.equal(state.authenticated,true);
  assert.equal(state.openComposer,true);
  assert.equal(state.requiresLogin,false);
  assert.equal(state.loginUrl,null);
  assert.equal(requests.length,1);
});
test('V2 unauthenticated visitor sees login but cannot post',async()=>{
  const storage={getItem:()=>null};
  const ctrl=await createVoiceController({href:path,storage,fetcher:async()=>{throw Error('no request expected')}});
  const state=await ctrl.initialize();
  assert.equal(state.requiresLogin,true);
  const write=await ctrl.write('hello');
  assert.equal(write.ok,false);
  assert.match(write.loginUrl,/ekodi.kr\/auth/);
});
test('V2 write uses independently verified Bearer auth and canonical existing API',async()=>{
  const storage={getItem:()=>valid},calls=[];
  const fetcher=async(url,opts={})=>{
    calls.push({url,opts});
    if(url.endsWith('/auth/session'))return {ok:true,json:async()=>({ok:true,authenticated:true,provider:'google'})};
    return {ok:true,json:async()=>({ok:true,queued:true,submissionId:'test-id'})};
  };
  const ctrl=await createVoiceController({href:internal,storage,fetcher});
  const saved=await ctrl.write('작성 확인');
  assert.equal(saved.ok,true);
  assert.equal(calls.at(-1).url,'/seonammedi/board/api/posts');
  assert.equal(calls.at(-1).opts.headers.authorization,'Bearer fake-token');
  assert.equal(JSON.parse(calls.at(-1).opts.body).message,'작성 확인');
});
