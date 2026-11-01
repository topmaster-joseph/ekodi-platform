import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
function sourceFunction(source,name,nextName){
  const start=source.indexOf('  function '+name+'(');
  const end=source.indexOf('  function '+nextName+'(',start+1);
  assert.ok(start>=0&&end>start,'extract '+name);
  return source.slice(start,end);
}

test('public account labels never render internal identity alias or full email',async()=>{
  const mission=await read('space/ekodimission-shell.js');
  const devotion=await read('bible/devotion.js');
  const m=new Function(sourceFunction(mission,'missionAccountLabel','paintMissionAuth')+'\nreturn missionAccountLabel;')();
  const d=new Function(sourceFunction(devotion,'devotionAccountLabel','showSharedAccount')+'\nreturn devotionAccountLabel;')();
  for(const label of [m,d]){
    assert.equal(label('identity+kakao.3bedb7b84088a8cf9c146279d298baff@ekodi.kr'),'카카오 계정');
    assert.equal(label('identity+naver.abcdef0123456789@ekodi.kr'),'네이버 계정');
    assert.equal(label('identity+other.abcdef0123456789@ekodi.kr'),'연결 계정');
    assert.equal(label('joseph@example.com'),'joseph');
    assert.equal(label('abcdefghijklmnopqrstuvwxyz@example.com'),'abcdefghijklmno…');
    assert.equal(label(''),'내 계정');
  }
  assert.ok(mission.includes('missionAuthUi.state.textContent=authenticated?missionAccountLabel(account)'));
  assert.ok(devotion.includes("devotionAccountLabel(viewer?.displayName||viewer?.name||viewer?.email)"));
  assert.ok(!devotion.includes("String(viewer.email||'계정').slice(0,90)"));
});

test('native devotion sharing has no repeated title/date/passage in the message',async()=>{
  const js=await read('bible/devotion.js');
  const begin=js.indexOf('  function shareBody(kind)');
  const end=js.indexOf('  async function copy(',begin);
  assert.ok(begin>=0&&end>begin);
  const current={
    found:true,
    date:'2026-11-01',
    passage:'고린도전서 3:1-9',
    activities:{
      keyLine:'심는 이도 물 주는 이도 아무것도 아니요, 오직 자라게 하시는 하나님뿐입니다.',
      poem:{title:'물 주는 손',lines:['누가 심었는지 다투던 밭에서','쌓은 아무 말 없이 자랐습니다']},
      song:{title:'조용히 물을 주겠습니다',verse:['말씀을 따라 살겠습니다'],refrain:['주님만 높이리']},
    },
  };
  const shareBody=new Function('current','siteLabel','panels',js.slice(begin,end)+'\nreturn shareBody;')(current,'에코디교회',new Map());
  const all=shareBody('page');
  assert.equal(all.title,'에코디교회 오늘의 매일묵상 · 고린도전서 3:1-9');
  assert.equal(all.text,current.activities.keyLine);
  assert.ok(!all.text.includes('11/1'));
  assert.ok(!all.text.includes('고린도전서 3:1-9'));
  const poem=shareBody('poem');
  assert.ok(!poem.text.includes('〈물 주는 손〉'));
  const song=shareBody('song');
  assert.ok(!song.text.includes('♪ 조용히 물을 주겠습니다'));
  assert.ok(js.includes('navigator.share({ title: body.title, text: body.text, url })'));
});
