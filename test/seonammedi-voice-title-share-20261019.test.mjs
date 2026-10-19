import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleFreshVoiceApi,consumeFreshVoiceQueue} from '../services/independent-board/voices-fresh/api.mjs';
import {renderFreshVoicePage} from '../services/independent-board/voices-fresh/page.mjs';

// Owner request (2026-10-19): citizen voices get a title field and a share
// button whose link opens that exact post.

const base='https://seonammedi.kr/board/api/voices-fresh';
const auth={google:async()=>({id:'g-1'}),admin:async()=>({ok:true}),limit:async()=>({available:true,allowed:true})};
function db(){
  const rows=[],queries=[];
  return {rows,queries,prepare(sql){queries.push(sql);let args=[];return {
    bind(...a){args=a;return this},
    async all(){return {results:rows.filter(r=>r.status==='published').filter(r=>!sql.includes('LIKE')||(r.body+r.title).includes(String(args[0]).replaceAll('%','')))}},
    async first(){return rows.find(r=>sql.includes('submission_key')?r.submission_key===args[0]:r.id===Number(args[0]))||null},
    async run(){
      if(sql.startsWith('INSERT')){const [google_subject,submission_key,title,body]=args;rows.push({id:rows.length+1,google_subject,submission_key,title,body,status:'published',created_at:'t',updated_at:'t'});return {meta:{last_row_id:rows.length}}}
      if(sql.startsWith('UPDATE citizen_voices_fresh SET title=?,body=')){const r=rows.find(x=>x.id===Number(args[3]));r.title=args[0];r.body=args[1]}
      return {success:true};
    }}}};
}
const post=(body,method='POST',path='')=>new Request(base+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('POST requires a non-empty title of at most 160 characters',async()=>{
  const env={BOARD_DB:db(),BOARD_WRITE_QUEUE:{async send(){}}};
  for(const title of [undefined,'','   ','가'.repeat(161)]){
    const res=await handleFreshVoiceApi(post({title,message:'본문'}),env,'/api/voices-fresh',auth);
    assert.equal(res.status,400,String(title));
    assert.equal((await res.json()).error,'invalid_title');
  }
});

test('title is queued, stored, listed, searchable and editable',async()=>{
  const queue=[],env={BOARD_DB:db(),BOARD_WRITE_QUEUE:{async send(e){queue.push(e)}}};
  const res=await handleFreshVoiceApi(post({title:'  응급실   확충  ',message:'본문 내용'}),env,'/api/voices-fresh',auth);
  assert.equal(res.status,202);
  assert.equal(queue[0].payload.title,'응급실 확충','whitespace is normalised');
  await consumeFreshVoiceQueue(env,queue[0].payload);
  assert.equal(env.BOARD_DB.rows[0].title,'응급실 확충');
  const listed=await (await handleFreshVoiceApi(new Request(base),env,'/api/voices-fresh',auth)).json();
  assert.equal(listed.items[0].title,'응급실 확충');
  const found=await (await handleFreshVoiceApi(new Request(base+'?q='+encodeURIComponent('확충')),env,'/api/voices-fresh',auth)).json();
  assert.equal(found.items.length,1);
  assert.ok(env.BOARD_DB.queries.some(q=>/title LIKE \?/.test(q)),'search covers the title');
  const edited=await handleFreshVoiceApi(post({title:'수정 제목',message:'수정 본문'},'PUT','/1'),env,'/api/voices-fresh/1',auth);
  assert.equal(edited.status,200);
  assert.equal(env.BOARD_DB.rows[0].title,'수정 제목');
});

test('older queue payloads without a title still publish',async()=>{
  const env={BOARD_DB:db()};
  await consumeFreshVoiceQueue(env,{submissionId:'00000000-0000-4000-8000-0000000000aa',googleSubject:'g',message:'예전 본문',createdAt:new Date().toISOString()});
  assert.equal(env.BOARD_DB.rows[0].title,'');
});

test('page has a required title input, share button and ?id= deep link',async()=>{
  const html=renderFreshVoicePage({},(...parts)=>parts.slice(1).join('\n'));
  assert.match(html,/<input id="freshTitle" type="text" maxlength="160" required/);
  assert.match(html,/share\.textContent='공유'/);
  assert.match(html,/navigator\.share/);
  assert.match(html,/navigator\.clipboard/);
  assert.match(html,/searchParams\.set\('id',String\(id\)\)/);
  assert.match(html,/details\.id='voice-'\+item\.id/);
  assert.match(html,/openSharedVoice\(\)/);
  assert.doesNotMatch(html,/innerHTML[^;]*item\.title/,'titles are rendered as text');
});

test('board migration adds the title column without touching existing rows',async()=>{
  const sql=await readFile(new URL('../services/independent-board/migrations/0007_fresh_voice_title.sql',import.meta.url),'utf8');
  assert.match(sql,/ALTER TABLE citizen_voices_fresh ADD COLUMN title TEXT NOT NULL DEFAULT ''/);
  assert.doesNotMatch(sql,/DROP|DELETE|UPDATE/i);
});
