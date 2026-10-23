// EKODI AI Social Growth Phase 8 — 성과 수집 · 유입/수익 귀속 · 성과 리포트 · 네이버 수동 게시 · IndexNow.
// 실제 루트 마이그레이션 체인(node:sqlite) + 주입 fetch, 네트워크 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  collectPostMetrics, runScheduledMetricsCollection, decryptVaultToken, resolveChannelCredential, backoffDelayMs, METRICS_TASK_KEY, kstDate,
} from '../marketing-metrics-collector.js';
import { captureTrackedLanding, observeAttributedResponse, TRACKING_COOKIE } from '../marketing-attribution-capture.js';
import { buildPerformanceReport, rankForRecommendation, fetchMallOrdersViaBinding } from '../marketing-performance-report.js';
import { submitChangedUrls, runScheduledIndexNow, batches, INDEXNOW_TASK_KEY } from '../marketing-indexnow-scheduler.js';
import { handleMarketingAdminControl } from '../marketing-admin-control.js';
import { canonicalTrackingQueryRedirect } from '../canonical-query-policy.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const MIGRATION_FILES = fs.readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b, 'en'));
const ADMIN_TOKEN = 'phase8-admin-session-token';
const NOW = Date.parse('2026-10-24T03:00:00.000Z'); // KST 12:00

function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of MIGRATION_FILES) db.exec(fs.readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  const statement = (sql, params = []) => ({
    bind:(...args) => statement(sql, args),
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results:db.prepare(sql).all(...params) }; },
    async run() { const r = db.prepare(sql).run(...params); return { meta:{ changes:Number(r.changes), last_row_id:Number(r.lastInsertRowid) } }; },
  });
  return { raw:db, prepare:sql => statement(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 관리자 세션 · 플랜 · 채널 4종 · 콘텐츠 · 변형 · 게시 완료 작업.
async function seed() {
  const env = { DB:d1() };
  const raw = env.DB.raw;
  const now = new Date(NOW).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  raw.prepare(`INSERT INTO admins(email,password_hash,password_salt,birth_hash,birth_salt,role,created_at) VALUES(?,?,?,?,?,?,?)`).run('admin@example.org', 'x', 'x', 'x', 'x', 'super_admin', now);
  raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256(ADMIN_TOKEN), 1, future, now);
  raw.prepare(`INSERT INTO service_subscriptions(subject_type,subject_key,site,plan_id,status,monthly_fee,created_at,updated_at) VALUES('tenant','p8-lab','marketing','plus','active',0,?,?)`).run(now, now);
  raw.prepare(`INSERT INTO marketing_content_items(subject_type,subject_key,title,caption,created_at,updated_at) VALUES('tenant','p8-lab','원본','본문',?,?)`).run(now, now);
  const channel = (provider, type, credentialRef, config = '{}') => Number(raw.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,created_at,updated_at)
    VALUES('tenant','p8-lab',?,?,?,?,?,'active',?,?,?)`).run(provider, type, `${provider} ch`, `acct-${credentialRef || provider}`, credentialRef, config, now, now).lastInsertRowid);
  const ch = {
    facebook:channel('meta', 'facebook_page', 'FB_SECRET'),
    instagram:channel('meta', 'instagram_business', 'IG_SECRET'),
    threads:channel('threads', 'threads_profile', 'TH_SECRET'),
    youtube:channel('youtube', 'youtube_channel', ''),
    notoken:channel('meta', 'facebook_page', 'MISSING_SECRET'),
  };
  const variant = (channelName, code, status = 'published', extra = {}) => Number(raw.prepare(`INSERT INTO marketing_content_variants(content_id,channel,format,title,body,hashtags_json,tracking_code,status,subject_type,subject_key,created_at,updated_at,content_cost_krw)
    VALUES(1,?,?,?,?,?,?,?,'tenant','p8-lab',?,?,?)`).run(channelName, extra.format || 'feed', extra.title || `${channelName} 콘텐츠`, extra.body || '본문', JSON.stringify(extra.hashtags || []), code, status, now, now, extra.cost || 0).lastInsertRowid);
  const job = (channelId, variantId, code, postId, publishedAt = now) => Number(raw.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,content_id,channel_id,schedule_kind,scheduled_at,status,requested_by,variant_id,tracking_code,external_post_id,published_at,created_at,updated_at)
    VALUES('tenant','p8-lab',1,?,'immediate',?,'published','human',?,?,?,?,?,?)`).run(channelId, now, variantId, code, postId, publishedAt, now, now).lastInsertRowid);
  const v = {
    facebook:variant('facebook', 'ekfb000001'), instagram:variant('instagram', 'ekig000001', 'published', { cost:10000 }),
    threads:variant('threads', 'ekth000001'), youtube:variant('youtube', 'ekyt000001'), notoken:variant('facebook', 'eknt000001'),
  };
  const j = {
    facebook:job(ch.facebook, v.facebook, 'ekfb000001', 'page_1_post_1'), instagram:job(ch.instagram, v.instagram, 'ekig000001', '17900000001'),
    threads:job(ch.threads, v.threads, 'ekth000001', 'th_1'), youtube:job(ch.youtube, v.youtube, 'ekyt000001', 'yt_video_1'),
    notoken:job(ch.notoken, v.notoken, 'eknt000001', 'page_1_post_2'),
    old:job(ch.facebook, null, null, 'page_1_old', '2026-08-01T00:00:00.000Z'),
  };
  Object.assign(env, {
    FB_SECRET:JSON.stringify({ accessToken:'fb-token', graphVersion:'v25.0' }),
    IG_SECRET:JSON.stringify({ accessToken:'ig-token', graphVersion:'v25.0' }),
    TH_SECRET:JSON.stringify({ accessToken:'th-token' }),
    YOUTUBE_API_KEY:'yt-key',
  });
  return { env, raw, ch, v, j };
}

function providerFetch({ rateLimitIg = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    assert.ok(/^https:\/\/(graph\.facebook\.com|graph\.threads\.net|www\.googleapis\.com)\//.test(u), `unexpected network ${u}`);
    if (u.includes('17900000001')) {
      if (rateLimitIg) return Response.json({ error:{ message:'Application request limit reached', code:4 } }, { status:400 });
      return Response.json({ data:[{ name:'views', values:[{ value:1200 }] }, { name:'reach', values:[{ value:900 }] }, { name:'saved', values:[{ value:12 }] }, { name:'shares', values:[{ value:7 }] }, { name:'likes', values:[{ value:80 }] }, { name:'comments', values:[{ value:9 }] }] });
    }
    if (u.includes('page_1_post_1/insights')) return Response.json({ data:[{ name:'post_media_view', values:[{ value:500 }] }, { name:'post_total_media_view_unique', values:[{ value:420 }] }, { name:'post_clicks', values:[{ value:33 }] }] });
    if (u.includes('page_1_post_1')) return Response.json({ shares:{ count:4 }, reactions:{ summary:{ total_count:25 } }, comments:{ summary:{ total_count:3 } } });
    if (u.startsWith('https://graph.threads.net/')) return Response.json({ data:[{ name:'views', total_value:{ value:300 } }, { name:'likes', total_value:{ value:20 } }, { name:'replies', total_value:{ value:2 } }, { name:'reposts', total_value:{ value:1 } }, { name:'quotes', total_value:{ value:1 } }] });
    if (u.startsWith('https://www.googleapis.com/youtube/v3/videos')) {
      assert.ok(u.includes('key=yt-key'), 'YouTube uses the cheap Data API key path');
      assert.ok(!init.headers?.authorization);
      return Response.json({ items:[{ statistics:{ viewCount:'2500', likeCount:'90', commentCount:'11' } }] });
    }
    return Response.json({ error:{ message:'not found' } }, { status:404 });
  };
  return { fetchImpl, calls };
}

const metricsRows = raw => raw.prepare('SELECT job_id,channel,metric_date,views,reach,likes,comments,shares,saves,clicks,video_views,source,raw_json FROM marketing_post_metrics ORDER BY job_id').all().map(r => ({ ...r }));

test('migration chain applies Phase 8 additive schema', () => {
  const { DB } = { DB:d1() };
  const cols = DB.raw.prepare('PRAGMA table_info(marketing_content_variants)').all().map(r => r.name);
  for (const c of ['content_cost_krw','external_post_url','published_at']) assert.ok(cols.includes(c), c);
  const tables = DB.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['marketing_scheduler_state','marketing_metrics_backoff','marketing_indexnow_url_state']) assert.ok(tables.includes(t), t);
  assert.ok(MIGRATION_FILES.some(name => /^02\d\d_marketing_performance_naver_indexnow\.sql$/.test(name)));
});

test('metrics collector upserts one provider_api row per job/day for every channel and stays idempotent', async () => {
  const { env, raw, j } = await seed();
  const { fetchImpl } = providerFetch();
  const first = await collectPostMetrics(env, { fetch:fetchImpl, now:NOW });
  assert.equal(first.ok, true);
  assert.equal(first.collected, 4);
  assert.equal(first.skips.TOKEN_UNAVAILABLE, 1, 'channel without a token is skipped, not failed');
  assert.deepEqual(first.channels, { facebook:1, instagram:1, threads:1, youtube:1 });
  let rows = metricsRows(raw);
  assert.equal(rows.length, 4, 'job older than 30 days is not collected');
  assert.ok(!rows.some(r => r.job_id === j.old || r.job_id === j.notoken));
  const byJob = Object.fromEntries(rows.map(r => [r.job_id, r]));
  assert.deepEqual([byJob[j.facebook].views, byJob[j.facebook].reach, byJob[j.facebook].likes, byJob[j.facebook].comments, byJob[j.facebook].shares, byJob[j.facebook].clicks], [500, 420, 25, 3, 4, 33]);
  assert.deepEqual([byJob[j.instagram].views, byJob[j.instagram].reach, byJob[j.instagram].saves, byJob[j.instagram].shares], [1200, 900, 12, 7]);
  assert.deepEqual([byJob[j.threads].views, byJob[j.threads].likes, byJob[j.threads].comments, byJob[j.threads].shares], [300, 20, 2, 2]);
  assert.deepEqual([byJob[j.youtube].views, byJob[j.youtube].video_views, byJob[j.youtube].likes], [2500, 2500, 90]);
  assert.ok(rows.every(r => r.source === 'provider_api' && r.metric_date === kstDate(NOW)));
  for (const r of rows) for (const secret of ['fb-token','ig-token','th-token','yt-key']) assert.ok(!r.raw_json.includes(secret), 'tokens are never stored');

  await collectPostMetrics(env, { fetch:fetchImpl, now:NOW + 3600_000 });
  assert.equal(metricsRows(raw).length, 4, 'same KST day → UNIQUE(job_id,metric_date,source) upsert');
  await collectPostMetrics(env, { fetch:fetchImpl, now:NOW + 86400_000 });
  rows = metricsRows(raw);
  assert.equal(rows.length, 8, 'next day → new daily snapshot');
});

test('rate limits back off only the limited channel and recover after the backoff window', async () => {
  const { env, raw, j } = await seed();
  const limited = providerFetch({ rateLimitIg:true });
  const run1 = await collectPostMetrics(env, { fetch:limited.fetchImpl, now:NOW });
  assert.equal(run1.rateLimited, 1);
  assert.equal(run1.collected, 3, 'other channels continue');
  const backoff = raw.prepare('SELECT * FROM marketing_metrics_backoff').all();
  assert.equal(backoff.length, 1);
  assert.match(backoff[0].channel_key, /^instagram:/);
  assert.equal(backoff[0].failures, 1);
  assert.equal(Date.parse(backoff[0].retry_after) - NOW, backoffDelayMs(1));

  const ok = providerFetch();
  const run2 = await collectPostMetrics(env, { fetch:ok.fetchImpl, now:NOW + 60_000 });
  assert.equal(run2.backedOff, 1, 'IG is skipped while backoff is active');
  assert.ok(!ok.calls.some(u => u.includes('17900000001')));

  const run3 = await collectPostMetrics(env, { fetch:limited.fetchImpl, now:NOW + backoffDelayMs(1) + 1000 });
  assert.equal(run3.rateLimited, 1);
  assert.equal(raw.prepare('SELECT failures FROM marketing_metrics_backoff').get().failures, 2, 'exponential failures counter');
  assert.ok(backoffDelayMs(2) > backoffDelayMs(1));
  assert.ok(backoffDelayMs(50) <= 24 * 3600_000);

  const run4 = await collectPostMetrics(env, { fetch:ok.fetchImpl, now:NOW + 2 * 86400_000 });
  assert.equal(run4.collected, 4);
  assert.equal(raw.prepare('SELECT count(*) AS n FROM marketing_metrics_backoff').get().n, 0, 'success clears the backoff');
  assert.ok(metricsRows(raw).some(r => r.job_id === j.instagram));
});

test('collector never throws out of the cron and runs on a 6-hour state cadence', async () => {
  assert.equal((await collectPostMetrics({}, { now:NOW })).ok, false);
  const throwing = async () => { throw new Error('network down'); };
  const { env, raw } = await seed();
  const summary = await collectPostMetrics(env, { fetch:throwing, now:NOW });
  assert.equal(summary.failed, 4);
  const { fetchImpl } = providerFetch();
  const a = await runScheduledMetricsCollection(env, { fetch:fetchImpl, now:NOW });
  assert.equal(a.ran, true);
  const b = await runScheduledMetricsCollection(env, { fetch:fetchImpl, now:NOW + 3600_000 });
  assert.deepEqual([b.ran, b.reason], [false, 'NOT_DUE']);
  const c = await runScheduledMetricsCollection(env, { fetch:fetchImpl, now:NOW + 6 * 3600_000 });
  assert.equal(c.ran, true);
  const state = raw.prepare('SELECT * FROM marketing_scheduler_state WHERE task_key=?').get(METRICS_TASK_KEY);
  assert.equal(state.last_status, 'ok');
  const broken = await runScheduledMetricsCollection({ DB:{ prepare() { throw new Error('boom'); } } }, { now:NOW });
  assert.equal(broken.ran, false);
});

test('vault tokens (marketing-growth v1 format) decrypt with the provider app secret; missing secret → skip', async () => {
  const secret = 'meta-app-secret';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), { name:'AES-GCM' }, false, ['encrypt']);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode('vault-access-token')));
  const b64 = bytes => btoa(String.fromCharCode(...bytes));
  const cipher = `v1.${b64(iv)}.${b64(data)}`;
  assert.equal(await decryptVaultToken({ META_APP_SECRET:secret }, 'instagram', cipher), 'vault-access-token');
  assert.equal(await decryptVaultToken({}, 'instagram', cipher), '');
  const { env, raw } = await seed();
  raw.prepare(`INSERT INTO marketing_oauth_connections(subject_type,subject_key,provider,resource_type,external_id,token_ciphertext,status,created_at,updated_at) VALUES('tenant','p8-lab','instagram','ig_user','1',?,'active','x','x')`).run(cipher);
  const channel = { provider:'instagram', channel_type:'instagram_business', subject_type:'tenant', subject_key:'p8-lab', config_json:JSON.stringify({ credentialMode:'oauth-vault', oauthConnectionId:1 }) };
  assert.equal((await resolveChannelCredential({ ...env, META_APP_SECRET:secret }, channel)).accessToken, 'vault-access-token');
  assert.equal(await resolveChannelCredential(env, channel), null);
});

// ---------------------------------------------------------------- 유입 귀속

function ctxCollector() {
  const pending = [];
  return { ctx:{ waitUntil:promise => pending.push(promise) }, settle:() => Promise.all(pending.splice(0)) };
}
const landing = (path, { ua = 'Mozilla/5.0 test', ip = '203.0.113.7', cookie = '' } = {}) => new Request(`https://ekodi.kr${path}`, { headers:{ 'user-agent':ua, 'cf-connecting-ip':ip, ...(cookie ? { cookie } : {}) } });
const attributions = raw => raw.prepare('SELECT tracking_code,event_type,external_ref,idempotency_key,metadata_json,job_id,variant_id,channel,value_krw,revenue_status FROM marketing_traffic_attributions ORDER BY id').all().map(r => ({ ...r }));

test('tracked landing records visit + product_view once per visitor/day, sets a first-party cookie and stores no PII', async () => {
  const { env, raw, v, j } = await seed();
  const { ctx, settle } = ctxCollector();
  const request = landing('/ekodimall/p/SHARE1?utm_source=instagram&utm_medium=social&utm_campaign=autumn&utm_content=ekig000001');
  const redirect = canonicalTrackingQueryRedirect(request);
  assert.equal(redirect.status, 308);
  const response = captureTrackedLanding(request, env, ctx, redirect, { now:NOW });
  await settle();
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://ekodi.kr/ekodimall/p/SHARE1');
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`^${TRACKING_COOKIE}=ekig000001; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax$`));
  let rows = attributions(raw);
  assert.deepEqual(rows.map(r => r.event_type), ['visit','product_view']);
  assert.ok(rows.every(r => r.variant_id === v.instagram && r.job_id === j.instagram && r.channel === 'instagram' && r.revenue_status === 'none' && r.value_krw === 0));
  for (const r of rows) for (const pii of ['203.0.113.7','Mozilla']) { assert.ok(!r.idempotency_key.includes(pii)); assert.ok(!r.metadata_json.includes(pii)); }

  captureTrackedLanding(request, env, ctx, canonicalTrackingQueryRedirect(request), { now:NOW + 60_000 });
  await settle();
  assert.equal(attributions(raw).length, 2, 'same visitor, same KST day → deduped');
  captureTrackedLanding(landing('/ekodimall?utm_content=ekig000001', { ua:'Other UA' }), env, ctx, canonicalTrackingQueryRedirect(landing('/ekodimall?utm_content=ekig000001', { ua:'Other UA' })), { now:NOW });
  await settle();
  assert.equal(attributions(raw).filter(r => r.event_type === 'visit').length, 2, 'different visitor counts');
  const withCookie = landing('/ekodimall?utm_content=ekfb000001', { cookie:`${TRACKING_COOKIE}=ekig000001` });
  const kept = captureTrackedLanding(withCookie, env, ctx, canonicalTrackingQueryRedirect(withCookie), { now:NOW });
  await settle();
  assert.equal(kept.headers.get('set-cookie'), null, 'first touch is preserved');

  const unknown = landing('/ekodimall?utm_content=ekunknown99');
  const untouched = captureTrackedLanding(unknown, env, ctx, canonicalTrackingQueryRedirect(unknown), { now:NOW });
  await settle();
  assert.equal(untouched.status, 308);
  assert.ok(!attributions(raw).some(r => r.tracking_code === 'ekunknown99'), 'unknown codes never pollute the ledger');
  const failing = { DB:{ prepare() { throw new Error('d1 down'); } } };
  const safe = captureTrackedLanding(request, failing, ctx, redirect, { now:NOW });
  await settle();
  assert.equal(safe.status, 308, 'capture failures never break page delivery');
});

test('affiliate click redirects and mall order creation are attributed via the cookie with dedupe', async () => {
  const { env, raw } = await seed();
  const { ctx, settle } = ctxCollector();
  const cookie = `${TRACKING_COOKIE}=ekfb000001`;
  const click = new Request('https://ekodi.kr/api/affiliate/public/click/77?storefront=ekodi-mall', { headers:{ cookie, 'user-agent':'ua', 'cf-connecting-ip':'198.51.100.1' } });
  const redirect = new Response(null, { status:302, headers:{ location:'https://link.coupang.com/a/x' } });
  assert.equal(observeAttributedResponse(click, env, ctx, redirect, { now:NOW }), redirect, 'response object is passed through untouched');
  observeAttributedResponse(click, env, ctx, new Response(null, { status:302 }), { now:NOW + 1000 });
  observeAttributedResponse(click, env, ctx, new Response('{}', { status:404 }), { now:NOW });
  const noCookie = new Request('https://ekodi.kr/api/affiliate/public/click/78');
  observeAttributedResponse(noCookie, env, ctx, new Response(null, { status:302 }), { now:NOW });
  await settle();
  let rows = attributions(raw);
  assert.deepEqual(rows.map(r => [r.event_type, r.external_ref]), [['affiliate_click', 'storefront:77']]);

  const order = new Request('https://ekodi.kr/ekodimall/api/public/orders', { method:'POST', headers:{ cookie, 'content-type':'application/json' }, body:'{}' });
  const created = Response.json({ order:{ id:'ord_abc123', status:'payment_pending' } }, { status:201 });
  const passed = observeAttributedResponse(order, env, ctx, created, { now:NOW });
  assert.equal((await passed.json()).order.id, 'ord_abc123', 'client still reads the original body');
  await settle();
  rows = attributions(raw);
  assert.deepEqual(rows.at(-1).event_type, 'order');
  assert.equal(rows.at(-1).external_ref, 'mall_order:ord_abc123');
});

// ---------------------------------------------------------------- 성과 리포트

async function seedReport() {
  const s = await seed();
  const { env, raw } = s;
  const { fetchImpl } = providerFetch();
  await collectPostMetrics(env, { fetch:fetchImpl, now:NOW });
  const at = new Date(NOW).toISOString();
  const add = (code, type, ref, value = 0, status = 'none') => raw.prepare(`INSERT INTO marketing_traffic_attributions(tracking_code,event_type,external_ref,idempotency_key,value_krw,revenue_status,occurred_at,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(code, type, ref, `${type}:${code}:${ref}:${Math.random()}`, value, status, at, at);
  for (let i = 0; i < 5; i++) add('ekfb000001', 'visit', '');
  for (let i = 0; i < 4; i++) add('ekfb000001', 'affiliate_click', `storefront:${i}`);
  add('ekfb000001', 'affiliate_conversion', 'coupang:est', 1200, 'estimated');
  add('ekig000001', 'visit', '');
  add('ekig000001', 'order', 'mall_order:ord_paid');
  add('ekth000001', 'order', 'mall_order:ord_refunded');
  raw.prepare(`INSERT OR IGNORE INTO affiliate_accounts(id,provider_key,owner_key,display_name,created_at,updated_at) VALUES('coupang-ekodibiz','coupang_partners','ekodibiz','Coupang',?,?)`).run(at, at);
  raw.prepare(`INSERT INTO affiliate_daily_metrics(account_id,metric_date,clicks,orders,revenue_krw,source,created_at,updated_at) VALUES('coupang-ekodibiz','2026-10-20',100,3,5000,'coupang_partner_api',?,?)`).run(at, at);
  raw.prepare(`INSERT INTO affiliate_daily_metrics(account_id,metric_date,clicks,orders,revenue_krw,source,created_at,updated_at) VALUES('coupang-ekodibiz','2026-10-21',0,0,999,'manual',?,?)`).run(at, at);
  return s;
}
const mallOrders = async () => ({ connected:true, reason:'', orders:[
  { id:'ord_paid', status:'paid', grossAmount:30000 },
  { id:'ord_refunded', status:'refunded', grossAmount:15000 },
  { id:'ord_partial', status:'partially_refunded', grossAmount:20000 },
  { id:'ord_other', status:'paid', grossAmount:8000 },
] });

test('performance report keeps estimated, confirmed and unattributed revenue strictly separate', async () => {
  const { env, v } = await seedReport();
  const report = await buildPerformanceReport(env, { from:'2026-10-01', to:'2026-10-24', now:NOW, fetchMallOrders:mallOrders });
  const item = id => report.items.find(row => row.variantId === id);
  const fb = item(v.facebook);
  assert.equal(fb.visits, 5);
  assert.equal(fb.affiliateClicks, 4);
  assert.equal(fb.estimatedFromEventsKrw, 1200);
  assert.equal(fb.estimatedFromEpcKrw, 200, '4 clicks × 50원 EPC (5000/100)');
  assert.equal(fb.estimatedKrw, 1400);
  assert.equal(fb.confirmedKrw, 0, 'Coupang reported commission is never pushed onto a post');
  const ig = item(v.instagram);
  assert.equal(ig.confirmedDirectSaleKrw, 30000);
  assert.equal(ig.confirmedKrw, 30000);
  assert.equal(ig.estimatedKrw, 0);
  assert.equal(ig.costKrw, 10000);
  assert.equal(ig.roi, 2);
  assert.equal(item(v.threads).confirmedKrw, 0, 'refunded order nets to zero');
  assert.equal(report.totals.attributed.confirmedKrw, 30000);
  assert.equal(report.totals.attributed.estimatedKrw, 1400);
  assert.equal(report.totals.unattributed.coupangReportedKrw, 5000, 'only coupang_partner_api source; manual rows excluded');
  assert.equal(report.totals.unattributed.directSaleKrw, 8000);
  assert.equal(report.totals.unattributed.directSalePartialRefundOrders, 1, 'partial refunds are flagged, not guessed');
  assert.equal(report.totals.unattributed.confirmedKrw, 13000);
  assert.equal(report.totals.confirmedTotalKrw, 43000);
  assert.equal(report.totals.estimatedTotalKrw, 1400);
  assert.equal(report.safety.estimatedAndConfirmedMixed, false);
  assert.equal(report.directSale.connected, true);
  const fbMetrics = item(v.facebook);
  assert.equal(fbMetrics.views, 500);
  assert.equal(fbMetrics.metricsSource, 'provider_api');
});

test('direct-sale revenue is zero with a not-connected flag when the Control API has no MALL_API binding', async () => {
  const { env } = await seedReport();
  const report = await buildPerformanceReport(env, { from:'2026-10-01', to:'2026-10-24', now:NOW });
  assert.deepEqual(report.directSale, { connected:false, reason:'MALL_API_BINDING_MISSING', orders:0, truncated:false });
  assert.equal(report.totals.unattributed.directSaleKrw, 0);
  assert.equal(report.totals.attributed.confirmedKrw, 0);
  assert.equal((await fetchMallOrdersViaBinding({ MALL_API:{ fetch:async () => Response.json({}) } }, { from:'2026-10-01', to:'2026-10-02' })).reason, 'MALL_INTERNAL_TOKEN_MISSING');
  let seen = null;
  const bound = { MALL_INTERNAL_ATTRIBUTION_TOKEN:'tok', MALL_API:{ fetch:async request => { seen = request; return Response.json({ orders:[{ id:'x', status:'paid', grossAmount:1 }] }); } } };
  const connected = await fetchMallOrdersViaBinding(bound, { from:'2026-10-01', to:'2026-10-02' });
  assert.equal(connected.connected, true);
  assert.equal(seen.headers.get('x-ekodi-mall-internal-token'), 'tok');
  assert.match(new URL(seen.url).pathname, /^\/api\/internal\/marketing\/orders$/);
});

test('recommendation ranks by revenue per view then engagement, never by raw views', () => {
  const ranked = rankForRecommendation([
    { key:'a', views:100000, revenuePerView:0, engagementRate:0.001, confirmedKrw:0, estimatedKrw:0, engagement:100 },
    { key:'b', views:100, revenuePerView:5, engagementRate:0.01, confirmedKrw:500, estimatedKrw:0, engagement:1 },
    { key:'c', views:50, revenuePerView:0, engagementRate:0.2, confirmedKrw:0, estimatedKrw:0, engagement:10 },
  ]);
  assert.deepEqual(ranked.map(r => r.key), ['b', 'c', 'a']);
});

const adminCall = (env, method, path, body, token = ADMIN_TOKEN) => handleMarketingAdminControl(new Request(`https://ekodi.kr${path}`, {
  method, headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}),
}), env);

test('GET /api/marketing/admin/performance is admin-only and read-only', async () => {
  const { env } = await seedReport();
  assert.equal((await adminCall(env, 'GET', '/api/marketing/admin/performance?from=2026-10-01&to=2026-10-24', null, '')).status, 401);
  const ok = await adminCall(env, 'GET', '/api/marketing/admin/performance?from=2026-10-01&to=2026-10-24');
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.ok(Array.isArray(body.items) && body.totals.attributed);
  assert.equal((await adminCall(env, 'POST', '/api/marketing/admin/performance', {})).status, 405);
  assert.equal((await adminCall(env, 'GET', '/api/marketing/admin/performance?from=2026-10-24&to=2026-01-01')).status, 400);
  const source = fs.readFileSync(new URL('../marketing-admin-control.js', import.meta.url), 'utf8');
  assert.ok(!source.includes("request.method === 'POST'"), 'marketing-admin-control.js stays free of POST handlers');
});

// ---------------------------------------------------------------- 네이버 블로그 수동 게시

test('Naver manual capture is admin-only, validates the URL and publishes the variant (and its job)', async () => {
  const { env, raw, ch } = await seed();
  const now = new Date(NOW).toISOString();
  const naver = Number(raw.prepare(`INSERT INTO marketing_content_variants(content_id,channel,format,title,body,hashtags_json,tracking_code,disclosure_text,status,subject_type,subject_key,created_at,updated_at)
    VALUES(1,'naver_blog','blog_draft','가을 텀블러 가이드','본문입니다.','["청계면","텀블러"]','eknv000001','[광고] 제휴 링크 포함','approved','tenant','p8-lab',?,?)`).run(now, now).lastInsertRowid);
  const pending = Number(raw.prepare(`INSERT INTO marketing_content_variants(content_id,channel,format,title,body,tracking_code,status,subject_type,subject_key,created_at,updated_at)
    VALUES(1,'naver_blog','blog_draft','대기','본문','eknv000002','pending_review','tenant','p8-lab',?,?)`).run(now, now).lastInsertRowid);
  const naverChannel = Number(raw.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,status,config_json,created_at,updated_at) VALUES('tenant','p8-lab','naver','naver_blog','N','active','{}',?,?)`).run(now, now).lastInsertRowid);
  const withJob = Number(raw.prepare(`INSERT INTO marketing_content_variants(content_id,channel,format,title,body,tracking_code,status,subject_type,subject_key,created_at,updated_at)
    VALUES(1,'naver_blog','blog_draft','작업 있음','본문','eknv000003','scheduled','tenant','p8-lab',?,?)`).run(now, now).lastInsertRowid);
  const job = Number(raw.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,content_id,channel_id,schedule_kind,scheduled_at,status,requested_by,variant_id,tracking_code,created_at,updated_at)
    VALUES('tenant','p8-lab',1,?,'immediate',?,'queued','human',?,'eknv000003',?,?)`).run(naverChannel, now, withJob, now, now).lastInsertRowid);
  const path = id => `/api/marketing/admin/studio/variants/${id}/naver-published`;

  assert.equal((await adminCall(env, 'GET', '/api/marketing/admin/studio/naver', null, '')).status, 401);
  const list = await (await adminCall(env, 'GET', '/api/marketing/admin/studio/naver')).json();
  assert.equal(list.writeUrl, 'https://blog.naver.com/');
  assert.equal(list.officialWriteApi, false);
  const listed = list.variants.find(row => row.id === naver);
  assert.equal(listed.copy.hashtags, '#청계면 #텀블러');
  assert.ok(listed.copy.body.startsWith('[광고] 제휴 링크 포함'), 'disclosure stays first in the copied body');
  assert.ok(!list.variants.some(row => row.id === pending), 'pending_review drafts are not offered for manual posting');

  assert.equal((await adminCall(env, 'POST', path(naver), { url:'https://blog.naver.com/ekodi/223456789' }, '')).status, 401);
  for (const bad of ['http://blog.naver.com/ekodi/1', 'https://evil.example/blog.naver.com', 'https://blog.naver.com/', 'javascript:alert(1)']) {
    const res = await adminCall(env, 'POST', path(naver), { url:bad });
    assert.equal(res.status, 400, bad);
  }
  assert.equal((await adminCall(env, 'POST', path(pending), { url:'https://blog.naver.com/ekodi/1' })).status, 409);
  assert.equal((await adminCall(env, 'POST', path(1), { url:'https://blog.naver.com/ekodi/1' })).status, 409, 'non-naver variant');
  const saved = await adminCall(env, 'POST', path(naver), { url:'https://m.blog.naver.com/ekodi/223456789#comment' });
  assert.equal(saved.status, 200);
  const row = raw.prepare('SELECT status,external_post_url,published_at FROM marketing_content_variants WHERE id=?').get(naver);
  assert.deepEqual([row.status, row.external_post_url], ['published', 'https://m.blog.naver.com/ekodi/223456789']);
  assert.ok(row.published_at);
  assert.equal((await adminCall(env, 'POST', path(naver), { url:'https://blog.naver.com/ekodi/223456790' })).status, 200, 'URL can be corrected');

  assert.equal((await adminCall(env, 'POST', path(withJob), { url:'https://blog.naver.com/ekodi/42' })).status, 200);
  const jobRow = raw.prepare('SELECT status,external_post_url,published_at FROM marketing_publication_jobs WHERE id=?').get(job);
  assert.deepEqual([jobRow.status, jobRow.external_post_url], ['published', 'https://blog.naver.com/ekodi/42']);
  const audit = raw.prepare("SELECT count(*) AS n FROM marketing_publication_audit WHERE action='studio_naver_post_captured'").get();
  assert.equal(audit.n, 3);
  void ch;
});

// ---------------------------------------------------------------- IndexNow

function indexNowFetch({ naverStatus = 200 } = {}) {
  const posts = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://ekodi.kr/ekodimall/api/public/products')) {
      return Response.json({ products:[{ shareCode:'SHARE1', product:{ name:'텀블러', price:15000 } }, { shareCode:'SHARE2', product:{ name:'머그', price:9000 } }, { shareCode:'bad code!', product:{} }] });
    }
    assert.ok(['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow'].includes(u), `unexpected network ${u}`);
    const body = JSON.parse(init.body);
    posts.push({ url:u, body });
    return new Response('', { status:u.includes('naver') ? naverStatus : 202 });
  };
  return { fetchImpl, posts };
}
const registryOf = resources => async () => ({ resources });

test('IndexNow submits only changed canonical URLs, in bounded batches, to Naver and IndexNow', async () => {
  const { env, raw } = await seed();
  const resources = [
    { url:'https://ekodi.kr/', updatedAt:'2026-10-01' },
    { url:'https://ekodi.kr/ekodimall', updatedAt:'2026-10-01' },
    { url:'https://ekodi.kr/books?x=1', updatedAt:'2026-10-01' },
    { url:'https://other.example/', updatedAt:'2026-10-01' },
  ];
  const first = indexNowFetch();
  const run1 = await submitChangedUrls(env, { fetch:first.fetchImpl, now:NOW, registry:registryOf(resources), batchSize:2 });
  assert.equal(run1.candidates, 5, 'registry(2 canonical) + picks + 2 mall products; query/host-mismatched URLs dropped');
  assert.equal(run1.submitted, 5);
  assert.equal(first.posts.length, 6, '3 batches × 2 endpoints');
  for (const post of first.posts) {
    assert.equal(post.body.host, 'ekodi.kr');
    assert.ok(post.body.urlList.length <= 2);
    assert.match(post.body.keyLocation, /^https:\/\/ekodi\.kr\/[0-9a-f]{32}\.txt$/);
  }
  const all = first.posts.filter(p => p.url.includes('naver')).flatMap(p => p.body.urlList);
  assert.ok(all.includes('https://ekodi.kr/ekodimall/p/SHARE1') && all.includes('https://ekodi.kr/ekodimall/picks'));

  const second = indexNowFetch();
  const run2 = await submitChangedUrls(env, { fetch:second.fetchImpl, now:NOW + 3600_000, registry:registryOf(resources), batchSize:2 });
  assert.equal(run2.changed, 0);
  assert.equal(second.posts.length, 0, 'nothing changed → nothing submitted');

  resources[1] = { url:'https://ekodi.kr/ekodimall', updatedAt:'2026-10-24' };
  const third = indexNowFetch({ naverStatus:429 });
  const run3 = await submitChangedUrls(env, { fetch:third.fetchImpl, now:NOW + 7200_000, registry:registryOf(resources) });
  assert.equal(run3.changed, 1);
  assert.equal(run3.failedBatches, 1);
  const fourth = indexNowFetch();
  const run4 = await submitChangedUrls(env, { fetch:fourth.fetchImpl, now:NOW + 9000_000, registry:registryOf(resources) });
  assert.equal(run4.submitted, 1, 'a failed Naver batch is retried next run');
  assert.deepEqual(fourth.posts[0].body.urlList, ['https://ekodi.kr/ekodimall']);
  assert.equal(raw.prepare('SELECT count(*) AS n FROM marketing_indexnow_url_state').get().n, 5);
  assert.equal(batches(Array.from({ length:25000 }, (_, i) => i), 50000).length, 3, 'never above the 10,000-URL IndexNow limit');
});

test('IndexNow daily schedule runs once per KST day after 04:00 and never throws', async () => {
  const { env } = await seed();
  const { fetchImpl } = indexNowFetch();
  const early = Date.parse('2026-10-23T18:30:00.000Z'); // KST 03:30
  assert.equal((await runScheduledIndexNow(env, { fetch:fetchImpl, now:early, registry:registryOf([]) })).reason, 'NOT_DUE');
  const morning = Date.parse('2026-10-23T19:10:00.000Z'); // KST 04:10
  const ran = await runScheduledIndexNow(env, { fetch:fetchImpl, now:morning, registry:registryOf([]) });
  assert.equal(ran.ran, true);
  assert.equal((await runScheduledIndexNow(env, { fetch:fetchImpl, now:morning + 4 * 3600_000, registry:registryOf([]) })).reason, 'NOT_DUE');
  assert.equal((await runScheduledIndexNow(env, { fetch:fetchImpl, now:morning + 86400_000, registry:registryOf([]) })).ran, true);
  assert.equal((await runScheduledIndexNow({ ...env, MARKETING_INDEXNOW_ENABLED:'false' }, { now:morning + 2 * 86400_000 })).reason, 'DISABLED');
  const state = env.DB.raw.prepare('SELECT last_status FROM marketing_scheduler_state WHERE task_key=?').get(INDEXNOW_TASK_KEY);
  assert.equal(state.last_status, 'ok');
  const broken = await runScheduledIndexNow({ DB:{ prepare() { throw new Error('boom'); } } }, { now:morning });
  assert.equal(broken.ran, false);
});

// ---------------------------------------------------------------- 배포 매핑 · 크론 연결

const converge = fs.readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
function selector(name) {
  const start = converge.indexOf(`const ${name}=`);
  const end = converge.indexOf(');\n', start);
  assert.ok(start >= 0 && end > start, `${name} selector`);
  return converge.slice(start, end);
}

test('Phase 8 files dispatch the deploys that ship them after token-mediated merges', () => {
  const control = selector('controlApiTouched');
  for (const file of ['marketing-performance-report.js','marketing-metrics-collector.js','marketing-indexnow-scheduler.js','marketing-admin-control.js','marketing-content-studio.js','mission-control-entry-worker.js','channel-credential-vault.js','platform-indexnow.js','public-discovery-registry.js'])
    assert.ok(control.includes(`'${file}'`), `Control API: ${file}`);
  assert.ok(control.includes("file.startsWith('migrations/')"), 'D1 migration 02xx dispatches the guarded Control API (applies migrations)');
  const site = selector('sharedSiteTouched');
  for (const file of ['marketing-attribution-capture.js','marketing-ai-admin.js','marketing-ai-admin.css'])
    assert.ok(site.includes(`'${file}'`), `Site Core: ${file}`);
  assert.ok(site.includes("file==='platform-router-entry-worker.js'"));
  const mall = selector('mallSiteTouched');
  assert.ok(mall.includes("file.startsWith('sites/ekodi-mall/')"), 'mall API internal orders endpoint ships with the mall deploy');
});

test('Control API cron and Site Core entry are wired to the Phase 8 modules', () => {
  const mission = fs.readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
  assert.match(mission, /runScheduledMetricsCollection\(env/);
  assert.match(mission, /runScheduledIndexNow\(env/);
  assert.match(mission, /ctx\.waitUntil\(marketingMetrics\)/);
  const router = fs.readFileSync(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');
  assert.match(router, /finalize\(captureTrackedLanding\(request,env,ctx,canonicalQueryRedirect\)\)/);
  assert.match(router, /observeAttributedResponse\(request,env,ctx,response\)/);
  const publishing = fs.readFileSync(new URL('../marketing-publishing-worker.js', import.meta.url), 'utf8');
  assert.ok(!publishing.includes('marketing-metrics-collector'), 'Phase 8 does not touch the publishing worker');
  const ui = fs.readFileSync(new URL('../marketing-ai-admin.js', import.meta.url), 'utf8');
  for (const marker of ['성과·수익','/api/marketing/admin/performance','/api/marketing/admin/studio/naver','naver-published','https://blog.naver.com/','미귀속 확정','추정 수수료','확정 매출'])
    assert.ok(ui.includes(marker), marker);
  assert.match(ui, /state\.tab === 'reports' && !view\.querySelector\('\.marketing-ai-performance'\)/);
});
