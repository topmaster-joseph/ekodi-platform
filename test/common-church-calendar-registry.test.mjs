import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHURCH_CALENDAR_SEED,eventsOnDate,handleCommonChurchCalendar,validateCalendarEntry,churchCalendarSource} from '../common-church-calendar-registry.js';

const req=(path,options)=>new Request('https://ekodi.kr'+path,options);
const base={date:'2026-10-18',endDate:'2026-10-18',name:'직장선교주일',category:'denominational',approval:'draft',bulletin:'일터의 이웃을 위해 기도합니다.',sermonFocus:'일터의 소명',sourceUrl:'https://new.pck.or.kr/bbs/board.php?bo_table=SM02_03_12&wr_id=457'};
test('PCK calendar remains independent from EKODI approved common Scripture',()=>{
 assert.equal(churchCalendarSource().denomination,'대한예수교장로회 통합');
 assert.equal(eventsOnDate('2026-10-18').some(x=>x.name==='직장선교주일'),true);
 assert.equal(eventsOnDate('2026-10-20').some(x=>x.name==='기독교교육주간'),true);
 assert.equal(eventsOnDate('2026-10-17').some(x=>x.name==='기독교교육주간'),false);
 assert.equal(eventsOnDate('2026-10-32').length,0);
 assert.ok(CHURCH_CALENDAR_SEED.every(x=>x.approval==='provisional'));
});
test('Public date and year APIs expose provenance but no draft edit surface',async()=>{
 const today=await handleCommonChurchCalendar(req('/api/public/church-calendar?date=2026-10-18'));
 assert.equal(today.status,200);
 assert.equal(today.headers.get('x-ekodi-source-of-truth'),'common-church-calendar');
 const body=await today.json();assert.equal(body.events.length,1);
 assert.equal(body.events[0].id,'pck-2026-workplace');
 assert.ok(body.source.sourceUrl.includes('pck.or.kr'));
 assert.equal((await handleCommonChurchCalendar(req('/api/public/church-calendar?year=2026')).json()).events.length,CHURCH_CALENDAR_SEED.length);
 assert.equal((await handleCommonChurchCalendar(req('/api/public/church-calendar?date=2026-02-30'))).status,400);
 assert.equal((await handleCommonChurchCalendar(req('/api/public/church-calendar',{method:'POST'}))).status,405);
 assert.equal(await handleCommonChurchCalendar(req('/api/public/not-calendar')),null);
});
test('Management must reject unverified or fake admin credentials before D1 writes',async()=>{
 const unauth=await handleCommonChurchCalendar(req('/api/admin/church-calendar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(base)}));
 assert.equal(unauth.status,403);
 const forged=await handleCommonChurchCalendar(req('/api/admin/church-calendar',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer fake'},body:JSON.stringify(base)}),{},{
   fetch:async()=>new Response(JSON.stringify({permissions:{worship:false}}),{status:200,headers:{'content-type':'application/json'}})
 });
 assert.equal(forged.status,403);
});
test('Validation requires exact dates, controlled types and source provenance before approval',()=>{
 assert.equal(validateCalendarEntry(base).date,'2026-10-18');
 assert.throws(()=>validateCalendarEntry({...base,endDate:'2026-11-30'}),/INVALID_DATE_RANGE/);
 assert.throws(()=>validateCalendarEntry({...base,date:'2026-02-30'}),/INVALID_DATE_RANGE/);
 assert.throws(()=>validateCalendarEntry({...base,category:'private'}),/INVALID_EVENT_FIELDS/);
 assert.throws(()=>validateCalendarEntry({...base,approval:'approved',sourceUrl:''}),/SOURCE_URL_REQUIRED/);
});
test('Release includes a durable audit migration and api worker routing',()=>{
 const migration=readFileSync(new URL('../migrations/20261018090000_common_church_calendar.sql',import.meta.url),'utf8');
 const ingress=readFileSync(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
 assert.match(migration,/common_church_calendar_entries/);
 assert.match(migration,/common_church_calendar_audit/);
 assert.match(ingress,/handleCommonChurchCalendar\(request,env\)/);
});

test('Weekly view includes following weekdays and omits past events',async()=>{
 const response=await handleCommonChurchCalendar(req('/api/public/church-calendar?date=2026-10-18&week=1'));
 const payload=await response.json();
 assert.deepEqual(payload.events.map(e=>e.name),['직장선교주일','기독교교육주간']);
});


test('A pastor-verified JWT can create, publish, read, and archive with immutable audit entries',async()=>{
 const rows=new Map(),logs=[];
 const db={
   prepare(sql){
     return {
       async all(){return {results:[...rows.values()]};},
       bind(...args){
         return {
           async all(){return {results:[...rows.values()]};},
           async first(){return rows.has(args[0])?{version:1}:null;},
           async run(){
             if(sql.includes('common_church_calendar_audit')){
               logs.push({id:args[0],op:args[1],actor:args[2]});return {};
             }
             if(sql.includes('common_church_calendar_entries')){
               if(sql.includes("approval='archived'")){
                 const old=rows.get(args[0]);
                 if(old)rows.set(args[0],{...old,approval:'archived'});
                 return {};
               }
               const [id,event_date,end_date,name,category,approval,bulletin,sermon_focus,source_url,source_note,updated_by]=args;
               rows.set(id,{id,event_date,end_date,name,category,approval,bulletin,sermon_focus,source_url,source_note,updated_by});
             }
             return {};
           }
         };
       }
     };
   }
 };
 const subject='11111111-2222-4333-8444-555555555555';
 const jwt='eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({sub:subject})).toString('base64url')+'.test-signature';
 const auth='Bearer '+jwt,env={DB:db},deps={fetch:async()=>new Response(JSON.stringify({permissions:{worship:true}}),{status:200,headers:{'content-type':'application/json'}})};
 const make=(method,body)=>req('/api/admin/church-calendar',{method,headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(body)});
 const posted=await handleCommonChurchCalendar(make('POST',{...base,approval:'approved'}),env,deps);
 assert.equal(posted.status,200);
 const created=await posted.json();assert.equal(created.ok,true);
 const list=await handleCommonChurchCalendar(req('/api/public/church-calendar?date=2026-10-18'),env);
 assert.ok((await list.json()).events.some(e=>e.id===created.id));
 const deleted=await handleCommonChurchCalendar(make('DELETE',{id:created.id}),env,deps);
 assert.equal(deleted.status,200);
 const after=await handleCommonChurchCalendar(req('/api/public/church-calendar?date=2026-10-18'),env);
 assert.ok(!(await after.json()).events.some(e=>e.id===created.id));
 assert.deepEqual(logs.map(x=>x.op),['create','archive']);
 assert.ok(logs.every(x=>x.actor===subject));
});
