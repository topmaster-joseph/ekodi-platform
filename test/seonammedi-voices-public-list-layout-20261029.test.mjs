import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFreshVoicePage,freshVoiceClient} from '../services/independent-board/voices-fresh/page.mjs';
import {handleFreshVoiceApi} from '../services/independent-board/voices-fresh/api.mjs';

test('guest voice list always renders sequential numbering and authored date',()=>{
  assert.match(freshVoiceClient,/for\\(const \\[index,item\\] of shown\\.entries\\(\\)\\)/);
  assert.match(freshVoiceClient,/number\\.className='row-no'/);
  assert.match(freshVoiceClient,/String\\(shown\\.length-index\\)/);
  assert.match(freshVoiceClient,/date\\.className='row-date'/);
  assert.match(freshVoiceClient,/summary\\.append\\(number,title,date\\)/);
  assert.match(freshVoiceClient,/renderReplyArea\\(details,item\\)/);
});

test('expanded post always offers reply action, but login is required before composing',()=>{
  assert.match(freshVoiceClient,/toggle\\.textContent='답글달기'/);
  assert.match(freshVoiceClient,/if\\(!token\\)\\{message\\('답글 작성을 위해 Google 로그인 후 다시 이동합니다\\.'\\);beginLogin\\('reply',item\\.id\\);return\\}/);
  assert.match(freshVoiceClient,/editor\\.hidden=!editor\\.hidden/);
  assert.match(freshVoiceClient,/adminAllowed\\|\\|item\\.mine/);
  assert.match(freshVoiceClient,/adminAllowed\\|\\|response\\.mine/);
});

test('short note and compose button use a left-aligned second line on both routes',()=>{
  for(const path of ['/board/voices','/seonammedi/board/voices']){
    const html=renderFreshVoicePage({url:'https://seonammedi.kr'+path},(...parts)=>parts.slice(1).join('\\n'));
    assert.match(html,/누구나 열람, 로그인 후 작성·답글 가능/);
    assert.match(html,/board-head\\{display:flex;flex-direction:column;align-items:flex-start/);
    assert.match(html,/board-head \\.board-actions\\{display:flex;width:100%;justify-content:flex-start/);
    assert.match(html,/id="freshWrite"/);
  }
});

test('guest can list and open content while guest reply POST is rejected',async()=>{
  const calls=[];
  const env={BOARD_DB:{prepare(sql){
    calls.push(sql);
    return {bind(){return this},async all(){return {results:sql.includes('citizen_voice_replies_fresh')?[]:[{id:7,title:'시민 의견',body:'의견 본문',google_subject:'writer',created_at:'2026-10-18T23:45:00Z',updated_at:'2026-10-18T23:45:00Z'}]}}};
  }}};
  const api='/api/voices-fresh';
  const deps={google:async()=>null,admin:async()=>({ok:false,response:Response.json({ok:false},{status:403})}),limit:async()=>({available:true,allowed:true})};
  const list=await handleFreshVoiceApi(new Request('https://seonammedi.kr/board'+api),env,api,deps);
  assert.equal(list.status,200);
  const payload=await list.json();
  assert.equal(payload.items[0].createdAt,'2026-10-18T23:45:00Z');
  assert.equal(payload.items[0].mine,false);
  assert.equal(payload.items[0].message,'의견 본문');
  const before=calls.length;
  const reply=await handleFreshVoiceApi(new Request('https://seonammedi.kr/board'+api+'/7/replies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'답글'})}),env,api+'/7/replies',deps);
  assert.equal(reply.status,401);
  assert.equal(calls.length,before,'unauthenticated reply cannot reach the DB');
});
