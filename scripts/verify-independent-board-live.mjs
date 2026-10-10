import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export const LIVE_BOARDS = Object.freeze([
  {site: 'cgma', prefix: '/cgma/board'},
  {site: 'cheonggye', prefix: '/cheonggye/board'},
  {site: 'ekodimission', prefix: '/ekodimission/board'},
  {site: 'ekodichurch', prefix: '/ekodichurch/board'},
]);

const SINGLES_PAGES = Object.freeze([
  '/singles', '/singles/my', '/singles/discover', '/singles/groups',
  '/singles/events', '/singles/messages', '/singles/subscribe',
]);

// Read-only production regression check. Do not add any write operation or credentials.
export async function verifyIndependentBoardLive({
  origin = 'https://ekodi.kr',
  fetcher = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const checked = [];
  const request = async (path, expected = [200]) => {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await fetcher(new URL(path, origin), {
          method: 'GET',
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
          headers: {accept: 'application/json, text/html;q=0.8'},
        });
      } catch (error) {
        if (attempt === 3) throw new Error(path + ': fetch failed: ' + error.message);
        await sleep(attempt * 500);
        continue;
      }
      // Cloudflare quota/throttle protection is never retried or bypassed.
      if (response.status === 429 || response.status === 1027) {
        throw new Error(path + ': Cloudflare traffic guard ' + response.status);
      }
      if (expected.includes(response.status)) break;
      if (response.status >= 500 && attempt < 3) {
        await sleep(attempt * 500);
        continue;
      }
      throw new Error(path + ': expected ' + expected.join('/') + ', got HTTP ' + response.status);
    }
    if (!expected.includes(response.status)) {
      throw new Error(path + ': unexpected HTTP ' + response.status);
    }
    checked.push({path, status: response.status});
    return response;
  };
  const json = async path => {
    const response = await request(path);
    assert.match(response.headers.get('content-type') || '', /application\/json/i, path + ' content type');
    return {response, body: await response.json()};
  };
  for (const board of LIVE_BOARDS) {
    const id = 'site:' + board.site + ':main';
    const health = await json(board.prefix + '/api/health');
    assert.equal(health.body.ok, true, board.site + ' health');
    assert.equal(health.body.boardId, id, board.site + ' board ID');
    assert.equal(health.body.siteId, board.site);
    assert.equal(health.body.independent, true);
    assert.equal(health.body.aiIndependent, true);
    assert.equal(health.response.headers.get('x-ekodi-board-independent'), 'true');
    assert.equal(health.response.headers.get('x-ekodi-board-id'), id);
    const posts = await json(board.prefix + '/api/posts');
    assert.equal(posts.body.boardId, id);
    assert.ok(Array.isArray(posts.body.items), board.site + ' items');
    assert.equal(posts.response.headers.get('x-ekodi-board-id'), id);
    const page = await request(board.prefix);
    assert.match(page.headers.get('content-type') || '', /text\/html/i, board.site + ' page');
  }
  const config = await json('/cgma/board/api/config');
  assert.equal(config.body.siteId, 'cgma');
  assert.equal(config.body.allowAnonymousWrite, false, 'CGMA anonymous writes must remain disabled');
  const categories = await json('/cgma/board/api/categories');
  assert.ok(Array.isArray(categories.body.items));
  const search = await json('/cgma/board/api/search?q=ekodi_regression');
  assert.ok(Array.isArray(search.body.items));
  for (const path of [
    '/cgma/board/api/memberships',
    '/cgma/board/api/snapshots',
    '/cgma/board/api/export',
  ]) {
    await request(path, [401, 403]);
  }
  for (const path of SINGLES_PAGES) {
    const page = await request(path);
    assert.match(page.headers.get('content-type') || '', /text\/html/i, path + ' page');
  }
  const singles = await json('/singles/api/status');
  assert.equal(singles.body.service, 'ekodi-singles');
  assert.equal(singles.body.messages_require_subscription, true, 'all sends and replies must remain subscription-gated');
  assert.equal(singles.body.paid_brokerage_enabled, false);
  const publicData = await json('/singles/api/public');
  assert.equal(publicData.body.description_only, true);
  if (!singles.body.social_enabled) {
    await request('/singles/api/discover', [503]);
    await request('/singles/api/events', [503]);
  }
  if (!singles.body.bank_transfer_enabled) {
    await request('/singles/api/bank/plans', [503]);
  }
  return {
    ok: true, boards: LIVE_BOARDS.map(x => x.site),
    pathsChecked: checked.length,
    singlesSocialEnabled: Boolean(singles.body.social_enabled),
    singlesBankEnabled: Boolean(singles.body.bank_transfer_enabled),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyIndependentBoardLive().then(
    result => { console.log('[EKODI][BOARD-LIVE-VERIFY]', JSON.stringify(result)); },
    error => { console.error('[EKODI][BOARD-LIVE-VERIFY] FAIL:', error.message); process.exitCode = 1; },
  );
}
