import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleSeonamMediAdminApi,ensureSeonamMediNoticeWriteColumns} from '../seonammedi-admin-control.js';

const root=new URL('../sites/seonammedi/public/',import.meta.url);
const sample={
  id:12,title:'공개된 일정',body:'행사 장소와 안내',pinned:0,
  published_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',
  image_key:'',image_keys_json:'[]',notice_kind:'event',featured:0,
  event_start:'2026-10-16T09:00',event_end:'2026-10-16T11:00',
  created_by:'',status:'published'
};

test('public calendar accepts month and reads published event notices without schema mutation or auth',async()=>{
  const queries=[];
  const env={DB:{prepare(sql){
    queries.push(sql);
    return {
      bind(...params){queries.push(params);return this;},
      async all(){return {results:sql.startsWith('PRAGMA')?Object.keys(sample).map(name=>({name})):[sample]};}
    };
  }}};
  const response=await handleSeonamMediAdminApi(new Request('https://ekodi.kr/api/seonammedi/calendar?month=2026-10'),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.month,'2026-10');
  assert.equal(body.items.length,1);
  assert.equal(body.items[0].kind,'event');
  assert.equal(body.items[0].eventStart,'2026-10-16T09:00');
  assert.equal(body.items[0].body,'행사 장소와 안내');
  const sql=queries.find(x=>typeof x==='string'&&x.includes("notice_kind='event'"));
  assert.match(sql,/status='published'/);
  assert.match(sql,/event_start IS NOT NULL/);
  assert.ok(!queries.some(x=>typeof x==='string'&&/CREATE TABLE|ALTER TABLE|DELETE FROM|INSERT INTO/.test(x)));
  assert.deepEqual(queries.find(Array.isArray),['2026-10-31','2026-10-01']);
});

test('public calendar rejects malformed month before running SQL',async()=>{
  const env={DB:{prepare(){throw Error('must not touch DB')}}};
  for(const month of ['2026-13','2026-00','2026-1','2025-10%27','1999-12']){
    const response=await handleSeonamMediAdminApi(new Request('https://ekodi.kr/api/seonammedi/calendar?month='+month),env);
    assert.equal(response.status,400,month);
  }
});

test('sidebar calendar replaces recent notices/quick links and guards administration on site',async()=>{
  const [sidebar,calendar,css]=await Promise.all([
    readFile(new URL('board-central-category.js',root),'utf8'),
    readFile(new URL('calendar-sidebar.js',root),'utf8'),
    readFile(new URL('calendar-sidebar.css',root),'utf8')
  ]);
  assert.match(sidebar,/calendar-sidebar\.js/);
  assert.match(sidebar,/calendar-sidebar\.css/);
  assert.match(sidebar,/SeonamMediCalendar\?\.mount/);
  assert.doesNotMatch(sidebar,/최근 공지|seonam-visual-recent-notices|관련 바로가기/);
  assert.match(calendar,/\/admin\/me/);
  assert.match(calendar,/data\.permissions\?\.notices===true/);
  assert.match(calendar,/\/admin\/notices/);
  assert.match(calendar,/method:'DELETE'/);
  assert.match(calendar,/method:editingId\?'PUT':'POST'/);
  assert.match(calendar,/role','group'|role','group/);
  assert.match(calendar,/aria-pressed/);
  assert.match(calendar,/endInput\.value<startInput\.value/);
  assert.match(css,/seonam-calendar-grid/);
  assert.match(css,/max-width:940px/);
});

test('today agenda, management login, and calendar toolbar remain separate from selected-date listing',async()=>{
  const [layout,js,css]=await Promise.all([
    readFile(new URL('board-central-category.js',root),'utf8'),
    readFile(new URL('calendar-sidebar.js',root),'utf8'),
    readFile(new URL('calendar-sidebar.css',root),'utf8')
  ]);
  assert.match(layout,/주요일정/);
  assert.doesNotMatch(layout,/일정 달력/);
  assert.ok(layout.includes('20261017-live-2'),'published calendar JS and CSS must bypass old cached bundles');
  assert.ok(js.includes("heading.append(make('h2','','주요일정'))"));
  assert.ok(js.includes("appendButton(heading,'관리'"));
  assert.ok(js.includes("navigation.replaceChildren(current,previous,today,next)"));
  assert.ok(js.includes("target.searchParams.set('manage','schedule')"));
  assert.ok(js.includes("login.searchParams.set('return_to',target.href)"));
  assert.ok(js.includes("login.searchParams.set('direct','1')"));
  assert.ok(js.includes("data.permissions?.notices===true"));
  assert.ok(js.includes("todayAgenda.hidden=hits.length===0"));
  assert.ok(js.includes("newsBox.append(heading,navigation,week,calendar,status,todayAgenda)"));
  assert.ok(js.includes('if(month===currentMonth)'));
  assert.ok(js.includes("const response=await fetch(API+'/calendar?month='+encodeURIComponent(currentMonth)"));
  assert.ok(js.includes('await refreshToday()'),'loading schedules must refresh today regardless of selected month');
  assert.ok(js.includes('setInterval('),'long-lived pages must refresh at the new Korean calendar day');
  assert.ok(js.includes('let lastBackgroundRefresh=Date.now()'));
  assert.ok(js.includes('Date.now()-lastBackgroundRefresh<15*60*1000'));
  assert.ok(js.includes('if(currentDate!==now)'),'Korean midnight must bypass the throttled refresh interval');
  assert.ok(js.includes("method:editingId?'PUT':'POST'"));
  assert.ok(css.includes('.seonam-calendar-today-agenda[hidden]'));
  assert.ok(css.includes('.seonam-calendar-manage'));
  assert.ok(css.includes('text-align:left'));
});

test('authorized notice/event schema repair adds only missing D1 columns without touching rows',async()=>{
  const oldColumns=new Set(['id','title','body','status','pinned','published_at','image_key','image_type','created_by','created_at','updated_at']);
  const initialRows=[{id:9,title:'기존 공지',body:'보존할 내용'}];
  const statements=[];
  const db={
    prepare(sql){
      statements.push(sql);
      return {
        async all(){
          if(sql==='PRAGMA table_info(seonammedi_notices)')
            return {results:[...oldColumns].map(name=>({name}))};
          const check=sql.match(/^SELECT (\w+) FROM seonammedi_notices LIMIT 0$/);
          if(check){
            if(!oldColumns.has(check[1]))throw new Error('no such column: '+check[1]);
            return {results:[]};
          }
          throw new Error('unexpected read: '+sql);
        },
        async run(){
          const alter=sql.match(/^ALTER TABLE seonammedi_notices ADD COLUMN (\w+) /);
          if(!alter)throw new Error('unexpected write: '+sql);
          if(oldColumns.has(alter[1]))throw new Error('duplicate column name: '+alter[1]);
          oldColumns.add(alter[1]);
          return {success:true};
        }
      };
    }
  };
  await ensureSeonamMediNoticeWriteColumns(db);
  for(const col of ['image_keys_json','image_types_json','notice_kind','featured','event_start','event_end'])
    assert.ok(oldColumns.has(col),'missing column: '+col);
  assert.equal(statements.filter(sql=>sql.startsWith('ALTER TABLE')).length,6);
  assert.deepEqual(initialRows,[{id:9,title:'기존 공지',body:'보존할 내용'}]);
  statements.length=0;
  await ensureSeonamMediNoticeWriteColumns(db);
  assert.equal(statements.filter(sql=>sql.startsWith('ALTER TABLE')).length,0,'healthy schema must not mutate');
});

test('notice schema repair does not create or overwrite an absent notice table',async()=>{
  const db={prepare(sql){
    assert.equal(sql,'PRAGMA table_info(seonammedi_notices)');
    return {async all(){return {results:[]}}};
  }};
  await assert.rejects(ensureSeonamMediNoticeWriteColumns(db),/notice_table_missing/);
});

test('calendar write schema reconciliation occurs only inside capability-gated notice operations',async()=>{
  const source=await readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8');
  for(const start of ['async function createNotice(', 'async function updateNotice(']){
    const body=source.slice(source.indexOf(start),source.indexOf('\nasync function ',source.indexOf(start)+1));
    assert.ok(body.includes('if(!can(auth,NOTICE_CAP))'),'write must check notice capability first');
    assert.ok(body.indexOf('if(!can(auth,NOTICE_CAP))')<body.indexOf('noticeWriteSchemaFailure(env)'),'repair cannot precede permission check');
  }
  const publicCalendar=source.slice(source.indexOf('async function listPublicCalendar('),source.indexOf('async function noticeManageContext('));
  assert.ok(!publicCalendar.includes('ensureSeonamMediNoticeWriteColumns'),'public calendar must remain read-only');
});
