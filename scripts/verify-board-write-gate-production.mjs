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

export async function verifyBoardWriteGateProduction({
  fetcher = fetch,
  origin = 'https://ekodi.kr',
  seonamOrigin = SEONAM_BOARD_ORIGIN,
} = {}) {
  const passed = [];
  for (const board of LIVE_BOARDS) {
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
    publicBoards: LIVE_BOARDS.map(x => x.site),
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
