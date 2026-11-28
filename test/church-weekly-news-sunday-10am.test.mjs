import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {
  dueChurchNewsSunday,automaticChurchNewsSundays,extractBulletinAnnouncements,
  syncApprovedChurchWeeklyNotices
} from '../church-monthly-official-news.js';
import {handleSiteBoardRequest} from '../site-board-control.js';

const FIX=new URL('./fixtures/church-bulletin/',import.meta.url);
const fetcher=async url=>{
  const rel=String(url).replace('https://bulletin.test/','');
  try{return new Response(readFileSync(new URL(rel,FIX),'utf8'),{status:200})}
  catch{return new Response('missing',{status:404})}
};
function db(){
  const sql=new DatabaseSync(':memory:');
  const DB={prepare(source){let b=[];return{bind(...a){b=a;return this},
    async run(){const r=sql.prepare(source).run(...b);return{meta:{changes:Number(r.changes||0)}}},
    async first(){return sql.prepare(source).get(...b)||null},
    async all(){return{results:sql.prepare(source).all(...b)}}}},
    async batch(list){for(const s of list)await s.run()}};
  return {sql,DB};
}

test('weekly Church news becomes due every Sunday at 10:00 KST',()=>{
  assert.equal(dueChurchNewsSunday(new Date('2026-11-29T09:59:59+09:00')),'2026-11-22');
  assert.equal(dueChurchNewsSunday(new Date('2026-11-29T10:00:00+09:00')),'2026-11-29');
  assert.equal(dueChurchNewsSunday(new Date('2026-12-02T15:00:00+09:00')),'2026-11-29');
  assert.equal(dueChurchNewsSunday(new Date('2026-12-05T23:59:00+09:00')),'2026-11-29');
  assert.deepEqual(automaticChurchNewsSundays(new Date('2026-11-29T10:00:00+09:00')),['2026-11-22','2026-11-29']);
  assert.deepEqual(automaticChurchNewsSundays(new Date('2026-11-22T09:00:00+09:00')),[]);
});

test('bulletin announcements drop standing lines, placeholders and named personal prayers',()=>{
  const a22=extractBulletinAnnouncements(readFileSync(new URL('2026-11-22/index.html',FIX),'utf8'));
  assert.ok(a22.some(x=>/추수감사주일/.test(x)));
  assert.ok(!a22.some(x=>/두번요/.test(x)),'named personal prayer is never published');
  assert.ok(!a22.some(x=>/평공목|함찬사|환영합니다/.test(x)));
  const a29=extractBulletinAnnouncements(readFileSync(new URL('2026-11-29/index.html',FIX),'utf8'));
  assert.ok(a29.some(x=>/대림절 첫째 주일/.test(x)));
  assert.ok(!a29.some(x=>/확인\s*필요/.test(x)),'placeholders are never published');
  assert.equal(extractBulletinAnnouncements('<p>no bulletin</p>'),null);
});

test('Sunday 10:00 sync publishes that Sunday from the bulletin once, dated 10:00 KST',async()=>{
  const {sql,DB}=db();
  try{
    const env={DB,CHURCH_BULLETIN_SOURCE:'https://bulletin.test/'};
    await handleSiteBoardRequest(new Request('https://ekodi.kr/ekodichurch/board/api/health'),{...env,CHURCH_BULLETIN_AUTO:'off'});
    const board=await DB.prepare("SELECT * FROM ekodi_board_instances WHERE board_id='site:ekodichurch:main'").first();
    const before=await syncApprovedChurchWeeklyNotices(env,board,new Date('2026-11-29T09:30:00+09:00'),{fetcher,now:1});
    assert.ok(!sql.prepare("SELECT 1 FROM ekodi_board_posts WHERE title='11월 29일 교회소식'").get(),'not before 10:00');
    assert.ok(sql.prepare("SELECT 1 FROM ekodi_board_posts WHERE title='11월 22일 교회소식'").get(),'missed week is backfilled');
    assert.ok(before.published>=1);
    const at=new Date('2026-11-29T10:01:00+09:00');
    await syncApprovedChurchWeeklyNotices(env,board,at,{fetcher,now:10_000_000});
    const row=sql.prepare("SELECT p.*,pc.category_id FROM ekodi_board_posts p JOIN ekodi_board_post_categories pc ON pc.post_id=p.id WHERE p.title='11월 29일 교회소식'").get();
    assert.equal(row.category_id,'notice');
    assert.equal(row.status,'published');
    assert.equal(row.created_at,'2026-11-29T01:00:00.000Z');
    assert.match(row.body,/대림절 첫째 주일/);
    assert.doesNotMatch(row.body,/확인필요|355 0088|782301|두번요/);
    await syncApprovedChurchWeeklyNotices(env,board,at,{fetcher,now:99_000_000});
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM ekodi_board_posts WHERE title='11월 29일 교회소식'").get().n,1,'never duplicated');
  }finally{sql.close()}
});

test('draft bulletins and unreachable sources never publish',async()=>{
  const {sql,DB}=db();
  try{
    const env={DB,CHURCH_BULLETIN_SOURCE:'https://bulletin.test/'};
    await handleSiteBoardRequest(new Request('https://ekodi.kr/ekodichurch/board/api/health'),{...env,CHURCH_BULLETIN_AUTO:'off'});
    const board=await DB.prepare("SELECT * FROM ekodi_board_instances WHERE board_id='site:ekodichurch:main'").first();
    const draft=async url=>String(url).endsWith('weekly.json')
      ?new Response(JSON.stringify({services:[{date:'2026-12-06',status:'draft'}]}))
      :fetcher(url);
    await syncApprovedChurchWeeklyNotices(env,board,new Date('2026-12-06T10:30:00+09:00'),{fetcher:draft,now:5e9});
    assert.ok(!sql.prepare("SELECT 1 FROM ekodi_board_posts WHERE title='12월 6일 교회소식'").get());
    const down=async()=>{throw new Error('offline')};
    await syncApprovedChurchWeeklyNotices(env,board,new Date('2026-12-13T10:30:00+09:00'),{fetcher:down,now:6e9});
    assert.ok(!sql.prepare("SELECT 1 FROM ekodi_board_posts WHERE title='12월 13일 교회소식'").get());
  }finally{sql.close()}
});

test('platform super admins get full board management; others still need board roles',()=>{
  const source=readFileSync(new URL('../site-board-control.js',import.meta.url),'utf8');
  assert.match(source,/a\.role='super_admin' AND g\.role='super_admin' AND g\.status='active'/);
  assert.match(source,/isPlatformSuperAdmin\(env,principal\)[\s\S]{0,200}role:'owner',boardMember:true,manage:true/);
  assert.match(source,/const manage=boardMember&&BOARD_MANAGE_ROLES\.has\(role\)/);
});
