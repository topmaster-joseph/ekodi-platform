import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyIndependentBoardLive, LIVE_BOARDS} from '../scripts/verify-independent-board-live.mjs';
import {readFile} from 'node:fs/promises';
import {CHEONGGYE_PUBLICATION_HOLD} from '../region-publication-hold.js';

function fixture({mismatch = false, subscription = true, leak = false, social = false, singlesLeak = false, cheonggyeLeak = false, cheonggyeWeakCache = false} = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({path: url.pathname, method: options.method, authorization: options.headers.authorization});
    const path = url.pathname;
    const site = LIVE_BOARDS.find(x => path.startsWith(x.prefix))?.site;
    const id = 'site:' + site + ':main';
    const headers = {'content-type': 'application/json'};
    if (site) {
      if (site === 'cheonggye' && CHEONGGYE_PUBLICATION_HOLD && !cheonggyeLeak) {
        return new Response('<!doctype html><title>서비스 비공개</title><h1>서비스 비공개</h1>', {
          status:404,
          headers:{
            'content-type':'text/html; charset=utf-8',
            'cache-control':cheonggyeWeakCache?'public, max-age=600':'private, no-store, max-age=0',
            'x-robots-tag':'noindex, nofollow',
            'x-content-type-options':'nosniff',
            'x-ekodi-route':'regional-private-hold',
            'x-ekodi-region-publication':'private-owner-release-required',
          },
        });
      }
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
      paid_brokerage_enabled: false, social_enabled: social, bank_transfer_enabled: false,
    }), {status: 200, headers});
    if (path === '/singles/api/public') return new Response(JSON.stringify({description_only: true}), {status: 200, headers});
    if (path.startsWith('/singles/api/')) return new Response('', {status: social ? (singlesLeak ? 200 : 401) : 503, headers});
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
  assert.deepEqual(result.boards, CHEONGGYE_PUBLICATION_HOLD
    ? ['cgma', 'ekodimission', 'ekodichurch'] : ['cgma', 'cheonggye', 'ekodimission', 'ekodichurch']);
  assert.deepEqual(result.withheldBoards, CHEONGGYE_PUBLICATION_HOLD ? ['cheonggye'] : []);
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

test('Shared Site Core production deploy executes the read-only subpage sentinel after promotion', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: node scripts\/verify-independent-board-live\.mjs/);
  assert.ok(workflow.indexOf('Verify independent board subpages') > workflow.indexOf('\n  deploy:'));
});

test('Cloudflare HTTP 429 immediately stops the live sentinel without retries', async () => {
  let attempts = 0;
  const fetcher = async () => { attempts++; return new Response('', {status: 429}); };
  await assert.rejects(
    () => verifyIndependentBoardLive({fetcher, sleep: async () => {}}),
    /Cloudflare traffic guard 429/,
  );
  assert.equal(attempts, 1);
});

test('singles member features open: anonymous member and bank APIs must still be refused', async () => {
  const {fetcher} = fixture({social: true});
  const result = await verifyIndependentBoardLive({fetcher, sleep: async () => {}});
  assert.equal(result.singlesSocialEnabled, true);
  const leaking = fixture({social: true, singlesLeak: true}).fetcher;
  await assert.rejects(() => verifyIndependentBoardLive({fetcher: leaking, sleep: async () => {}}), /expected 401/);
});

test('owner-held Cheonggye board must never accidentally reopen or become cacheable',async()=>{
  if(!CHEONGGYE_PUBLICATION_HOLD)return;
  const open=fixture({cheonggyeLeak:true}).fetcher;
  await assert.rejects(()=>verifyIndependentBoardLive({fetcher:open,sleep:async()=>{}}),
    /expected 404, got HTTP 200/);
  const cached=fixture({cheonggyeWeakCache:true}).fetcher;
  await assert.rejects(()=>verifyIndependentBoardLive({fetcher:cached,sleep:async()=>{}}),
    /no-store/);
});

test('Control API requires canonical no-store while Site Core preserves private no-store',async()=>{
  const control=JSON.parse(await readFile(new URL('../deploy/manifests/control-api.worker.json',import.meta.url),'utf8'));
  const site=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const byHold=manifest=>(manifest.worker.requests||[]).filter(req=>
    req.headerExpect?.includes('x-ekodi-route: regional-private-hold'));
  const controlProbes=byHold(control),siteProbes=byHold(site);
  assert.equal(controlProbes.length,7);
  assert.equal(siteProbes.length,13);
  for(const probe of controlProbes){
    assert.deepEqual(probe.statuses,[404],probe.url);
    assert.ok(probe.headerExpect.includes('cache-control: no-store'),probe.url);
    assert.ok(probe.headerExpect.includes('x-ekodi-region-publication: private-owner-release-required'),probe.url);
  }
  for(const probe of siteProbes){
    assert.deepEqual(probe.statuses,[404],probe.url);
    assert.ok(probe.headerExpect.includes('cache-control: private, no-store'),probe.url);
    assert.ok(probe.headerExpect.includes('x-ekodi-region-publication: private-owner-release-required'),probe.url);
  }
});
