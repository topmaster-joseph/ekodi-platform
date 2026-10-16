import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBoardWriteGateProduction, BOARD_WRITE_GATE_CONTRACT } from '../scripts/verify-board-write-gate-production.mjs';
import { LIVE_BOARDS } from '../scripts/verify-independent-board-live.mjs';

function fixture({ postStatus = 401, error = 'authentication_required', seonamStatus = 401,
  commentsDisabledSite = '', anonymousWriteAllowed = false } = {}) {
  const requests = [];
  const fetcher = async (url, options) => {
    const target = new URL(url), path = target.pathname, method = options.method;
    requests.push({ url: target.href, method, headers: options.headers, body: options.body });
    if (target.hostname === 'seonammedi.kr') {
      return Response.json({ error: 'google_login_required' }, { status: seonamStatus });
    }
    const site = path.split('/')[1];
    const id = 'site:' + site + ':main';
    const headers = { 'x-ekodi-board-id': id };
    if (method === 'GET' && path.endsWith('/api/config')) {
      return Response.json({ siteId: site, allowAnonymousWrite: anonymousWriteAllowed,
        commentsEnabled: site !== commentsDisabledSite }, { headers });
    }
    if (method === 'GET' && path.endsWith('/api/posts')) {
      return Response.json({ boardId: id, items: [] }, { headers });
    }
    const disabled = site === commentsDisabledSite && path.endsWith('/comments');
    return Response.json({ error: disabled ? 'comments_disabled' : error }, {
      status: disabled ? 409 : postStatus, headers,
    });
  };
  return { fetcher, requests };
}

test('safe live canary covers all four public boards plus SeonamMedi post/reply', async () => {
  const f = fixture();
  const result = await verifyBoardWriteGateProduction({ fetcher: f.fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.contract, BOARD_WRITE_GATE_CONTRACT);
  assert.deepEqual(result.publicBoards, LIVE_BOARDS.map(x => x.site));
  assert.equal(result.negativeChecks, LIVE_BOARDS.length * 2 + 2);
  assert.equal(result.persistentWrites, 0);
  assert.equal(f.requests.length, LIVE_BOARDS.length * 4 + 2);
  const writes = f.requests.filter(x => x.method === 'POST');
  assert.equal(writes.length, result.negativeChecks);
  assert.ok(writes.every(x => x.body === '{}'));
  assert.ok(writes.every(x => !('authorization' in x.headers)));
  assert.ok(f.requests.every(x => x.headers['cache-control'] === 'no-store'));
  assert.ok(f.requests.every(x => !('cookie' in x.headers)));
});

test('disabled comments are treated as closed for all users, without false 401 claims', async () => {
  const f = fixture({ commentsDisabledSite: 'cgma' });
  const result = await verifyBoardWriteGateProduction({ fetcher: f.fetcher });
  const disabled = result.checks.find(x => x.site === 'cgma' && x.operation === 'comment-disabled');
  assert.deepEqual(disabled, { site: 'cgma', operation: 'comment-disabled', status: 409 });
});

test('anonymous insert or bypass does not pass, even if empty payload is rejected as invalid', async () => {
  for (const status of [200, 201, 400, 403, 429]) {
    const f = fixture({ postStatus: status, error: 'title_and_body_required' });
    await assert.rejects(() => verifyBoardWriteGateProduction({ fetcher: f.fetcher }));
  }
});

test('a generic auth proxy response must not be confused with board-local 401', async () => {
  const f = fixture({ error: 'unrelated_auth_error' });
  await assert.rejects(() => verifyBoardWriteGateProduction({ fetcher: f.fetcher }), /authentication error/);
});

test('legacy anonymous-write config advertised as active fails regression', async () => {
  const f = fixture({ anonymousWriteAllowed: true });
  await assert.rejects(() => verifyBoardWriteGateProduction({ fetcher: f.fetcher }), /anonymous writing/);
});

test('SeonamMedi replies must be explicitly rejected as Google login required', async () => {
  const f = fixture({ seonamStatus: 400 });
  await assert.rejects(() => verifyBoardWriteGateProduction({ fetcher: f.fetcher }), /HTTP 401/);
});
