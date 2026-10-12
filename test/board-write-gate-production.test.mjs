import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBoardWriteGateProduction, BOARD_WRITE_GATE_CONTRACT } from '../scripts/verify-board-write-gate-production.mjs';
import { LIVE_BOARDS } from '../scripts/verify-independent-board-live.mjs';

function fixture({ postStatus = 401, error = 'authentication_required', seonamStatus = 401,
  commentsDisabledSite = '', anonymousWriteAllowed = false,
  catalogSites = [], catalogOverride = null, catalogHttpStatus = 200 } = {}) {
  const requests = [];
  const fetcher = async (url, options) => {
    const target = new URL(url), path = target.pathname, method = options.method;
    requests.push({ url: target.href, method, headers: options.headers, body: options.body });
    if (target.hostname === 'seonammedi.kr') {
      return Response.json({ error: 'google_login_required' }, { status: seonamStatus });
    }
    if (path === '/api/boards/public-catalog') {
      return Response.json(catalogOverride || { ok: true, schemaVersion: 1,
        source: 'existing_public_board_instances', complete: true, nextCursor: null,
        boards: catalogSites.map(site => ({siteId:site,boardId:'site:'+site+':main',prefix:'/'+site+'/board'})) },
      {status:catalogHttpStatus,headers:{'x-ekodi-board-catalog':'public-v1'}});
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
  assert.deepEqual(result.publicBoards, LIVE_BOARDS.map(x => x.site).sort());
  assert.equal(result.negativeChecks, LIVE_BOARDS.length * 2 + 2);
  assert.equal(result.persistentWrites, 0);
  assert.equal(f.requests.length, LIVE_BOARDS.length * 4 + 3);
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

test('newly registered public tenant board is discovered without speculative URL probing', async () => {
  const f=fixture({catalogSites:['newmember']});
  const result=await verifyBoardWriteGateProduction({fetcher:f.fetcher});
  assert.ok(result.publicBoards.includes('newmember'));
  assert.equal(result.negativeChecks,(LIVE_BOARDS.length+1)*2+2);
  assert.equal(f.requests.filter(x=>x.url.includes('/newmember/board/')).length,4);
  assert.equal(f.requests.filter(x=>x.method==='POST'&&x.url.includes('/newmember/')).length,2);
  assert.ok(!f.requests.some(x=>x.url.includes('/unknown/board')));
});

test('all catalog locations are reconstructed from validated board IDs', async () => {
  for(const overrides of [
    {siteId:'evil',boardId:'site:other:main',prefix:'/evil/board'},
    {siteId:'evil',boardId:'site:evil:main',prefix:'https://untrusted.example/board'},
    {siteId:'../other',boardId:'site:../other:main',prefix:'/../other/board'},
  ]) {
    const f=fixture({catalogOverride:{ok:true,schemaVersion:1,source:'existing_public_board_instances',
      complete:true,nextCursor:null,boards:[overrides]}});
    await assert.rejects(()=>verifyBoardWriteGateProduction({fetcher:f.fetcher}));
    assert.equal(f.requests.filter(x=>x.method==='POST').length,0,'do not write-probe untrusted catalog items');
  }
});

test('catalog outage stops coverage, never silently falls back to four fixed boards', async () => {
  const f=fixture({catalogHttpStatus:503});
  await assert.rejects(()=>verifyBoardWriteGateProduction({fetcher:f.fetcher}));
  assert.equal(f.requests.filter(x=>x.method==='POST').length,0);
});

test('duplicates of the four fixed known boards do not cause duplicate probes',async()=>{
  const f=fixture({catalogSites:['cgma','cheonggye','ekodimission','ekodichurch']});
  const result=await verifyBoardWriteGateProduction({fetcher:f.fetcher});
  assert.equal(result.negativeChecks,10);
});

test('invalid pagination fails closed rather than losing unknown future boards',async()=>{
  const f=fixture({catalogOverride:{ok:true,schemaVersion:1,source:'existing_public_board_instances',
    complete:false,nextCursor:'invalid',boards:[]}});
  await assert.rejects(()=>verifyBoardWriteGateProduction({fetcher:f.fetcher}),/continuation cursor/);
  assert.equal(f.requests.filter(x=>x.method==='POST').length,0);
});
