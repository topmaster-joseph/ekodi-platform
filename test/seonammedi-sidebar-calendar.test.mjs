import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleSeonamMediAdminApi} from '../seonammedi-admin-control.js';

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
