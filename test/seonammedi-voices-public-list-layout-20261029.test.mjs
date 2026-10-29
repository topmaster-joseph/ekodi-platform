import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFreshVoicePage,freshVoiceClient} from '../services/independent-board/voices-fresh/page.mjs';
import {handleFreshVoiceApi} from '../services/independent-board/voices-fresh/api.mjs';

test('guest voice list always renders sequential numbering and authored date',()=>{
  for(const fragment of [
    'for(const [index,item] of shown.entries())',
    "number.className='row-no'",
    'String(shown.length-index)',
    "date.className='row-date'",
    'summary.append(number,title,date)',
    'renderReplyArea(details,item)'
  ])assert.ok(freshVoiceClient.includes(fragment),fragment);
});

test('expanded post always offers reply action, but login is required before composing',()=>{
  for(const fragment of [
    "toggle.textContent='답글달기'",
    "beginLogin('reply',item.id);return",
    'editor.hidden=!editor.hidden',
    'adminAllowed||item.mine',
    'adminAllowed||response.mine'
  ])assert.ok(freshVoiceClient.includes(fragment),fragment);
});

test('short note and compose button use a left-aligned second line on both routes',()=>{
  for(const path of ['/board/voices','/seonammedi/board/voices']){
    const html=renderFreshVoicePage({url:'https://seonammedi.kr'+path},(...parts)=>parts.slice(1).join('\n'));
    for(const fragment of [
      '누구나 열람, 로그인 후 작성·답글 가능',
      'board-head{display:flex;flex-direction:column;align-items:flex-start',
      'board-head .board-actions{display:flex;width:100%;justify-content:flex-start',
      'id="freshWrite"'
    ])assert.ok(html.includes(fragment),fragment);
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
