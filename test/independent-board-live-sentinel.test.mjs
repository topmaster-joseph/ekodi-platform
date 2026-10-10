import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyIndependentBoardLive, LIVE_BOARDS} from '../scripts/verify-independent-board-live.mjs';

function fixture({mismatch = false, subscription = true, leak = false} = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({path: url.pathname, method: options.method, authorization: options.headers.authorization});
    const path = url.pathname;
    const site = LIVE_BOARDS.find(x => path.startsWith(x.prefix))?.site;
    const id = 'site:' + site + ':main';
    const headers = {'content-type': 'application/json'};
    if (site) {
      headers['x-ekodi-board-id'] = mismatch && site === 'cgma' ? 'site:cheonggye:main' : id;
      headers['x-ekodi-board-independent'] = 'true';
      if (path.endsWith('/api/health')) return new Response(JSON.stringify({
        ok: true, boardId: id, siteId: site, independent: true, aiIndependent: true,
      }), {status: 200, headers});
      if (path.endsWith('/api/posts')) return new Response(JSON.stringify({boardId: id, items: []}), {status: 200, headers});
      if (path.endsWith('/api/config')) return new Response(JSON.stringify({siteId: 'cgma', allowAnonymousWrite: false}), {status: 200, headers});
      if (path.endsWith('/api/categories') || path.endsWith('/api/search')) return new Response(JSON.stringify({items: []}), {status: 200, headers});
      if (/\/api\/(memberships|snapshots|export)$/.test(path)) return new Response('', {status: leak ? 200 : 403, headers});
      return new Response('<!doctype html><title>Board</title>', {status: 200, headers: {'content-type': 'text/html'}});
    }
    if (path === '/singles/api/status') return new Response(JSON.stringify({
      service: 'ekodi-singles', messages_require_subscription: subscription,
      paid_brokerage_enabled: false, social_enabled: false, bank_transfer_enabled: false,
    }), {status: 200, headers});
    if (path === '/singles/api/public') return new Response(JSON.stringify({description_only: true}), {status: 200, headers});
    if (path.startsWith('/singles/api/')) return new Response('', {status: 503, headers});
    if (path.startsWith('/singles')) return new Response('<!doctype html><title>EKODI Singles</title>', {status: 200, headers: {'content-type': 'text/html'}});
    throw new Error('Unexpected URL ' + path);
  };
  return {calls, fetcher};
}

test('production sentinel validates every subpage with GET only and never sends authentication data', async () => {
  const {calls, fetcher} = fixture();
  const result = await verifyIndependentBoardLive({fetcher, sleep: async () => {}});
  assert.equal(result.ok, true);
  assert.equal(result.pathsChecked, 30);
  assert.deepEqual(result.boards, ['cgma', 'cheonggye', 'ekodimission', 'ekodichurch']);
  assert.ok(calls.every(c => c.method === 'GET' && c.authorization === undefined));
});

test('a 200 response from the wrong CGMA board instance is never accepted', async () => {
  const {fetcher} = fixture({mismatch: true});
  await assert.rejects(() => verifyIndependentBoardLive({fetcher, sleep: async () => {}}), /board ID/);
});

test('messages require a verified community subscription even while social features are disabled', async () => {
  const {fetcher} = fixture({subscription: false});
  await assert.rejects(() => verifyIndependentBoardLive({fetcher, sleep: async () => {}}), /subscription-gated/);
});

test('anonymous membership, snapshot or export data access fails the production gate', async () => {
  const {fetcher} = fixture({leak: true});
  await assert.rejects(() => verifyIndependentBoardLive({fetcher, sleep: async () => {}}), /expected 401\/403, got HTTP 200/);
});
