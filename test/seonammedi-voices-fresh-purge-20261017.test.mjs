import test from 'node:test';
import assert from 'node:assert/strict';
import {keysFromCitizenRows,verifyReady,purgeOldRecords} from '../services/independent-board/voices-fresh/purge-legacy.mjs';
const ready=async()=>{};
test('R2 deletion only accepts legacy citizen voice prefix and never notice files',()=>{
 assert.deepEqual(keysFromCitizenRows([{image_keys:JSON.stringify(['seonammedi/voices/1/synthetic.jpg','seonammedi/voices/1/synthetic.jpg'])}]),['seonammedi/voices/1/synthetic.jpg']);
 assert.throws(()=>keysFromCitizenRows([{image_keys:JSON.stringify(['seonammedi/notices/1/real.jpg'])}]),/untrusted_legacy_media_key/);
 assert.throws(()=>keysFromCitizenRows([{image_keys:'{'}]),/malformed_legacy_image_index/);
});
test('any incomplete cutover blocks purge before touching records',async()=>{
 let touched=false;
 const response=async url=>{
   if(url.endsWith('/voices'))return new Response('old UI',{status:200});
   if(url.endsWith('/api/posts'))return new Response('',{status:200});
   return Response.json({legacyQueue:'ready'});
 };
 await assert.rejects(()=>verifyReady(response),/fresh_ui_not_live/);
 await assert.rejects(()=>purgeOldRecords({
  verify:async()=>{throw Error('old_queue_not_disabled')},
  loadRows:async()=>{touched=true;return[]},
  deleteFile:async()=>{touched=true},
  execute:async()=>{touched=true},
  counts:async()=>({posts:0,replies:0,files:0,notices:0,finance:0})
 }),/old_queue_not_disabled/);
 assert.equal(touched,false);
});
test('purge removes old posts/replies and only referenced voice images, keeps notices/finance',async()=>{
 let data={posts:3,replies:4,files:2,notices:9,finance:10};
 const files=[],sql=[];
 const r=await purgeOldRecords({
   verify:ready,
   counts:async()=>({...data}),
   loadRows:async()=>[{image_keys:JSON.stringify(['seonammedi/voices/1/synthetic.jpg'])}],
   deleteFile:async key=>{files.push(key)},
   execute:async query=>{sql.push(query);data={...data,posts:0,replies:0,files:0}}
 });
 assert.deepEqual(files,['seonammedi/voices/1/synthetic.jpg']);
 assert.match(sql[0],/DELETE FROM board_replies; DELETE FROM board_files; DELETE FROM board_posts;/);
 assert.equal(sql[0].includes('notice_posts'),false);
 assert.equal(sql[0].includes('finance_posts'),false);
 assert.deepEqual(r.removedRows,{posts:3,replies:4,files:2});
});
