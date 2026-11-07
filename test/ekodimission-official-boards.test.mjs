import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleSiteBoardRequest} from '../site-board-control.js';

test('Mission homepage shows notices and schedules after the Saturday gathering',async()=>{
  const page=await readFile(new URL('../space/ekodimission.page',import.meta.url),'utf8');
  const css=await readFile(new URL('../space/ekodimission.css',import.meta.url),'utf8');
  const script=await readFile(new URL('../space/ekodimission-saturday.js',import.meta.url),'utf8');
  assert.ok(page.indexOf('id="mission-updates"')>page.indexOf('id="saturday"'));
  for(const label of ['공지사항','주요일정'])assert.match(page,new RegExp(label));
  assert.match(css,/\.mission-home-board-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:760px\)\{\.mission-home-board-grid\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(script,/posts\?category=/);
  assert.match(script,/data\.meeting\?\.status==='scheduled'/);
  assert.match(page,/data-mission-calendar-days/);
  assert.match(page,/data-mission-calendar-prev/);
  assert.match(page,/data-mission-selected-label/);
  assert.match(css,/\.mission-calendar-day\[aria-pressed="true"\]/);
  assert.match(script,/function renderScheduleCalendar\(/);
  assert.match(script,/scheduleCalendar\.items\.filter\(item=>item\.date===scheduleCalendar\.selected\)/);
  assert.match(script,/showScheduleCalendar\(items,error&&manager\?error:''\)/);
  assert.match(script,/items\.slice\(0,kind==='mission-notice'\?6:items\.length\)/);

});

function fixture(){
  const sql=new DatabaseSync(':memory:');
  const DB={
    prepare(source){
      let bound=[];
      return {
        bind(...args){bound=args;return this},
        async run(){const result=sql.prepare(source).run(...bound);return{success:true,meta:{last_row_id:Number(result.lastInsertRowid||0)}}},
        async first(){return sql.prepare(source).get(...bound)||null},
        async all(){return {results:sql.prepare(source).all(...bound)}},
      };
    },
    async batch(statements){for(const stmt of statements)await stmt.run()}
  };
  const env={DB,CONTROL_API:{async fetch(request){
    const key=request.headers.get('authorization')||'';
    const email=key==='Bearer manager-secret'?'mission.manager@example.org':key==='Bearer other-secret'?'mission.other@example.org':'';
    if(!email)return new Response('{}',{status:401});
    return new Response(JSON.stringify({authenticated:true,role:'admin',email}),{headers:{'content-type':'application/json'}});
  }}};
  const base='https://ekodi.kr/ekodimission/board';
  const call=async (route,method='GET',body=null,token='')=>{
    const response=await handleSiteBoardRequest(new Request(base+route,{
      method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    }),env);
    const text=await response.text();
    let data;try{data=JSON.parse(text)}catch{data=text}
    return{status:response.status,data,headers:response.headers};
  };
  return{sql,DB,env,call};
}

test('Mission official categories are board-manager-only and filtered independently',async()=>{
  const f=fixture();try{
    await f.call('/api/health');
    const ts='2026-11-05T08:00:00Z';
    f.sql.prepare(`INSERT INTO ekodi_board_memberships(board_id,person_id,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
      .run('site:ekodimission:main','admin:mission.manager@example.org','owner','active',ts,ts);

    const anon=await f.call('/api/posts?category=mission-notice','POST',{title:'거짓 공지',body:'가짜',categoryId:'mission-notice'});
    assert.equal(anon.status,401);
    const forged=await f.call('/api/posts','POST',{title:'거짓 공지',body:'관리자 사칭',categoryId:'mission-notice'},'other-secret');
    assert.equal(forged.status,403);
    assert.equal(forged.data.error,'official_post_manager_required');
    const forgedSchedule=await f.call('/api/posts','POST',{title:'거짓 일정',body:'날짜: 2026-11-20',categoryId:'mission-schedule'},'other-secret');
    assert.equal(forgedSchedule.status,403);

    const ordinary=await f.call('/api/posts','POST',{title:'일반 대화',body:'안녕하세요'},'other-secret');
    assert.equal(ordinary.status,201);
    const promote=await f.call('/api/posts/'+ordinary.data.id,'PATCH',{categoryId:'mission-notice'},'other-secret');
    assert.equal(promote.status,403);

    const notice=await f.call('/api/posts','POST',{title:'정기 모임 안내',body:'이번 주 일정 변경',categoryId:'mission-notice'},'manager-secret');
    assert.equal(notice.status,201);
    const event=await f.call('/api/posts','POST',{
      title:'추가 모임',body:'일정: 2026-11-14 14:00\n장소: 에코디교회\n이웃과 나눔',categoryId:'mission-schedule'
    },'manager-secret');
    assert.equal(event.status,201);

    const noticeList=await f.call('/api/posts?category=mission-notice');
    assert.equal(noticeList.status,200);
    assert.equal(noticeList.data.items.length,1);
    assert.equal(noticeList.data.items[0].id,notice.data.id);
    assert.equal(noticeList.data.items[0].categoryId,'mission-notice');
    const scheduleList=await f.call('/api/posts?category=mission-schedule');
    assert.deepEqual(scheduleList.data.items.map(p=>p.id),[event.data.id]);
    const all=await f.call('/api/posts');
    assert.equal(all.data.items.length,3);

    const noticesPage=await f.call('/?category=mission-notice');
    assert.equal(noticesPage.status,200);
    assert.match(noticesPage.data,/<h1>공지사항<\/h1>/);
    assert.doesNotMatch(noticesPage.data,/일반 대화/);
    assert.equal((await f.call('/api/me','GET',null,'other-secret')).data.manage,false);
    assert.equal((await f.call('/api/me','GET',null,'manager-secret')).data.manage,true);

    f.sql.prepare("UPDATE ekodi_board_memberships SET status='revoked' WHERE person_id=?").run('admin:mission.manager@example.org');
    const demotedEdit=await f.call('/api/posts/'+notice.data.id,'PATCH',{title:'변조'},'manager-secret');
    assert.equal(demotedEdit.status,403);
    const demotedDelete=await f.call('/api/posts/'+event.data.id,'DELETE',null,'manager-secret');
    assert.equal(demotedDelete.status,403);
    assert.equal((await f.call('/api/posts?category=mission-schedule')).data.items.length,1);
  }finally{f.sql.close();}
});

test('Official categories never turn a different tenant into a Mission feed',async()=>{
  const f=fixture();try{
    const other=await handleSiteBoardRequest(new Request('https://ekodi.kr/ekodichurch/board/api/posts?category=mission-notice'),f.env);
    assert.equal(other.status,200);
    const body=await other.json();
    assert.deepEqual(body.items,[]);
    assert.equal(body.categoryId,null);
    assert.equal(body.boardId,'site:ekodichurch:main');
  }finally{f.sql.close();}
});
