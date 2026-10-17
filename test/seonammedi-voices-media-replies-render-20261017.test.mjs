import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

test('the new citizen board never imports old photographs or replies on either domain',async()=>{
 for(const href of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
  const response=await board.fetch(new Request(href),{});assert.equal(response.status,200);
  const html=await response.text(),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);assert.doesNotThrow(()=>new Script(scripts[0][1]));
  assert.match(html,/id="freshList"/);
  assert.match(scripts[0][1],/api=root\+'\/api\/voices-fresh'/);
  assert.doesNotMatch(html,/id="imagePreview"|data-reply-delete|data-share=/);
 }
});
test('fresh D1 table has no legacy reply/image foreign key dependencies',async()=>{
 const sql=await readFile(new URL('../services/independent-board/migrations/0006_fresh_voices.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS citizen_voices_fresh/);
 assert.match(sql,/submission_key TEXT NOT NULL UNIQUE/);
 assert.doesNotMatch(sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n'),/DROP TABLE|board_replies|board_files|notice_posts|finance_posts/);
});
