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
