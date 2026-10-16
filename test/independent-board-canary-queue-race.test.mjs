import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^\uFEFF/,'');
const source=read('services/independent-board/worker.js');
// Run the exact canary SQL from the Worker, not a manually maintained copy.
function canaryInsert(table){
  const pattern=new RegExp("\\? '(INSERT INTO "+table+"[^'\\n]+board_canary_cleanup_tombstones[^'\\n]+)'");
  const sql=source.match(pattern)?.[1];
  assert.ok(sql,'missing atomic tombstone insert for '+table);
  return sql;
}
const postInsert=canaryInsert('board_posts');
const replyInsert=canaryInsert('board_replies');
const migrations=[1,2,3,4,5,6].map(id=>{
  const names=[
    '0001_board.sql','0002_citizen_voice_fields.sql',
    '0003_finance_notice_boards.sql','0004_board_media.sql',
    '0005_durable_write_ingress.sql','0006_canary_queue_cancellation.sql'
  ];
  return read('services/independent-board/migrations/'+names[id-1]);
});
function fixture(){
  const db=new DatabaseSync(':memory:');
  for(const sql of migrations)db.exec(sql);
  return db;
}
function postArgs(marker,submission){
  return ['EKODI 검증','other','','검증',marker,'[]',submission,'2026-10-17','2026-10-17',marker];
}
test('late queued post cannot recreate cleaned canary and normal posts remain intact',()=>{
  const db=fixture();
  const marker='EKODI-BOARD-CANARY-12345';
  try{
    const first=db.prepare(postInsert).run(...postArgs(marker,'canary-uuid-a'));
    assert.equal(first.changes,1);
    const postId=Number(first.lastInsertRowid);
    db.prepare("INSERT INTO board_posts(author_name,category,private_contact,title,body,image_keys,submission_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run('실제 이용자','other','','일반','일반 시민의견','[]','ordinary-uuid','2026','2026');
    db.prepare("INSERT INTO board_canary_cleanup_tombstones(marker,post_id) VALUES(?,?)").run(marker,postId);
    db.prepare("DELETE FROM board_replies WHERE post_id IN (SELECT id FROM board_posts WHERE body=?)").run(marker);
    db.prepare("DELETE FROM board_posts WHERE body=?").run(marker);
    const late=db.prepare(postInsert).run(...postArgs(marker,'canary-uuid-a'));
    assert.equal(late.changes,0,'cancelled marker must not be re-inserted');
    assert.deepEqual(db.prepare('SELECT body FROM board_posts').all().map(x=>x.body),['일반 시민의견']);
    const reply=db.prepare(replyInsert).run(postId,'EKODI 검증','reply-canary-12345','reply-uuid-a','2026',postId);
    assert.equal(reply.changes,0,'cancelled parent id must reject late reply');
  }finally{db.close()}
});
test('cancellation recorded BEFORE delayed queue consumption prevents any canary insert',()=>{
  const db=fixture(),marker='EKODI-BOARD-CANARY-54321';
  try{
    db.prepare('INSERT INTO board_canary_cleanup_tombstones(marker) VALUES(?)').run(marker);
    const delayed=db.prepare(postInsert).run(...postArgs(marker,'canary-uuid-b'));
    assert.equal(delayed.changes,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM board_posts').get().n,0);
  }finally{db.close()}
});
