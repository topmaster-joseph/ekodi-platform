import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../services/independent-board/',import.meta.url);
const worker=readFileSync(new URL('worker.js',root),'utf8');
const migration=readFileSync(new URL('migrations/0006_notice_views.sql',root),'utf8');
test('notice views are persisted with 30-minute visitor deduplication',()=>{
 assert.match(migration,/PRIMARY KEY\(notice_id,visitor,window_id\)/);
 assert.match(worker,/INSERT OR IGNORE INTO notice_views/);
 assert.match(worker,/Math\.floor\(Date\.now\(\)\/1800000\)/);
 assert.match(worker,/\/api\/notices.*view/);
 assert.match(worker,/viewCount:Number\(r\.view_count\|\|0\)/);
});
test('notice reader remains identical for guests and admins except editing actions',()=>{
 assert.match(worker,/class="notice-open"/);
 assert.match(worker,/class="notice-detail" hidden/);
 assert.match(worker,/data-count=/);
 assert.match(worker,/admin\?\\'<button data-edit=/);
});
