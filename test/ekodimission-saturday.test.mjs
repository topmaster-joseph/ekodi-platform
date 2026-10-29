import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleSiteBoardRequest,missionSaturdayFor,missionSaturdayLastPast,missionKstToday,MISSION_SATURDAY_STARTED} from '../site-board-control.js';

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
            const start=new Date(a[0]+'T00:00:00Z'),until=new Date(a[1]+'T00:00:00Z');
            for(let time=start.getTime();time<=until.getTime();time+=7*86400000){
              const date=new Date(time).toISOString().slice(0,10);
              const key=a[2]+'|'+date;
              if(!events.has(key))events.set(key,{meeting_date:date,starts_at:'11:00',venue:'에코디교회',title:'토요 성경토론과 함께하는 식사',status:date<a[3]?'completed':'scheduled'});
            }
          }
          if(sql.includes("UPDATE ekodi_mission_saturday_events")){
            for(const item of events.values())if(item.meeting_date<a[1]&&item.status==='scheduled')item.status='completed';
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
          if(sql.includes('FROM ekodi_mission_saturday_events')){
            const a=this.args;
            const items=[...events.values()].filter(x=>x.meeting_date>=a[1]&&x.meeting_date<a[2]&&
              (a[3]==='all'||x.meeting_date.slice(0,4)===a[4])&&
              (a[5]==='all'||x.meeting_date.slice(5,7)===a[6])&&
              x.meeting_date<a[7]).sort((left,right)=>right.meeting_date.localeCompare(left.meeting_date));
            return {results:items.slice(0,a[8])};
          }
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

test('KST midnight rolls current Saturday into last history and advances RSVP Sunday',()=>{
  const before=new Date('2026-10-31T14:59:59Z');
  const after=new Date('2026-10-31T15:00:00Z');
  assert.equal(missionKstToday(before),'2026-10-31');
  assert.equal(missionKstToday(after),'2026-11-01');
  assert.equal(missionSaturdayFor(missionKstToday(before)),'2026-10-31');
  assert.equal(missionSaturdayFor(missionKstToday(after)),'2026-11-07');
  assert.equal(missionSaturdayLastPast('2026-10-31'),'2026-10-24');
  assert.equal(missionSaturdayLastPast('2026-11-07'),'2026-10-31');
  assert.equal(MISSION_SATURDAY_STARTED,'2024-02-03');
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
  assert.ok(db.events.size>=151,'All historical Saturdays and eight future dates must be registered');
  assert.equal(db.events.get('site:ekodimission:main|2024-02-03')?.status,'completed');
  const firstCount=db.events.size;
  await handleSiteBoardRequest(request(),e);
  assert.equal(db.events.size,firstCount,'Repeated visits must not create duplicate weekly events');
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


test('registration history includes the first 2024-02-03 Saturday and remains paginated',async()=>{
  const db=fakeDb(),e=env(db);
  const api='https://ekodi.kr/ekodimission/board/api/saturday/history';
  const first=await handleSiteBoardRequest(new Request(api+'?year=2024&limit=24'),e);
  assert.equal(first.status,200);
  const data=await first.json();
  assert.equal(data.ok,true);
  assert.equal(data.startedOn,'2024-02-03');
  assert.equal(data.years.at(-1),'2024');
  assert.equal(data.items.length,24);
  assert.ok(data.items.every(entry=>entry.date.startsWith('2024-')));
  assert.ok(data.nextCursor);
  let cursor=data.nextCursor;
  let all=[...data.items];
  while(cursor){
    const response=await handleSiteBoardRequest(new Request(api+'?year=2024&limit=24&cursor='+cursor),e);
    assert.equal(response.status,200);
    const page=await response.json();
    all.push(...page.items);
    cursor=page.nextCursor;
  }
  assert.equal(all.at(-1).date,'2024-02-03');
  assert.equal(new Set(all.map(item=>item.date)).size,all.length);
  assert.equal(all.length,48,'Saturdays 2024-02-03 through 2024-12-28 inclusive');
  assert.equal(all.at(-1).time,'11:00');
  assert.equal(all.at(-1).venue,'에코디교회');
  const october=await (await handleSiteBoardRequest(new Request(api+'?year=2024&month=02'),e)).json();
  assert.equal(october.items.length,4,'February 2024 contains four Saturdays, starting 2024-02-03');
  assert.equal(october.items.at(-1).date,'2024-02-03');
  const invalid=await handleSiteBoardRequest(new Request(api+'?year=2023'),e);
  assert.equal(invalid.status,400);
  const invalidCursor=await handleSiteBoardRequest(new Request(api+'?cursor=INVALID'),e);
  assert.equal(invalidCursor.status,400);
  const repeat=await handleSiteBoardRequest(new Request(api+'?year=2024&limit=1'),e);
  assert.equal(repeat.status,200);
  const size=db.events.size;
  await handleSiteBoardRequest(new Request(api+'?year=2024&limit=1'),e);
  assert.equal(db.events.size,size,'Repeated archive reads are idempotent');
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
 assert.doesNotMatch(shell,/로그인됨|비로그인|로그인 확인 중/);
 assert.match(shell,/verifiedToken=token;paintMissionAuth\('in',data\.account\)/);
 assert.match(shell,/로그아웃/);
 assert.match(shell,/normalizeMissionFooter/);
 assert.match(css,/\.mission-auth-actions/);
 assert.match(worker,/\/ekodimission\/assets\/saturday.js/);
});

test('Sunday headline, live rollover, history browser and first-party asset remain connected',async()=>{
 const [home,client,history,activities,worker]=await Promise.all([
   read('space/ekodimission.page'),read('space/ekodimission-saturday.js'),
   read('space/ekodimission-saturday-history.js'),read('space/ekodimission-activities.page'),
   read('space-worker.js')
 ]);
 assert.match(home,/2024년 2월 3일부터/);
 assert.match(home,/<\/figure><\/section>\s*<section class="activities mission-home-current"/);
 assert.match(client,/heading\.textContent=day==='Sun'\?'다음 토요모임':'이번 주 토요모임'/);
 assert.match(client,/refreshAfterDayChange/);
 assert.match(history,/data-saturday-history-more/);
 assert.match(activities,/data-mission-saturday-history/);
 assert.match(activities,/2024년 2월 3일부터/);
 assert.match(worker,/\/ekodimission\/assets\/saturday-history.js/);
});
