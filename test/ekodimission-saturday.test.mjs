import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleSiteBoardRequest,missionSaturdayFor} from '../site-board-control.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const url='https://ekodi.kr/ekodimission/board/api/saturday';

function fakeDb(){
  const events=new Map(),replies=new Map();
  let nextId=1;
  const board={board_id:'site:ekodimission:main',site_id:'ekodimission',tenant_slug:'ekodimission',status:'active',comments_enabled:1};
  return {
    events,replies,
    async batch() {},
    prepare(sql){
      const statement={
        args:[],
        bind(...args){this.args=args;return this},
        async run(){
          const a=this.args;
          if(sql.includes('INSERT OR IGNORE INTO ekodi_mission_saturday_events')){
            const key=a[0]+'|'+a[1];
            if(!events.has(key))events.set(key,{meeting_date:a[1],starts_at:'11:00',venue:'에코디교회',title:'토요 성경토론과 함께하는 식사',status:'scheduled'});
          }
          if(sql.includes('INSERT INTO ekodi_mission_saturday_replies')){
            const key=a[0]+'|'+a[1]+'|'+a[2],old=replies.get(key);
            replies.set(key,{id:old?.id||nextId++,author_person_id:a[2],display_name:a[3],body:a[4],attendance:a[5],created_at:old?.created_at||a[6],updated_at:a[7],meeting_date:a[1],status:'published'});
          }
          return {success:true};
        },
        async first(){
          if(sql.includes('FROM ekodi_board_instances'))return board;
          if(sql.includes('FROM ekodi_board_memberships'))return null;
          if(sql.includes('FROM ekodi_mission_saturday_events'))return events.get(this.args[0]+'|'+this.args[1])||null;
          return null;
        },
        async all(){
          if(sql.includes('FROM ekodi_mission_saturday_replies')){
            return {results:[...replies.values()].filter(item=>item.meeting_date===this.args[1]).sort((a,b)=>a.id-b.id)};
          }
          return {results:[]};
        }
      };
      return statement;
    }
  };
}

function env(db){
  return {
    DB:db,
    CONTROL_API:{
      async fetch(req){
        return new Response(JSON.stringify({authenticated:true,role:'admin',email:'saturday-tester@example.org'}),{status:req.headers.has('authorization')?200:401,headers:{'content-type':'application/json'}});
      }
    }
  };
}

const request=(method='GET',payload=null,auth=false,origin='https://ekodi.kr')=>new Request(url,{
  method,headers:{...(auth?{authorization:'Bearer fake-verified-test-token'}:{}),...(method==='POST'?{'content-type':'application/json',origin}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})
});

test('KST weekly dates always target Saturday with year-end rollover',()=>{
  assert.equal(missionSaturdayFor('2026-10-29'),'2026-10-31');
  assert.equal(missionSaturdayFor('2026-10-31'),'2026-10-31');
  assert.equal(missionSaturdayFor('2026-11-01'),'2026-11-07');
  assert.equal(missionSaturdayFor('2026-12-31'),'2027-01-02');
});

test('anonymous visitors can see a single upcoming weekly meeting but cannot submit a reply',async()=>{
  const db=fakeDb(),e=env(db);
  const one=await handleSiteBoardRequest(request(),e);
  assert.equal(one.status,200);
  const state=await one.json();
  assert.equal(state.ok,true);
  assert.equal(state.meeting.venue,'에코디교회');
  assert.equal(state.meeting.time,'11:00');
  assert.equal(state.me.authenticated,false);
  assert.equal(state.replies.length,0);
  assert.equal(db.events.size,8);
  await handleSiteBoardRequest(request(),e);
  assert.equal(db.events.size,8,'Repeated visits must not create duplicate weekly events');
  const attempt=await handleSiteBoardRequest(request('POST',{meetingDate:state.meeting.date,displayName:'방문자',attendance:'join',body:'참석합니다',publicConsent:true}),e);
  assert.equal(attempt.status,401);
});

test('verified members create or revise one public answer per date; contact details are rejected',async()=>{
  const db=fakeDb(),e=env(db);
  const first=await (await handleSiteBoardRequest(request(),e)).json();
  const meetingDate=first.meeting.date;
  const payload={meetingDate,displayName:'말씀친구',attendance:'join',body:'이번 주 토요모임에 참여하겠습니다.',publicConsent:true};
  const added=await handleSiteBoardRequest(request('POST',payload,true),e);
  assert.equal(added.status,200);
  const created=await added.json();
  assert.equal(created.me.authenticated,true);
  assert.equal(created.replies.length,1);
  assert.equal(created.replies[0].own,true);
  assert.equal(created.replies[0].body,payload.body);
  const revised=await (await handleSiteBoardRequest(request('POST',{...payload,attendance:'question',body:'식사도 함께하나요?'},true),e)).json();
  assert.equal(revised.replies.length,1);
  assert.equal(revised.replies[0].attendance,'question');
  assert.equal(db.replies.size,1);
  const guest=await (await handleSiteBoardRequest(request(),e)).json();
  assert.equal(guest.replies[0].own,false);
  assert.equal(guest.replies[0].displayName,'말씀친구');
  assert.equal(JSON.stringify(guest).includes('saturday-tester@example.org'),false);
  const privateReply=await handleSiteBoardRequest(request('POST',{...payload,body:'010-1234-5678로 연락주세요'},true),e);
  assert.equal(privateReply.status,400);
  const staleDate=await handleSiteBoardRequest(request('POST',{...payload,meetingDate:'2020-01-01'},true),e);
  assert.equal(staleDate.status,409);
  const crossOrigin=await handleSiteBoardRequest(request('POST',payload,true,'https://example.org'),e);
  assert.equal(crossOrigin.status,403);
});

test('Mission landing, login state and image remain first-party and without hardcoded replies',async()=>{
 const [page,client,shell,css,worker]=await Promise.all([
  read('space/ekodimission.page'),read('space/ekodimission-saturday.js'),
  read('space/ekodimission-shell.js'),read('space/ekodimission-shell.css'),read('space-worker.js')
 ]);
 assert.match(page,/open-table-meal-260925.jpg/);
 assert.doesNotMatch(page,/mission-table-hero\.svg/);
 assert.match(page,/data-mission-saturday/);
 assert.match(page,/publicConsent/);
 assert.match(client,/\bPOST\b|method:'POST'/);
 assert.match(client,/credentials:'same-origin'/);
 assert.match(client,/textContent=String\(reply\.body/);
 assert.match(shell,/\/ekodimission\/board\/api\/me/);
 assert.match(shell,/로그인됨/);
 assert.match(shell,/로그아웃/);
 assert.match(shell,/normalizeMissionFooter/);
 assert.match(css,/\.mission-auth-actions/);
 assert.match(worker,/\/ekodimission\/assets\/saturday.js/);
});
