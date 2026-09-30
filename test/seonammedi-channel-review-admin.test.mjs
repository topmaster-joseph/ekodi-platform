import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../sites/seonammedi/public/admin/',import.meta.url);
test('manual channel registration waits for admin approval',async()=>{
 const [html,js]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('admin.js',root),'utf8')]);
 assert.match(html,/신규 등록은 공개 대기로 저장/);
 assert.match(html,/name="visible"> 공개 승인/);
 assert.doesNotMatch(html,/name="visible" checked/);
 assert.match(js,/visible\.checked=false/);
 assert.match(js,/공개 대기/);
});
