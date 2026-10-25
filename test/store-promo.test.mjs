import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildStorePromoWeek, isoWeekKey, weekStartUtc, slotTime, josa, STORE_PROMO_STORES } from '../store-promo-engine.js';
import { lintMarketingText } from '../marketing-seo-engine.js';
import { handleStorePromoApi } from '../store-promo-runtime.js';

const FACTS = { address:'전남 무안군 청계면 승달산길 37-1', phone:'061-453-8295', hours:{ display:'11:00–22:00' } };

// ---- engine -----------------------------------------------------------------

test('weekly plan: 3 SNS posts (instagram·facebook·threads) on Tue/Thu/Sat KST + 1 Naver blog draft', () => {
  const week = buildStorePromoWeek('jadam', FACTS, { weekKey:'2026-W44' });
  assert.equal(week.posts.length, 4);
  const sns = week.posts.slice(0, 3);
  for (const post of sns) assert.deepEqual(post.variants.map(v => v.channel), ['instagram','facebook','threads']);
  assert.deepEqual(sns.map(p => p.scheduledAt), ['2026-10-27T02:30:00.000Z','2026-10-29T08:30:00.000Z','2026-10-31T02:30:00.000Z']);
  const blog = week.posts[3].variants[0];
  assert.equal(blog.channel, 'naver_blog'); assert.equal(blog.format, 'blog_draft');
  assert.equal(weekStartUtc('2026-W44').toISOString(), '2026-10-25T15:00:00.000Z');
  assert.equal(isoWeekKey(new Date('2026-10-25T14:59:00Z')), '2026-W43');
  assert.equal(isoWeekKey(new Date('2026-10-25T15:00:00Z')), '2026-W44');
  assert.equal(slotTime('2026-W44', 0), '2026-10-27T02:30:00.000Z');
});

test('SEO/AEO/GEO structure: keyword title + first sentence, Q&A headings with direct answers, citable fact block, canonical link', () => {
  for (const key of Object.keys(STORE_PROMO_STORES)) {
    const store = STORE_PROMO_STORES[key];
    const blog = buildStorePromoWeek(key, FACTS, { weekKey:'2026-W44' }).posts.at(-1).variants[0];
    assert.ok(blog.title.startsWith(store.keywords[0]), `${key} title must lead with the primary keyword`);
    assert.ok(blog.body.startsWith(store.keywords[0]), `${key} first sentence must carry the primary keyword`);
    assert.match(blog.body, /■ 핵심 정보/);
    for (const q of ['어디에 있나요?','영업시간은 언제인가요?','어떻게 주문하나요?']) assert.match(blog.body, new RegExp(`## .*${q.replace("?","\\?")}\\n\\S`));
    assert.ok(blog.body.includes(store.canonical));
    assert.ok(blog.body.includes('061-453-8295'));
    assert.doesNotMatch(blog.body, /피자을|디저트을|치킨를/);
  }
  assert.equal(josa('목포대 피자','을','를'), '목포대 피자를');
  assert.equal(josa('목포대 치킨','을','를'), '목포대 치킨을');
});

test('facts only: no invented prices, discounts, rankings or reviews; menu appears only when registered', () => {
  const noMenu = buildStorePromoWeek('jadam', FACTS, { weekKey:'2026-W44' });
  const all = noMenu.posts.flatMap(p => p.variants.map(v => `${v.title}\n${v.body}`)).join('\n');
  assert.doesNotMatch(all, /\d[\d,]*원|할인|무료|1위|최고|최저|후기|리뷰/);
  assert.ok(!noMenu.posts.some(p => p.theme === 'menu'));
  for (const v of noMenu.posts.flatMap(p => p.variants)) assert.equal(lintMarketingText(v.body).length, 0);
  const withMenu = buildStorePromoWeek('pizzamaru', { ...FACTS, menu:[{ name:'불고기피자', price:21900 }, { name:'포테이토피자' }] }, { weekKey:'2026-W44' });
  assert.match(withMenu.posts.at(-1).variants[0].body, /불고기피자\(21,900원\)/);
  assert.throws(() => buildStorePromoWeek('unknown', FACTS));
});

// ---- runtime against all real migrations --------------------------------------

function d1() {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync('migrations').filter(f => f.endsWith('.sql')).sort((a, b) => a.localeCompare(b, 'en'))) db.exec(fs.readFileSync(`migrations/${f}`, 'utf8'));
  const stmt = (sql, args = []) => ({
    bind:(...a) => stmt(sql, a),
    run:async () => { const r = db.prepare(sql).run(...args); return { meta:{ last_row_id:Number(r.lastInsertRowid), changes:Number(r.changes) } }; },
    first:async () => db.prepare(sql).get(...args) ?? null,
    all:async () => ({ results:db.prepare(sql).all(...args) }),
  });
  return { DB:{ prepare:sql => stmt(sql) }, raw:db };
}
function mockAuth(role = 'store_owner') {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id:'u1', email:'owner@example.com', email_confirmed_at:'2026-01-01T00:00:00Z' }), { status:200 });
    if (u.includes('store_operating_space_snapshot')) return new Response(JSON.stringify({ role, store:{ id:'s1', name:'자담치킨 목포대점', address:FACTS.address, phone:FACTS.phone, business_hours:FACTS.hours }, menu:[] }), { status:200 });
    return new Response('{}', { status:404 });
  };
  return () => { globalThis.fetch = original; };
}
const env = d => ({ ALLOW_MUTATIONS:'true', ALLOWED_ORIGINS:'https://ekodi.kr', ...d });
const req = (path, { method = 'GET', store = 'jadam' } = {}) => new Request(`https://ekodi.kr/workspace-api${path}?subject_type=tenant&subject_key=${store}`.replace('/workspace-api', ''), { method, headers:{ authorization:'Bearer t', origin:'https://ekodi.kr' } });

test('ensure creates this week once; approve schedules SNS onto connected channels; blog stays copy-only', async () => {
  const restore = mockAuth(); const e = env(d1());
  try {
    const first = await (await handleStorePromoApi(req('/v1/store-promo/week/ensure', { method:'POST' }), e)).json();
    assert.equal(first.created, 4);
    assert.equal(first.posts.length, 4);
    assert.ok(first.posts.flatMap(p => p.variants).every(v => v.status === 'pending_review'));
    const again = await (await handleStorePromoApi(req('/v1/store-promo/week/ensure', { method:'POST' }), e)).json();
    assert.equal(again.created, 0, 'ensure is idempotent per store-week-post');

    // No channel yet: approval keeps variants approved and reports channel_required.
    const post = first.posts[0];
    const approved = await (await handleStorePromoApi(req(`/v1/store-promo/posts/${post.id}/approve`, { method:'POST' }), e)).json();
    assert.equal(approved.changed, 3);
    assert.ok(approved.scheduling.every(s => s.state === 'channel_required'));

    // Connect Instagram (active) for tenant jadam; scheduling now queues the Instagram variant only.
    const now = new Date().toISOString();
    e.raw.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,created_at,updated_at)
      VALUES('tenant','jadam','instagram','instagram_business','자담치킨 인스타','ig1','ref','active','{}',?,?)`).run(now, now);
    const sched = await (await handleStorePromoApi(req('/v1/store-promo/schedule', { method:'POST' }), e)).json();
    const ig = sched.scheduling.find(s => s.channel === 'instagram');
    assert.equal(ig.state, 'scheduled', JSON.stringify(sched.scheduling));
    const jobs = e.raw.prepare(`SELECT subject_key,status,requested_by FROM marketing_publication_jobs`).all();
    assert.equal(jobs.length, 1); assert.equal(jobs[0].subject_key, 'jadam'); assert.equal(jobs[0].requested_by, 'human');

    // Reject the blog post: nothing is queued for it.
    const blog = first.posts.find(p => p.theme === 'blog');
    const rejected = await (await handleStorePromoApi(req(`/v1/store-promo/posts/${blog.id}/reject`, { method:'POST' }), e)).json();
    assert.equal(rejected.changed, 1);
    const week = await (await handleStorePromoApi(req('/v1/store-promo/week'), e)).json();
    assert.equal(week.posts.find(p => p.theme === 'blog').variants[0].status, 'rejected');
    assert.equal(week.channels.length, 1);
    assert.equal(week.marketingUrl, 'https://ekodi.kr/jadam/marketing');
  } finally { restore(); }
});

test('marketing capability, store isolation, mutation switch and unknown posts are enforced', async () => {
  const e = env(d1());
  let restore = mockAuth('viewer');
  try { assert.equal((await handleStorePromoApi(req('/v1/store-promo/week'), e)).status, 403); } finally { restore(); }
  restore = mockAuth();
  try {
    const made = await (await handleStorePromoApi(req('/v1/store-promo/week/ensure', { method:'POST' }), e)).json();
    const otherStore = await handleStorePromoApi(req(`/v1/store-promo/posts/${made.posts[0].id}/approve`, { method:'POST', store:'pizzamaru' }), e);
    assert.equal(otherStore.status, 404, 'a store cannot approve another store\'s post');
    assert.equal((await handleStorePromoApi(req('/v1/store-promo/week/ensure', { method:'POST' }), env({ ...d1(), ALLOW_MUTATIONS:'false' }))).status, 503);
    assert.equal((await handleStorePromoApi(req('/v1/store-promo/posts/999999/approve', { method:'POST' }), e)).status, 404);
    assert.equal((await handleStorePromoApi(req('/v1/store-promo/week', { store:'evilstore' }), e)).status, 403);
  } finally { restore(); }
});
