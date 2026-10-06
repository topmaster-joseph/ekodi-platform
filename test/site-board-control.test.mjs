import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveSiteBoardRoute, EKODI_SITE_BOARD } from '../site-board-control.js';

test('canonical EKODI site board routes resolve independently',()=>{
  const mission=resolveSiteBoardRoute('https://ekodi.kr/ekodimission/board');
  const church=resolveSiteBoardRoute('https://ekodi.kr/ekodichurch/board/');
  const cheonggye=resolveSiteBoardRoute('https://ekodi.kr/cheonggye/board/api/posts');
  const cgma=resolveSiteBoardRoute('https://ekodi.kr/cgma/board');
  assert.deepEqual([mission.siteId,church.siteId,cheonggye.siteId,cgma.siteId],['ekodimission','ekodichurch','cheonggye','cgma']);
  assert.equal(mission.basePath,'/ekodimission/board');
  assert.equal(church.basePath,'/ekodichurch/board');
  assert.equal(cheonggye.subPath,'/api/posts');
  assert.notEqual(mission.siteId,church.siteId);
});

test('independent domains keep /board while retaining independent site identity',()=>{
  const seonam=resolveSiteBoardRoute('https://seonammedi.kr/board');
  const cgma=resolveSiteBoardRoute('https://cgma.or.kr/board/api/health');
  assert.equal(seonam.siteId,'seonammedi');
  assert.equal(seonam.basePath,'/board');
  assert.equal(cgma.siteId,'cgma');
  assert.equal(cgma.subPath,'/api/health');
});

test('non-board routes are not claimed by the board runtime',()=>{
  assert.equal(resolveSiteBoardRoute('https://ekodi.kr/ekodimission/'),null);
  assert.equal(resolveSiteBoardRoute('https://seonammedi.kr/notices'),null);
});

test('board runtime contract is site-scoped, AI-independent and exportable',async()=>{
  assert.equal(EKODI_SITE_BOARD.canonicalSuffix,'/board');
  assert.equal(EKODI_SITE_BOARD.aiIndependent,true);
  assert.equal(EKODI_SITE_BOARD.siteScoped,true);
  assert.equal(EKODI_SITE_BOARD.exportable,true);
  const source=await readFile(new URL('../site-board-control.js',import.meta.url),'utf8');
  assert.match(source,/board_id TEXT PRIMARY KEY/);
  assert.match(source,/WHERE board_id=\?/);
  assert.match(source,/x-ekodi-board-independent/);
  assert.match(source,/api\/export/);
  const router=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(router,/handleSiteBoardRequest/);
  assert.match(router,/const siteBoard=await handleSiteBoardRequest\(request,env\);if\(siteBoard\)return siteBoard/);
});


test('all JSON board APIs retain independent board identity headers',async()=>{
  const source=await readFile(new URL('../site-board-control.js',import.meta.url),'utf8');
  assert.match(source,/const boardJson=\(instance,data,status=200\)=>json/);
  assert.match(source,/x-ekodi-board-id/);
  assert.match(source,/x-ekodi-board-independent/);
  assert.doesNotMatch(source,/return json\(/);
  assert.match(source,/return boardJson\(instance,\{ok:true,boardId:instance\.board_id,siteId:instance\.site_id,aiIndependent:true,independent:true\}\)/);
});


test('internal service-binding host resolves canonical site board path without widening public hosts',()=>{
  const internal=resolveSiteBoardRoute('https://board.internal.ekodi/cgma/board/api/health');
  assert.deepEqual(internal,{siteId:'cgma',tenantSlug:'cheonggye',basePath:'/cgma/board',subPath:'/api/health'});
  assert.equal(resolveSiteBoardRoute('https://example.com/cgma/board'),null);
  assert.equal(resolveSiteBoardRoute('https://cgma.or.kr/cgma/board'),null);
});

test('board owns categories, attachments, search, backups and comment moderation without EKODI AI',async()=>{
  const source=await readFile(new URL('../site-board-control.js',import.meta.url),'utf8');
  for(const table of ['ekodi_board_categories','ekodi_board_post_categories','ekodi_board_attachments','ekodi_board_snapshots']){
    assert.ok(source.includes('CREATE TABLE IF NOT EXISTS '+table),table);
  }
  for(const route of ['/api/search','/api/categories','/attachments','/api/snapshots','/api/comments']){
    assert.ok(source.includes(route),route);
  }
  assert.match(source,/sharedPlatformDependency:'authentication_identity_only'/);
  assert.match(source,/boardLocalAuthorization:true/);
  assert.match(source,/aiIndependent:true/);
  assert.match(source,/WHERE board_id=\\?/);
  assert.match(source,/schemaVersion:3/);
  for(const operation of ['categories','attachments','search','snapshot','comment-edit','comment-delete']){
    assert.ok(EKODI_SITE_BOARD.coreOperations.includes(operation),operation);
  }
});

test('independent domain routing stays local to each board identity',()=>{
  const seonam=resolveSiteBoardRoute('https://seonammedi.kr/board/api/search?q=medical');
  const cgma=resolveSiteBoardRoute('https://cgma.or.kr/board/api/categories');
  const mission=resolveSiteBoardRoute('https://ekodi.kr/ekodimission/board/api/snapshots');
  assert.equal(seonam.siteId,'seonammedi');
  assert.equal(seonam.basePath,'/board');
  assert.equal(cgma.siteId,'cgma');
  assert.equal(cgma.basePath,'/board');
  assert.equal(mission.siteId,'ekodimission');
  assert.equal(mission.basePath,'/ekodimission/board');
  assert.notEqual(seonam.siteId,cgma.siteId);
});
