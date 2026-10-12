import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePublicBoardCatalog} from '../board-public-catalog.js';
import {readFile} from 'node:fs/promises';

function envRows(rows=[]){
 const statements=[];
 return {statements,env:{DB:{prepare(sql){
   statements.push({sql});
   return {bind(...args){statements.at(-1).args=args;return {all:async()=>({results:rows})}}};
 }}}};
}
const req=(path='/api/boards/public-catalog',method='GET')=>new Request('https://ekodi.kr'+path,{method});

test('catalog is a bounded database read of existing public active boards only',async()=>{
 const f=envRows([{board_id:'site:cgma:main',site_id:'cgma'},
                  {board_id:'site:my-new-company:main',site_id:'my-new-company'}]);
 const r=await handlePublicBoardCatalog(req(),f.env);
 assert.equal(r.status,200);
 assert.equal(r.headers.get('x-ekodi-board-catalog'),'public-v1');
 assert.equal(r.headers.get('cache-control'),'no-store');
 const d=await r.json();
 assert.equal(d.ok,true);
 assert.deepEqual(d.boards,[
   {siteId:'cgma',boardId:'site:cgma:main',prefix:'/cgma/board'},
   {siteId:'my-new-company',boardId:'site:my-new-company:main',prefix:'/my-new-company/board'},
 ]);
 assert.deepEqual(d.boards.map(x=>Object.keys(x)),[Object.keys(d.boards[0]),Object.keys(d.boards[0])]);
 assert.equal(f.statements.length,1);
 assert.match(f.statements[0].sql,/WHERE status='active' AND visibility='public' AND board_id>\?/);
 assert.match(f.statements[0].sql,/ORDER BY board_id LIMIT \?/);
 assert.deepEqual(f.statements[0].args,['',41]);
 assert.doesNotMatch(f.statements[0].sql,/INSERT|UPDATE|DELETE|CREATE/i);
});

test('catalog pages are cursor-bounded without scanning URLs or materialising new rows',async()=>{
 const f=envRows([
  {board_id:'site:cgma:main',site_id:'cgma'},
  {board_id:'site:cheonggye:main',site_id:'cheonggye'}
 ]);
 const r=await handlePublicBoardCatalog(req('/api/boards/public-catalog?limit=1'),f.env);
 const d=await r.json();
 assert.equal(r.status,200);
 assert.equal(d.boards.length,1);
 assert.equal(d.nextCursor,'site:cgma:main');
 assert.equal(d.complete,false);
 assert.equal(f.statements[0].args[1],2);
});

test('invalid cursor and write-method fail before any DB access',async()=>{
 const f=envRows();
 for(const path of ['/api/boards/public-catalog?cursor=bad','/api/boards/public-catalog?limit=999',
   '/api/boards/public-catalog?limit=-1']){
    const r=await handlePublicBoardCatalog(req(path),f.env);
    assert.equal(r.status,400);
 }
 const post=await handlePublicBoardCatalog(req('/api/boards/public-catalog','POST'),f.env);
 assert.equal(post.status,405);
 assert.equal(post.headers.get('allow'),'GET, HEAD');
 assert.equal(f.statements.length,0);
});

test('invalid or reserved existing catalog row fails closed',async()=>{
 for(const row of [
    {board_id:'site:admin:main',site_id:'admin'},
    {board_id:'site:cgma:main',site_id:'other'},
    {board_id:'site:../other:main',site_id:'../other'},
 ]) {
   const f=envRows([row]);
   const r=await handlePublicBoardCatalog(req(),f.env);
   assert.equal(r.status,503);
   assert.equal((await r.json()).ok,false);
 }
});

test('catalog handler is wired only into public root router',async()=>{
 const router=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
 assert.match(router,/import \{ handlePublicBoardCatalog \} from '\.\/board-public-catalog\.js'/);
 assert.match(router,/if\(host===PUBLIC_HOST&&url\.pathname==='\/api\/boards\/public-catalog'\)return handlePublicBoardCatalog\(request,env\)/);
 const runtime=await readFile(new URL('../site-board-control.js',import.meta.url),'utf8');
 assert.match(runtime,/async function ensureInstance\(/);
 assert.match(runtime,/INSERT OR IGNORE INTO ekodi_board_instances/);
});
