import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../hybrid-execution-admin.js',import.meta.url),'utf8');
const board=await readFile(new URL('../site-board-control.js',import.meta.url),'utf8');

test('consented CGMA authenticated CRUD is separate from isolated read-only native agent',()=>{
  assert.match(source,/id="enqueueHybridCgmaBoard"/);
  assert.match(source,/id="runCgmaAuthenticatedCrud" disabled/);
  assert.match(source,/CGMA 로그인 관리자 · 1회성 글쓰기 실증/);
  assert.match(source,/addEventListener\('click', runCgmaAuthenticatedCrud\)/);
  assert.match(source,/if \(!confirm\('CGMA 운영 게시판에/);
  assert.match(source,/lastDashboard\.fabric\?\.canManage !== true/);
  assert.match(source,/sessionStorage\.getItem\(TOKEN_KEY\)/);
  assert.match(source,/const token = sessionStorage\.getItem\(TOKEN_KEY\)/);
  assert.match(source,/authorization:'Bearer ' \+ token/);
  assert.match(source,/credentials:'same-origin'/);
  assert.match(source,/redirect:'error'/);
  assert.match(source,/signal:AbortSignal\.timeout\(18000\)/);
  assert.doesNotMatch(source,/localStorage\.getItem\('ekodi-auth-token'\)/);
});

test('only server-created test post ID is edited, verified and soft-deleted',()=>{
  assert.match(source,/const title = '\[EKODI 점검용\] ' \+ nonce/);
  assert.match(source,/let createdId = null/);
  assert.match(source,/createdId = Number\(created\.id\)/);
  assert.match(source,/Number\.isSafeInteger\(createdId\)/);
  assert.match(source,/verifiedOwnPost = read\.title === title && read\.body === body/);
  assert.match(source,/if \(!verifiedOwnPost\) throw new Error/);
  assert.match(source,/await cgmaAuthenticatedApi\(itemPath, 'PATCH', \{title:updatedTitle,body\}\)/);
  assert.match(source,/await cgmaAuthenticatedApi\(itemPath,'DELETE'\)/);
  assert.match(source,/cgmaAuthenticatedApi\(itemPath, 'GET', undefined, 404\)/);
  assert.match(source,/list\.items\.some\(post => Number\(post\.id\) === createdId\)/);
  assert.match(source,/if \(createdId && verifiedOwnPost && !deleted\) \{/);
  assert.match(source,/정리 실패 — 관리자 수동 확인 필요/);
  assert.doesNotMatch(source,/\/cgma\/board\/api\/memberships', ?'(?:POST|PUT|DELETE)'/);
});

test('board identity, existing authorization and server audit stay enforced',()=>{
  assert.match(source,/health\.boardId !== 'site:cgma:main'/);
  assert.match(source,/health\.independent !== true/);
  assert.match(source,/서버 감사기록은 별도 확인이 필요합니다/);
  assert.match(board,/if\(!who\.authenticated\)return boardJson\(instance,\{error:'authentication_required'\},401\)/);
  assert.match(board,/if\(!owns&&!who\.manage\)/);
  assert.match(board,/await audit\(env,instance,who,'post\.create'/);
  assert.match(board,/await audit\(env,instance,who,'post\.edit'/);
  assert.match(board,/await audit\(env,instance,who,'post\.delete'/);
});
