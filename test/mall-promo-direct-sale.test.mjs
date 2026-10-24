import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { promotionLane, directContent, fetchDirectCandidates } from '../mall-promotion-automation.js';

test('promotion lane mixes affiliate and direct irregularly (~1:1)', () => {
  let direct = 0, total = 0;
  for (let d = 1; d <= 60; d += 1) {
    const day = new Date(Date.UTC(2026, 10, d)).toISOString().slice(0, 10);
    for (const p of ['facebook', 'instagram', 'threads']) { total += 1; if (promotionLane(day, p) === 'direct') direct += 1; }
  }
  assert.ok(direct / total > 0.35 && direct / total < 0.65, `ratio ${direct}/${total}`);
});

test('direct-sale posts never carry the Coupang Partners disclosure and use the mall product link', () => {
  const c = directContent({ name: '수제 비누', oneLine: '천연', price: 9000, publicUrl: 'https://ekodi.kr/ekodimall/p/abc', imageUrl: 'https://ekodi.kr/ekodimall/api/public/media/x' }, 'facebook', '2026-10-25');
  assert.doesNotMatch(c.caption, /쿠팡|파트너스|수수료/);
  assert.match(c.linkUrl, /^https:\/\/ekodi\.kr\/ekodimall\/p\/abc\?utm_source=facebook&utm_medium=social&utm_campaign=direct-20261025$/);
});

test('direct candidate fetch drops affiliate-looking items and fails closed', async () => {
  const env = { MALL_API: { fetch: async () => new Response(JSON.stringify({ products: [
    { shareCode: 'a', publicUrl: 'https://ekodi.kr/ekodimall/p/a', imageUrl: 'https://ekodi.kr/m/a.jpg' },
    { shareCode: 'b', publicUrl: 'https://link.coupang.com/x', imageUrl: 'https://ekodi.kr/m/b.jpg' },
  ] }), { status: 200 }) } };
  assert.deepEqual((await fetchDirectCandidates(env)).map(p => p.shareCode), ['a']);
  assert.deepEqual(await fetchDirectCandidates({ MALL_API: { fetch: async () => { throw new Error('down'); } } }), []);
});

test('mall promotable endpoint only exposes published, in-stock, photographed direct-sale products', async () => {
  const src = await readFile(new URL('../sites/ekodi-mall/api/entry.js', import.meta.url), 'utf8');
  assert.match(src, /status='published' AND sale_type='direct' AND COALESCE\(affiliate_url,''\)='' AND stock_quantity>0 AND images_json<>'\[\]'/);
  const toml = await readFile(new URL('../wrangler.marketing-growth.toml', import.meta.url), 'utf8');
  assert.match(toml, /binding = "MALL_API"\nservice = "ekodi-mall-api"/);
});
