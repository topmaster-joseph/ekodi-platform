import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {
  CHURCH_WEEKLY_NEWS_2026,approvedChurchMonthlyPublications,
  previousCompletedChurchSunday,syncApprovedChurchMonthlyNotices
} from '../church-monthly-official-news.js';
import {handleSiteBoardRequest} from '../site-board-control.js';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  const DB={
    prepare(source){
      let bound=[];
      return {
        bind(...args){bound=args;return this},
        async run(){
          const result=sql.prepare(source).run(...bound);
          return{success:true,meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}};
        },
        async first(){return sql.prepare(source).get(...bound)||null},
        async all(){return {results:sql.prepare(source).all(...bound)}}
      };
    },
    async batch(statements){for(const statement of statements)await statement.run()}
  };
  const env={DB};
  const call=async (path,method='GET',body)=>{
    const r=await handleSiteBoardRequest(new Request('https://ekodi.kr/ekodichurch/board'+path,{
      method,
      ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
    }),env);
    return {status:r.status,data:await r.json()};
  };
  const rows=()=>sql.prepare("SELECT p.id,p.title,p.body,p.author_person_id,p.status,p.created_at,pc.category_id FROM ekodi_board_posts p LEFT JOIN ekodi_board_post_categories pc ON p.board_id=pc.board_id AND p.id=pc.post_id WHERE p.board_id='site:ekodichurch:main' ORDER BY p.id").all();
  return{sql,env,call,rows};
}

test('11 verified Sunday announcements group into exactly three monthly board titles, only through last completed week',()=>{
  assert.equal(CHURCH_WEEKLY_NEWS_2026.length,11);
  assert.equal(previousCompletedChurchSunday(new Date('2026-11-22T01:00:00+09:00')),'2026-11-15');
  assert.equal(previousCompletedChurchSunday(new Date('2026-11-23T01:00:00+09:00')),'2026-11-22');
  const items=approvedChurchMonthlyPublications(new Date('2026-11-22T01:00:00+09:00'));
  assert.deepEqual(items.map(x=>x.title),['9월 교회소식','10월 교회소식','11월 교회소식']);
  assert.deepEqual(items.map(x=>x.weekCount),[4,4,3]);
  assert.match(items[0].body,/9월 26일 한가위 열린식탁/);
  assert.match(items[1].body,/기독교교육주간/);
  assert.match(items[2].body,/11월 15일 주일모임 후 공동의회/);
  assert.match(items[2].body,/11월 22일 주일모임은 추수감사주일/);
  for(const item of items)assert.ok(item.body.length<12000);
  assert.deepEqual(approvedChurchMonthlyPublications(new Date('2026-09-06T12:00:00+09:00')),[]);
});

test('Church official news is stored in the existing tenant-scoped board, categorized and audited once',async()=>{
  const f=fixture();
  try{
    await f.call('/api/health');
    const board=await f.env.DB.prepare("SELECT * FROM ekodi_board_instances WHERE board_id='site:ekodichurch:main'").first();
    const fixed=new Date('2026-11-22T01:00:00+09:00');
    assert.deepEqual(await syncApprovedChurchMonthlyNotices(f.env,board,fixed),{published:3,updated:0,months:3});
    assert.equal(f.rows().length,3);
    assert.deepEqual(f.rows().map(x=>x.title),['9월 교회소식','10월 교회소식','11월 교회소식']);
    for(const row of f.rows()){
      assert.equal(row.category_id,'notice');
      assert.equal(row.status,'published');
      assert.match(row.author_person_id,/^system:church-monthly-news:2026-(09|10|11)$/);
    }
    assert.deepEqual(await syncApprovedChurchMonthlyNotices(f.env,board,fixed),{published:0,updated:0,months:3});
    assert.equal(f.rows().length,3,'repeated publish can never duplicate the month');
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM ekodi_board_audit WHERE action='post.auto.create'").get().count,3);
    const list=await f.call('/api/posts?category=notice');
    assert.equal(list.status,200);
    assert.equal(list.data.boardId,'site:ekodichurch:main');
    assert.deepEqual(list.data.items.map(x=>x.title),['11월 교회소식','10월 교회소식','9월 교회소식']);
  }finally{f.sql.close()}
});

test('human editor revisions/deletions and unrelated tenants are never overwritten or auto-published',async()=>{
  const f=fixture();
  try{
    await f.call('/api/health');
    const instance=await f.env.DB.prepare("SELECT * FROM ekodi_board_instances WHERE site_id='ekodichurch'").first();
    const at=new Date('2026-11-22T01:00:00+09:00');
    await syncApprovedChurchMonthlyNotices(f.env,instance,at);
    f.sql.prepare("UPDATE ekodi_board_posts SET body='관리자 직접 수정' WHERE title='10월 교회소식'").run();
    f.sql.prepare("UPDATE ekodi_board_posts SET status='deleted' WHERE title='9월 교회소식'").run();
    await syncApprovedChurchMonthlyNotices(f.env,instance,at);
    const rows=f.rows();
    assert.equal(rows.length,3);
    assert.equal(rows[1].body,'관리자 직접 수정');
    assert.equal(rows[0].status,'deleted');
    const mission=await f.env.DB.prepare("INSERT INTO ekodi_board_instances(board_id,site_id,tenant_slug,created_at,updated_at) VALUES ('site:ekodimission:main','ekodimission','ekodimission',?,?) RETURNING *").bind(at.toISOString(),at.toISOString()).first();
    assert.deepEqual(await syncApprovedChurchMonthlyNotices(f.env,mission,at),{published:0,updated:0});
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM ekodi_board_posts WHERE board_id='site:ekodimission:main'").get().n,0);
    const unauth=await f.call('/api/posts','POST',{title:'거짓 소식',body:'관리자 아닌 게시',categoryId:'notice'});
    assert.equal(unauth.status,401);
  }finally{f.sql.close()}
});

test('public month data excludes identifiable health prayers, banking, attendance and future Sunday',()=>{
  const out=approvedChurchMonthlyPublications(new Date('2026-11-22T01:00:00+09:00'));
  const combined=out.map(x=>x.body).join('\n');
  for(const sensitive of ['임진명','두번요','355 0088','782301','010-3501','2026-11-22 주보'])assert.equal(combined.includes(sensitive),false,sensitive);
  const source=readFileSync(new URL('../site-board-control.js',import.meta.url),'utf8');
  assert.match(source,/syncApprovedChurchMonthlyNotices\(env,instance\)/);
  assert.match(source,/method==='GET'&&route.siteId==='ekodichurch'/);
  assert.match(source,/official_category_requires_board_manager/);
  assert.match(source,/verifiedAdminPrincipal/);
  assert.doesNotMatch(source,/allow_anonymous_write INTEGER NOT NULL DEFAULT 1/);
});
