import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleSiteBoardRequest,missionSaturdayFor,missionKstToday,missionSaturdayPublicSummary,parseEkodiPublicSchedule} from '../site-board-control.js';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 const DB={prepare(source){let args=[];return{
  bind(...values){args=values;return this},
  async run(){const x=sql.prepare(source).run(...args);return{success:true,meta:{last_row_id:Number(x.lastInsertRowid||0)}}},
  async first(){return sql.prepare(source).get(...args)||null},
  async all(){return{results:sql.prepare(source).all(...args)}}
 }},async batch(statements){for(const s of statements)await s.run()}};
 const env={DB,CONTROL_API:{async fetch(request){
  const email=request.headers.get('authorization')==='Bearer mission-editor'?'mission@example.org':
   request.headers.get('authorization')==='Bearer church-editor'?'church@example.org':'visitor@example.org';
  return new Response(JSON.stringify({authenticated:true,role:'admin',email}),
    {headers:{'content-type':'application/json'}});
 }}};
 const fetch=async(site,sub,method='GET',body=null,key='')=>{
  const res=await handleSiteBoardRequest(new Request('https://ekodi.kr/'+site+'/board'+sub,{
   method,headers:{...(key?{authorization:'Bearer '+key}:{}),...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  }),env);
  const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}
  return {status:res.status,data};
 };
 return{sql,DB,env,fetch};
}
const date=missionSaturdayFor(missionKstToday());

test('unique public planned count includes recurring/private/public per member and honors cancellation',async()=>{
 const f=fixture();try{
  await f.fetch('ekodimission','/api/health');
  const bid='site:ekodimission:main',stamp='2026-11-05T06:00:00Z';
  const preference=f.sql.prepare('INSERT INTO ekodi_mission_recurring_participation(board_id,person_id,enabled,created_at,updated_at) VALUES(?,?,?,?,?)');
  for(const p of ['A','B','D','E'])preference.run(bid,p,1,stamp,stamp);
  const override=f.sql.prepare('INSERT INTO ekodi_mission_saturday_private_rsvp(board_id,meeting_date,person_id,attendance,created_at,updated_at) VALUES(?,?,?,?,?,?)');
  override.run(bid,date,'B','maybe',stamp,stamp);
  override.run(bid,date,'C','join',stamp,stamp);
  const reply=f.sql.prepare("INSERT INTO ekodi_mission_saturday_replies(board_id,meeting_date,author_person_id,display_name,body,attendance,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'published',?,?)");
  reply.run(bid,date,'D','공개 D','함께합니다.','join',stamp,stamp);
  reply.run(bid,date,'E','공개 E','불참합니다.','cancel',stamp,stamp);
  reply.run(bid,date,'F','공개 F','','join',stamp,stamp);
  const summary=await missionSaturdayPublicSummary(f.env,bid,date);
  assert.deepEqual(summary,{plannedJoin:4,comments:2},'A recurring + C private + D dedup + F public; B maybe and E cancel excluded');
  const publicView=await f.fetch('ekodimission','/api/saturday');
  assert.equal(publicView.status,200);
  assert.deepEqual(publicView.data.summary,summary);
  assert.ok(!JSON.stringify(publicView.data.summary).includes('person_id'));
  assert.ok(!JSON.stringify(publicView.data.summary).includes('display_name'));
  f.sql.prepare("UPDATE ekodi_mission_saturday_private_rsvp SET attendance='cancel' WHERE board_id=? AND person_id='C'").run(bid);
  assert.equal((await missionSaturdayPublicSummary(f.env,bid,date)).plannedJoin,3);
  f.sql.prepare("UPDATE ekodi_mission_saturday_replies SET status='deleted' WHERE board_id=? AND author_person_id='D'").run(bid);
  assert.equal((await missionSaturdayPublicSummary(f.env,bid,date)).plannedJoin,3,'D still plans to attend by recurring opt-in even after deleting a public reply');
  f.sql.prepare("UPDATE ekodi_mission_recurring_participation SET enabled=0 WHERE board_id=? AND person_id='D'").run(bid);
  assert.equal((await missionSaturdayPublicSummary(f.env,bid,date)).plannedJoin,2);
 }finally{f.sql.close();}
});

test('two independent official boards share only published future schedule metadata',async()=>{
 const f=fixture();try{
  await f.fetch('ekodichurch','/api/health');
  await f.fetch('ekodimission','/api/health');
  const ts='2026-11-05T06:00:00Z';
  f.sql.prepare('INSERT INTO ekodi_board_memberships(board_id,person_id,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
   .run('site:ekodichurch:main','admin:church@example.org','owner','active',ts,ts);
  f.sql.prepare('INSERT INTO ekodi_board_memberships(board_id,person_id,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
   .run('site:ekodimission:main','admin:mission@example.org','owner','active',ts,ts);
  const next='2026-12-15';
  const church=await f.fetch('ekodichurch','/api/posts','POST',
   {title:'교회 연말 모임',body:'일정: '+next+' 14:00\n장소: 교회 1층\n비공개 논의 없음',categoryId:'schedule'},'church-editor');
  assert.equal(church.status,201);
  const mission=await f.fetch('ekodimission','/api/posts','POST',
   {title:'선교회 연말 모임',body:'일정: '+next+' 16:00\n장소: 에코디교회',categoryId:'mission-schedule'},'mission-editor');
  assert.equal(mission.status,201);
  const churchJson=await f.fetch('ekodichurch','/api/posts','POST',
   {title:'교회 봉사 모임',body:JSON.stringify({date:next,time:'18:30',venue:'교회 교육관',description:'외부 공유 금지 내부 메모'}),categoryId:'schedule'},'church-editor');
  assert.equal(churchJson.status,201);
  const churchOwn=await f.fetch('ekodichurch','/api/posts?category=schedule');
  assert.deepEqual(churchOwn.data.items.map(x=>x.title).sort(),['교회 봉사 모임','교회 연말 모임'].sort());
  const missionOwn=await f.fetch('ekodimission','/api/posts?category=mission-schedule');
  assert.deepEqual(missionOwn.data.items.map(x=>x.title),['선교회 연말 모임']);
  const fromChurch=await f.fetch('ekodichurch','/api/shared-schedules');
  const fromMission=await f.fetch('ekodimission','/api/shared-schedules');
  assert.equal(fromChurch.status,200);assert.equal(fromMission.status,200);
  assert.deepEqual(fromChurch.data.items,fromMission.data.items);
  for(const entry of ['교회 연말 모임','교회 봉사 모임','선교회 연말 모임'])assert.ok(fromChurch.data.items.some(x=>x.title===entry));
  const churchJsonProjection=fromChurch.data.items.find(x=>x.title==='교회 봉사 모임');
  assert.deepEqual({source:churchJsonProjection.source,date:churchJsonProjection.date,time:churchJsonProjection.time,venue:churchJsonProjection.venue},
    {source:'ekodichurch',date:next,time:'18:30',venue:'교회 교육관'});
  assert.ok(!JSON.stringify(fromChurch.data).includes('외부 공유 금지 내부 메모'));
  assert.ok(fromChurch.data.items.some(x=>x.kind==='recurring-meeting'&&x.source==='ekodimission'));
  assert.ok(fromChurch.data.items.some(x=>x.url==='/ekodichurch/board/post/'+church.data.id));
  assert.ok(!JSON.stringify(fromChurch.data).includes('비공개 논의 없음'));
  assert.ok(!JSON.stringify(fromChurch.data).includes('author_person_id'));
  assert.equal((await f.fetch('ekodichurch','/api/shared-schedules','POST',{date:next})).status,405);
  assert.match((await f.fetch('ekodichurch','/?category=schedule')).data,/<h1>주요일정<\/h1>/);
  assert.match((await f.fetch('ekodichurch','/?category=schedule')).data,/에코디교회 홈으로/);
  assert.equal((await f.fetch('ekodimission','/api/posts?category=mission-schedule')).data.items.length,1);
 }finally{f.sql.close();}
});


test('published Church and Mission feeds agree on 11:00 recurring Saturdays after the Nov 7 exception',async()=>{
 const f=fixture();try{
  await f.fetch('ekodimission','/api/health');
  const next=missionSaturdayFor(missionKstToday());
  const following=weeks=>{
   const at=new Date(next+'T00:00:00Z');at.setUTCDate(at.getUTCDate()+7*weeks);
   return at.toISOString().slice(0,10);
  };
  const legacyDate=following(1),customDate=following(2),board='site:ekodimission:main';
  const sql=f.sql.prepare('INSERT INTO ekodi_mission_saturday_events(board_id,meeting_date,starts_at,venue,title,status,created_at) VALUES(?,?,?,?,?,?,?)');
  sql.run(board,legacyDate,'17:00','에코디교회','토요 성경토론과 함께하는 식사','scheduled','2026-11-05T00:00:00Z');
  sql.run(board,customDate,'15:30','사역지 현장','특별모임','scheduled','2026-11-05T00:00:00Z');
  const [church,mission]=await Promise.all([
   f.fetch('ekodichurch','/api/shared-schedules'),
   f.fetch('ekodimission','/api/shared-schedules')
  ]);
  assert.equal(church.status,200);assert.equal(mission.status,200);
  assert.deepEqual(church.data.items,mission.data.items);
  const legacy=church.data.items.find(item=>item.source==='ekodimission'&&item.kind==='recurring-meeting'&&item.date===legacyDate);
  const manual=church.data.items.find(item=>item.source==='ekodimission'&&item.kind==='recurring-meeting'&&item.date===customDate);
  assert.equal(legacy?.time,'11:00','default after Nov 7 remains 11:00 in both public feeds');
  assert.equal(manual?.time,'15:30','a site-specific approved manual override is retained');
  assert.equal(f.sql.prepare('SELECT starts_at FROM ekodi_mission_saturday_events WHERE board_id=? AND meeting_date=?').get(board,legacyDate).starts_at,'11:00');
  assert.equal(f.sql.prepare('SELECT starts_at FROM ekodi_mission_saturday_events WHERE board_id=? AND meeting_date=?').get(board,customDate).starts_at,'15:30');
  assert.equal(JSON.stringify(church.data).includes('author_person_id'),false);
 }finally{f.sql.close();}
});

test('federation rejects invalid, foreign, unpublished and private-format schedule rows',()=>{
 const base={id:3,board_id:'site:ekodichurch:main',category_id:'schedule',
  title:'공개 모임',body:'일정: 2026-12-15 14:00\n장소: 에코디교회'};
 assert.equal(parseEkodiPublicSchedule({...base,board_id:'site:other:main'}),null);
 assert.equal(parseEkodiPublicSchedule({...base,category_id:'notice'}),null);
 assert.equal(parseEkodiPublicSchedule({...base,body:'일정: 2026-02-30 14:00\n장소: 에코디교회'}),null);
 assert.equal(parseEkodiPublicSchedule({...base,body:'자유 형식 메모'}),null);
 assert.equal(parseEkodiPublicSchedule({...base,body:'일정: 2026-12-15 14:00\n장소: '}),null);
 assert.equal(parseEkodiPublicSchedule(base)?.source,'ekodichurch');
 const json={...base,body:JSON.stringify({date:'2026-12-15',time:'14:00',venue:'교회 1층',description:'비공개 사역 계획'})};
 const projected=parseEkodiPublicSchedule(json,'2026-11-07');
 assert.equal(projected?.source,'ekodichurch');
 assert.equal(projected?.venue,'교회 1층');
 assert.equal(projected?.time,'14:00');
 assert.equal(projected?.url,'/ekodichurch/board/post/3');
 assert.ok(!JSON.stringify(projected).includes('비공개 사역 계획'));
 for(const payload of [
   {date:'2026-02-30',time:'14:00',venue:'교회'},
   {date:'2026-12-15',time:'24:10',venue:'교회'},
   {date:'2026-12-15',time:'14:00',venue:''},
   {date:'2026-12-15',time:'14:00',venue:'x'.repeat(161)}
 ])assert.equal(parseEkodiPublicSchedule({...json,body:JSON.stringify(payload)},'2026-11-07'),null);
 assert.equal(parseEkodiPublicSchedule({...json,category_id:'notice'},'2026-11-07'),null);
 assert.equal(parseEkodiPublicSchedule({...json,board_id:'site:other:main'},'2026-11-07'),null);

});

test('Mission summary renders one inline heading and updates after private RSVP changes',async()=>{
 const {readFile}=await import('node:fs/promises');
 const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
 const [mission,script,privateRsvp]=await Promise.all([
  read('space/ekodimission.page'),
  read('space/ekodimission-saturday.js'),
  read('space/ekodimission-participation.js')
 ]);
 assert.match(mission,/이번 주 참여 신청\(<span data-mission-saturday-count>0<\/span>\) 답글\(<span data-mission-saturday-comment-count>0<\/span>\)/);
 assert.doesNotMatch(mission,/참여 의사 0명 · 답글 0개/);
 assert.match(script,/data\.summary\?\.plannedJoin/);
 assert.match(script,/data\.summary\?\.comments/);
 assert.match(script,/ekodi:mission-participation-changed/);
 assert.match(privateRsvp,/dispatchEvent\?\.\(new Event\('ekodi:mission-participation-changed'\)\)/);
 // Church public widget is verified in independent source issue #147.
 // The central reviewed Church source-import manifest stays immutable until an approved re-import.
 assert.match(script,/shared-schedules/);
 assert.match(script,/item\.source==='ekodimission'\?owned\.get\(item\.id\)/);
 const shell=await read('space/ekodimission-shell.js');
 assert.match(shell,/button\.textContent='공유하기'/);
});
