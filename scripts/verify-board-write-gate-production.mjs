import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { LIVE_BOARDS } from './verify-independent-board-live.mjs';

// Safe negative production probe: an empty JSON object cannot satisfy any
// published post/comment schema, even if a login guard regresses.
// No credentials, real post content, or private response bodies are used.
export const BOARD_WRITE_GATE_CONTRACT = 'ekodi.board.anonymous-write-denial.v1';
export const SEONAM_BOARD_ORIGIN = 'https://seonammedi.kr';

function jsonHeaders() {
  return { accept: 'application/json', 'cache-control': 'no-store' };
}

async function fetchJson(fetcher, url, method = 'GET') {
  const headers = method === 'POST'
    ? { ...jsonHeaders(), 'content-type': 'application/json' }
    : jsonHeaders();
  const response = await fetcher(url, {
    method, headers,
    ...(method === 'POST' ? { body: '{}' } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 429 || response.status === 1027) {
    throw new Error('Production traffic guard rejected safe canary: ' + new URL(url).pathname + ' HTTP ' + response.status);
  }
  let payload = null;
  try { payload = await response.json(); } catch {}
  return { status: response.status, payload, headers: response.headers };
}

function requireDenied(result, url, expectedError, expectedBoardId = '') {
  const path = new URL(url).pathname;
  assert.equal(result.status, 401, path + ' anonymous POST must return HTTP 401');
  assert.equal(result.payload?.error, expectedError, path + ' must return the real board authentication error');
  if (expectedBoardId) {
    assert.equal(result.headers.get('x-ekodi-board-id'), expectedBoardId, path + ' must resolve the correct board');
  }
}


// Public catalog reports only existing public database records. Every URL is
// rebuilt from a validated site identifier, never fetched from the payload.
const CATALOG_PATH='/api/boards/public-catalog';
const CATALOG_PAGE_SIZE=40;
const MAX_CATALOG_BOARDS=160;
const SITE_SLUG=/^[a-z0-9][a-z0-9-]{0,79}$/;

export async function discoverRegisteredPublicBoards({fetcher=fetch,origin='https://ekodi.kr'}={}){
  const catalog=[];
  let cursor='',pages=0;
  const seenCursors=new Set();
  while(true){
    if(++pages>6)throw new Error('board_catalog_pagination_limit');
    const pageUrl=new URL(CATALOG_PATH,origin);
    pageUrl.searchParams.set('limit',String(CATALOG_PAGE_SIZE));
    if(cursor)pageUrl.searchParams.set('cursor',cursor);
    const result=await fetchJson(fetcher,pageUrl.toString());
    assert.equal(result.status,200,'public board catalog must be accessible without login');
    assert.equal(result.headers.get('x-ekodi-board-catalog'),'public-v1','public board catalog identity');
    const data=result.payload||{};
    assert.equal(data.ok,true,'catalog API must affirm a successful query');
    assert.equal(data.schemaVersion,1,'unsupported board catalog schema');
    assert.equal(data.source,'existing_public_board_instances','catalog must originate from existing public DB records');
    assert.ok(Array.isArray(data.boards),'catalog items required');
    assert.ok(data.boards.length<=CATALOG_PAGE_SIZE,'catalog page limit');
    for(const item of data.boards){
      const site=String(item?.siteId||'');
      assert.match(site,SITE_SLUG,'catalog site identifier');
      assert.equal(item.boardId,'site:'+site+':main','catalog board identity');
      assert.equal(item.prefix,'/'+site+'/board','catalog canonical path');
      catalog.push({site,prefix:item.prefix});
      assert.ok(catalog.length<=MAX_CATALOG_BOARDS,'public board catalog exceeds safe traffic budget');
    }
    if(data.complete===true){
      assert.equal(data.nextCursor,null,'complete catalog must not have cursor');
      break;
    }
    assert.equal(data.complete,false,'unrecognized catalog completion state');
    const next=String(data.nextCursor||'');
    assert.match(next,/^site:[a-z0-9][a-z0-9-]{0,79}:main$/,'invalid continuation cursor');
    assert.ok(!seenCursors.has(next),'catalog pagination loop');
    seenCursors.add(next);
    cursor=next;
  }
  const dedup=new Map();
  for(const board of [...LIVE_BOARDS,...catalog]){
    const previous=dedup.get(board.site);
    if(previous&&previous.prefix!==board.prefix)throw new Error('board_identity_conflict: '+board.site);
    dedup.set(board.site,{site:board.site,prefix:board.prefix});
  }
  return [...dedup.values()].sort((a,b)=>a.site.localeCompare(b.site));
}

export async function verifyBoardWriteGateProduction({
  fetcher = fetch,
  origin = 'https://ekodi.kr',
  seonamOrigin = SEONAM_BOARD_ORIGIN,
} = {}) {
  const passed = [];
  const allBoards = await discoverRegisteredPublicBoards({fetcher,origin});
  for (const board of allBoards) {
    const boardId = 'site:' + board.site + ':main';
    const configPath = board.prefix + '/api/config';
    const listPath = board.prefix + '/api/posts';
    const config = await fetchJson(fetcher, new URL(configPath, origin).toString());
    assert.equal(config.status, 200, configPath + ' public configuration');
    assert.equal(config.payload?.siteId, board.site);
    assert.equal(config.payload?.allowAnonymousWrite, false, configPath + ' must never advertise anonymous writing');
    const list = await fetchJson(fetcher, new URL(listPath, origin).toString());
    assert.equal(list.status, 200, listPath + ' public read');
    assert.equal(list.payload?.boardId, boardId, listPath + ' board identity');
    assert.ok(Array.isArray(list.payload?.items), listPath + ' public list');

    const postUrl = new URL(listPath, origin).toString();
    requireDenied(await fetchJson(fetcher, postUrl, 'POST'), postUrl, 'authentication_required', boardId);
    passed.push({site: board.site, operation: 'post', status: 401});

    // On a board with comments disabled, HTTP 409 is the correct closed-write
    // behavior; no authenticated user can submit comments either.
    const commentsUrl = new URL(board.prefix + '/api/posts/1/comments', origin).toString();
    const comments = await fetchJson(fetcher, commentsUrl, 'POST');
    if (config.payload?.commentsEnabled === false) {
      assert.equal(comments.status, 409, board.site + ' disabled comments must remain closed');
      assert.equal(comments.payload?.error, 'comments_disabled');
      passed.push({site: board.site, operation: 'comment-disabled', status: 409});
    } else {
      requireDenied(comments, commentsUrl, 'authentication_required', boardId);
      passed.push({site: board.site, operation: 'comment', status: 401});
    }
  }
  for (const suffix of ['/board/api/posts', '/board/api/posts/1/replies']) {
    const url = new URL(suffix, seonamOrigin).toString();
    requireDenied(await fetchJson(fetcher, url, 'POST'), url, 'google_login_required');
    passed.push({site: 'seonammedi', operation: suffix.endsWith('/replies') ? 'reply' : 'post', status: 401});
  }
  return {
    ok: true,
    contract: BOARD_WRITE_GATE_CONTRACT,
    publicBoards: allBoards.map(x => x.site),
    standaloneBoard: 'seonammedi',
    negativeChecks: passed.length,
    checks: passed,
    persistentWrites: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyBoardWriteGateProduction().then(
    outcome => console.log('[EKODI][BOARD-WRITE-GATE-LIVE]', JSON.stringify(outcome)),
    error => { console.error('[EKODI][BOARD-WRITE-GATE-LIVE] FAIL:', error.message); process.exitCode = 1; },
  );
}
