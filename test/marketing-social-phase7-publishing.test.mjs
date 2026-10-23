// EKODI AI Social Growth Phase 7 + 4 — 출시 전 게시 하드닝.
// 실제 네트워크 없음: 모든 공급자 호출은 주입된 fetch 목(mock)으로, D1은 node:sqlite + 실제 루트 마이그레이션 체인으로 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  FB_REELS_DAILY_LIMIT, IG_PUBLISH_LIMIT_FALLBACK, facebookReelSchedule, instagramPublishingQuota, instagramQuotaDecision,
  metaAiLabelFields, pollInstagramContainer, publishFacebookReel, publishInstagramReel,
} from '../channel-meta-reels-adapter.js';
import {
  assertAiCaptionHonest, beginIdempotentRequest, canonicalPostUrl, completeIdempotentRequest, contentFormat,
  normalizeIdempotencyKey, resolveYoutubePrivacy, runOAuthTokenHealth, tokenHealthDue,
} from '../channel-publish-hardening.js';
import publishingWorker, { runScheduler, queuePublishForTest, errorCode } from '../marketing-publishing-worker.js';
import { CHANNEL_PUBLISHING_TARGETS } from '../channel-publishing-catalog.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const MIGRATION_FILES = fs.readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b, 'en'));
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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

const jsonResponse = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json', ...headers } });
// routes: [matcher(url, init) => boolean, handler(url, init) => data|Response]
function mockFetch(routes) {
  const calls = [];
  const fn = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [match, handler] of routes) {
      if (match(url, init)) { const out = await handler(url, init, calls); return out instanceof Response ? out : jsonResponse(out); }
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  fn.calls = calls;
  return fn;
}
const bodyOf = init => init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
async function withFetch(fetchImpl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await run(); } finally { globalThis.fetch = original; }
}

const SUBJECT = { type:'tenant', key:'p7-lab', workspaceId:'' };
const PAST = () => new Date(Date.now() - 60_000).toISOString();

function seed({ env = {}, maxDaily = 100 } = {}) {
  const DB = d1();
  const now = new Date().toISOString();
  DB.raw.prepare(`INSERT INTO service_subscriptions(subject_type,subject_key,site,plan_id,status,monthly_fee,created_at,updated_at) VALUES('tenant','p7-lab','marketing','enterprise','active',0,?,?)`).run(now, now);
  DB.raw.prepare(`INSERT INTO marketing_publish_policies(subject_type,subject_key,mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at) VALUES('tenant','p7-lab','review',?,'[]','{}',?,?)`).run(maxDaily, now, now);
  return { DB, ...env };
}
function addChannel(env, { provider, channelType, credentialRef = '', config = {}, externalId = '' }) {
  const now = new Date().toISOString();
  return Number(env.DB.raw.prepare(`INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,external_account_id,credential_ref,status,config_json,created_at,updated_at)
    VALUES('tenant','p7-lab',?,?,?,?,?,'active',?,?,?)`).run(provider, channelType, `${provider} test`, externalId || `${provider}-${channelType}`, credentialRef, JSON.stringify(config), now, now).lastInsertRowid);
}
function addJob(env, channelId, { title = 'EKODI', caption = '청계면 소식', assetUrl = '', linkUrl = '', contentJson = {}, contentType = 'social_post', variant = false } = {}) {
  const now = new Date().toISOString();
  const contentId = Number(env.DB.raw.prepare(`INSERT INTO marketing_content_items(subject_type,subject_key,title,content_type,caption,asset_url,link_url,content_json,created_at,updated_at)
    VALUES('tenant','p7-lab',?,?,?,?,?,?,?,?)`).run(title, contentType, caption, assetUrl, linkUrl, JSON.stringify(contentJson), now, now).lastInsertRowid);
  let variantId = null;
  if (variant) {
    variantId = Number(env.DB.raw.prepare(`INSERT INTO marketing_content_variants(content_id,channel,format,title,body,tracking_code,status,subject_type,subject_key,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'scheduled','tenant','p7-lab',?,?)`).run(contentId, variant.channel, variant.format, title, caption, `ek${Math.random().toString(36).slice(2, 10)}`, now, now).lastInsertRowid);
  }
  const jobId = Number(env.DB.raw.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,content_id,channel_id,schedule_kind,scheduled_at,status,requested_by,attempt_count,max_attempts,variant_id,created_at,updated_at)
    VALUES('tenant','p7-lab',?,?,'immediate',?,'queued','human',0,5,?,?,?)`).run(contentId, channelId, PAST(), variantId, now, now).lastInsertRowid);
  return { jobId, contentId, variantId };
}
const jobRow = (env, id) => ({ ...env.DB.raw.prepare('SELECT * FROM marketing_publication_jobs WHERE id=?').get(id) });
const auditActions = env => env.DB.raw.prepare('SELECT action FROM marketing_publication_audit ORDER BY id').all().map(r => r.action);

const FB_SECRET = JSON.stringify({ graphVersion:'v25.0', pageId:'111', accessToken:'page-token' });
const IG_SECRET = JSON.stringify({ graphVersion:'v25.0', instagramAccountId:'1784', accessToken:'ig-token' });

function facebookReelRoutes({ uploadStatus = 200 } = {}) {
  return [
    [(u, i) => u.endsWith('/111/video_reels') && bodyOf(i).get('upload_phase') === 'start', () => ({ video_id:'vid1', upload_url:'https://rupload.facebook.com/video-upload/v25.0/vid1' })],
    [u => u.startsWith('https://rupload.facebook.com/'), () => uploadStatus === 200 ? { success:true } : jsonResponse({ error:{ message:'upload exploded' } }, uploadStatus)],
    [(u, i) => u.endsWith('/111/video_reels') && bodyOf(i).get('upload_phase') === 'finish', () => ({ success:true, post_id:'111_999' })],
    [u => u.includes('/vid1?fields=permalink_url'), () => ({ permalink_url:'/reel/vid1' })],
  ];
}

// ---------------------------------------------------------------- 1. Facebook Reels

test('FB Page Reels adapter runs start → rupload(file_url) → finish and captures the reel permalink', async () => {
  const fetchImpl = mockFetch(facebookReelRoutes());
  const result = await publishFacebookReel({ fetchImpl, graphVersion:'v25.0', pageId:'111', accessToken:'page-token', videoUrl:'https://cdn.example.org/reel.mp4', description:'가을 축제', title:'축제' });
  const phases = fetchImpl.calls.map(c => c.url.includes('rupload') ? 'upload' : bodyOf(c.init).get('upload_phase') || 'permalink');
  assert.deepEqual(phases, ['start', 'upload', 'finish', 'permalink']);
  const upload = fetchImpl.calls[1].init;
  assert.equal(upload.headers.file_url, 'https://cdn.example.org/reel.mp4');
  assert.equal(upload.headers.authorization, 'OAuth page-token');
  assert.equal(bodyOf(fetchImpl.calls[2].init).get('video_state'), 'PUBLISHED');
  assert.equal(result.id, 'vid1');
  assert.equal(result.postId, '111_999');
  assert.equal(result.url, 'https://www.facebook.com/reel/vid1');
  // 예약: 10분~29일 범위만 SCHEDULED, 29일 초과는 거부, 10분 미만은 즉시 공개.
  const now = Date.parse('2026-10-24T00:00:00Z');
  assert.equal(facebookReelSchedule(new Date(now + 3600_000).toISOString(), now).videoState, 'SCHEDULED');
  assert.equal(facebookReelSchedule(new Date(now + 60_000).toISOString(), now).videoState, 'PUBLISHED');
  assert.throws(() => facebookReelSchedule(new Date(now + 30 * 86400_000).toISOString(), now), /29일/);
});

test('scheduled FB reel job publishes, records format=reel and marks the studio variant published', async () => {
  const env = seed({ env:{ P7_FB:FB_SECRET } });
  const channelId = addChannel(env, { provider:'meta', channelType:'facebook_page', credentialRef:'P7_FB' });
  const { jobId, variantId } = addJob(env, channelId, { assetUrl:'https://cdn.example.org/reel.mp4', contentType:'short_video', contentJson:{ assets:['https://cdn.example.org/reel.mp4'], isAiGenerated:false, studio:{ format:'reel', channel:'facebook' } }, variant:{ channel:'facebook', format:'reel' } });
  await withFetch(mockFetch(facebookReelRoutes()), () => runScheduler(env));
  const job = jobRow(env, jobId);
  assert.equal(job.status, 'published');
  assert.equal(job.external_post_id, 'vid1');
  assert.equal(job.external_post_url, 'https://www.facebook.com/reel/vid1');
  const response = JSON.parse(job.provider_response_json);
  assert.equal(response.format, 'reel');
  assert.equal(response.postId, '111_999');
  assert.doesNotMatch(job.provider_response_json, /page-token/);
  assert.equal(env.DB.raw.prepare('SELECT status FROM marketing_content_variants WHERE id=?').get(variantId).status, 'published');
});

test('FB reel upload failure is retried with backoff instead of failing the job', async () => {
  const env = seed({ env:{ P7_FB:FB_SECRET } });
  const channelId = addChannel(env, { provider:'meta', channelType:'facebook_page', credentialRef:'P7_FB' });
  const { jobId } = addJob(env, channelId, { assetUrl:'https://cdn.example.org/reel.mp4', contentJson:{ studio:{ format:'reel' } } });
  await withFetch(mockFetch(facebookReelRoutes({ uploadStatus:500 })), () => runScheduler(env));
  const job = jobRow(env, jobId);
  assert.equal(job.status, 'retrying');
  assert.equal(job.attempt_count, 1);
  assert.ok(Date.parse(job.next_attempt_at) > Date.now() + 4 * 60_000, 'first retry waits about 5 minutes');
  assert.match(job.last_error, /^PROVIDER_ERROR: upload exploded/);
});

test('FB Reels 30/24h soft guard defers the next reel without calling Meta', async () => {
  const env = seed({ env:{ P7_FB:FB_SECRET } });
  const channelId = addChannel(env, { provider:'meta', channelType:'facebook_page', credentialRef:'P7_FB' });
  const now = new Date().toISOString();
  for (let i = 0; i < FB_REELS_DAILY_LIMIT; i += 1) {
    const { jobId } = addJob(env, channelId, { contentJson:{ studio:{ format:'reel' } } });
    env.DB.raw.prepare(`UPDATE marketing_publication_jobs SET status='published',published_at=?,provider_response_json='{"format":"reel"}' WHERE id=?`).run(now, jobId);
  }
  const { jobId } = addJob(env, channelId, { assetUrl:'https://cdn.example.org/reel.mp4', contentJson:{ studio:{ format:'reel' } } });
  const fetchImpl = mockFetch([]);
  await withFetch(fetchImpl, () => runScheduler(env));
  const job = jobRow(env, jobId);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(job.status, 'retrying');
  assert.match(job.last_error, /^FB_REELS_DAILY_LIMIT/);
  assert.ok(Date.parse(job.next_attempt_at) > Date.now() + 23 * 3600_000);
});

// ---------------------------------------------------------------- 2. Instagram Reels

function fakeClock() {
  let t = Date.parse('2026-10-24T00:00:00Z');
  return { now:() => t, sleep:async ms => { t += ms; } };
}

test('IG Reels adapter polls the container with bounded backoff until FINISHED, then publishes and reads permalink', async () => {
  let polls = 0;
  const fetchImpl = mockFetch([
    [(u, i) => u.endsWith('/1784/media') && i.method === 'POST', (u, i) => { const b = bodyOf(i); assert.equal(b.get('media_type'), 'REELS'); assert.equal(b.get('video_url'), 'https://cdn.example.org/r.mp4'); return { id:'ctr1' }; }],
    [u => u.includes('/ctr1?fields=status_code'), () => ({ status_code:++polls < 3 ? 'IN_PROGRESS' : 'FINISHED' })],
    [u => u.endsWith('/1784/media_publish'), () => ({ id:'media9' })],
    [u => u.includes('/media9?fields=permalink'), () => ({ permalink:'https://www.instagram.com/reel/AbC/' })],
  ]);
  const clock = fakeClock();
  const result = await publishInstagramReel({ fetchImpl, ...clock, graphVersion:'v25.0', igUserId:'1784', accessToken:'ig-token', videoUrl:'https://cdn.example.org/r.mp4', caption:'릴스' });
  assert.equal(result.id, 'media9');
  assert.equal(result.url, 'https://www.instagram.com/reel/AbC/');
  assert.equal(polls, 3);
});

test('IG Reels polling stops at the ~5 minute budget and returns pending; resume reuses the same container', async () => {
  const clock = fakeClock();
  let created = 0;
  const fetchImpl = mockFetch([
    [(u, i) => u.endsWith('/1784/media') && i.method === 'POST', () => { created += 1; return { id:'ctr2' }; }],
    [u => u.includes('/ctr2?fields=status_code'), () => ({ status_code:'IN_PROGRESS' })],
  ]);
  const started = clock.now();
  const pending = await publishInstagramReel({ fetchImpl, ...clock, graphVersion:'v25.0', igUserId:'1784', accessToken:'ig-token', videoUrl:'https://cdn.example.org/r.mp4' });
  assert.equal(pending.pending, true);
  assert.equal(pending.containerId, 'ctr2');
  assert.ok(clock.now() - started <= 5 * 60_000, 'never blocks longer than the poll budget');
  const resumed = await publishInstagramReel({ fetchImpl, ...clock, graphVersion:'v25.0', igUserId:'1784', accessToken:'ig-token', resumeContainerId:'ctr2', resumeCreatedAt:pending.createdAt, budgetMs:10_000 });
  assert.equal(resumed.pending, true);
  assert.equal(created, 1, 'resume must not create a second container');
  const raw = await pollInstagramContainer({ fetchImpl, ...clock, graphVersion:'v25.0', containerId:'ctr2', accessToken:'t', budgetMs:0 });
  assert.equal(raw.pending, true);
});

test('vault IG reel still processing is re-queued with next_attempt_at (attempt refunded) and resumed on the next run', async () => {
  const calls = [];
  let mode = 'pending';
  const env = seed({ env:{ MARKETING_GROWTH:{ async publishFromVault(input) {
    calls.push(input);
    if (mode === 'pending') return { pending:true, containerId:'ctr7', createdAt:new Date().toISOString(), provider:'instagram' };
    return { id:'media7', url:'https://www.instagram.com/reel/Xy/', provider:'instagram', format:'reel', aiLabel:{ isAiGenerated:true, sent:false, reason:'platform_flag_disabled' } };
  } } } });
  const channelId = addChannel(env, { provider:'instagram', channelType:'business', config:{ credentialMode:'oauth-vault', oauthConnectionId:5 } });
  const { jobId, variantId } = addJob(env, channelId, { assetUrl:'https://cdn.example.org/r.mp4', contentJson:{ assets:['https://cdn.example.org/r.mp4'], isAiGenerated:true, studio:{ format:'reel' } }, variant:{ channel:'instagram', format:'reel' } });
  await runScheduler(env);
  let job = jobRow(env, jobId);
  assert.equal(job.status, 'retrying');
  assert.equal(job.attempt_count, 0, 'media processing must not burn retry budget');
  assert.match(job.last_error, /^IG_MEDIA_PROCESSING/);
  assert.equal(JSON.parse(job.provider_response_json).pendingContainerId, 'ctr7');
  assert.equal(calls[0].content.format, 'reel');
  assert.equal(calls[0].content.isAiGenerated, true);
  env.DB.raw.prepare('UPDATE marketing_publication_jobs SET next_attempt_at=? WHERE id=?').run(PAST(), jobId);
  mode = 'done';
  await runScheduler(env);
  assert.equal(calls[1].content.resumeContainerId, 'ctr7');
  job = jobRow(env, jobId);
  assert.equal(job.status, 'published');
  assert.equal(job.external_post_url, 'https://www.instagram.com/reel/Xy/');
  assert.deepEqual(JSON.parse(job.provider_response_json).aiLabel, { isAiGenerated:true, sent:false, param:'', reason:'platform_flag_disabled' });
  assert.equal(env.DB.raw.prepare('SELECT status FROM marketing_content_variants WHERE id=?').get(variantId).status, 'published');
  assert.ok(auditActions(env).includes('publication_media_processing'));
});

// ---------------------------------------------------------------- 3. Instagram 게시 한도

test('IG publishing-limit guard: provider quota, unknown fallback to 50, and job deferral with clear last_error', async () => {
  assert.equal(instagramQuotaDecision({ known:true, usage:49, limit:50 }).allowed, true);
  const blocked = instagramQuotaDecision({ known:true, usage:50, limit:50 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, 'IG_PUBLISH_LIMIT');
  assert.equal(instagramQuotaDecision({ known:false, limit:IG_PUBLISH_LIMIT_FALLBACK }, { localPublished24h:50 }).allowed, false);
  assert.equal(instagramQuotaDecision({ known:false, limit:IG_PUBLISH_LIMIT_FALLBACK }, { localPublished24h:12 }).allowed, true);
  const unknown = await instagramPublishingQuota({ fetchImpl:mockFetch([[() => true, () => jsonResponse({ error:{ message:'nope' } }, 400)]]), graphVersion:'v25.0', igUserId:'1', accessToken:'t' });
  assert.equal(unknown.known, false);
  assert.equal(unknown.limit, 50);

  const env = seed({ env:{ P7_IG:IG_SECRET } });
  const channelId = addChannel(env, { provider:'meta', channelType:'instagram_business', credentialRef:'P7_IG' });
  const { jobId } = addJob(env, channelId, { assetUrl:'https://cdn.example.org/a.jpg' });
  const fetchImpl = mockFetch([[u => u.includes('/1784/content_publishing_limit'), () => ({ data:[{ quota_usage:50, config:{ quota_total:50, quota_duration:86400 } }] })]]);
  await withFetch(fetchImpl, () => runScheduler(env));
  const job = jobRow(env, jobId);
  assert.equal(fetchImpl.calls.length, 1, 'no media container is created once the quota is exhausted');
  assert.equal(job.status, 'retrying');
  assert.equal(job.attempt_count, 0);
  assert.match(job.last_error, /^IG_PUBLISH_LIMIT: Instagram 24시간 게시 한도\(50\/50\)/);
  assert.ok(Date.parse(job.next_attempt_at) > Date.now());
  assert.ok(auditActions(env).includes('publication_deferred'));
});

// ---------------------------------------------------------------- 4. AI 표시

test('AI flag passthrough: IG guarded optional field, YouTube containsSyntheticMedia, provider_response_json record', async () => {
  assert.deepEqual(metaAiLabelFields({ isAiGenerated:true, version:'v25.0', enabled:true }).fields, { is_ai_generated:'true' });
  assert.deepEqual(metaAiLabelFields({ isAiGenerated:true, version:'v25.0', enabled:false }).fields, {});
  assert.equal(metaAiLabelFields({ isAiGenerated:true, version:'v19.0', enabled:true }).label.reason, 'graph_version_unsupported');
  assert.deepEqual(metaAiLabelFields({ isAiGenerated:false, version:'v25.0', enabled:true }).fields, {});

  const env = seed({ env:{ P7_IG:IG_SECRET, META_AI_LABEL_ENABLED:'true' } });
  const channelId = addChannel(env, { provider:'meta', channelType:'instagram_business', credentialRef:'P7_IG' });
  const { jobId } = addJob(env, channelId, { assetUrl:'https://cdn.example.org/a.jpg', contentJson:{ isAiGenerated:true } });
  let createBody;
  await withFetch(mockFetch([
    [u => u.includes('content_publishing_limit'), () => ({ data:[{ quota_usage:3, config:{ quota_total:50 } }] })],
    [(u, i) => u.endsWith('/1784/media') && i.method === 'POST', (u, i) => { createBody = bodyOf(i); return { id:'c1' }; }],
    [u => u.endsWith('/1784/media_publish'), () => ({ id:'m1' })],
    [u => u.includes('/m1?fields=permalink'), () => ({ permalink:'https://www.instagram.com/p/Zz/' })],
  ]), () => runScheduler(env));
  assert.equal(createBody.get('is_ai_generated'), 'true');
  const job = jobRow(env, jobId);
  assert.equal(job.external_post_url, 'https://www.instagram.com/p/Zz/');
  assert.deepEqual(JSON.parse(job.provider_response_json).aiLabel, { isAiGenerated:true, sent:true, param:'is_ai_generated', reason:'' });

  // YouTube(레거시 secret 경로): AI 생성이면 status.containsSyntheticMedia=true.
  const yt = seed({ env:{ P7_YT:JSON.stringify({ clientId:'c', clientSecret:'s', refreshToken:'r' }) } });
  const ytChannel = addChannel(yt, { provider:'youtube', channelType:'youtube_channel', credentialRef:'P7_YT' });
  const yJob = addJob(yt, ytChannel, { assetUrl:'https://cdn.example.org/v.mp4', contentJson:{ isAiGenerated:true, studio:{ format:'short' } } }).jobId;
  let metadata;
  await withFetch(mockFetch([
    [u => u.startsWith('https://oauth2.googleapis.com/token'), () => ({ access_token:'ya29' })],
    [u => u === 'https://cdn.example.org/v.mp4', () => new Response(new Uint8Array([1, 2, 3]), { headers:{ 'content-type':'video/mp4' } })],
    [(u, i) => u.includes('uploadType=resumable') && i.method === 'POST', (u, i) => { metadata = JSON.parse(i.body); return jsonResponse({}, 200, { location:'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=1' }); }],
    [(u, i) => u.includes('upload_id=1') && i.method === 'PUT', () => ({ id:'yt123' })],
  ]), () => runScheduler(yt));
  assert.equal(metadata.status.containsSyntheticMedia, true);
  assert.equal(metadata.status.privacyStatus, 'private');
  const ytRow = jobRow(yt, yJob);
  assert.equal(ytRow.external_post_url, 'https://www.youtube.com/shorts/yt123');
  assert.equal(JSON.parse(ytRow.provider_response_json).aiLabel.param, 'containsSyntheticMedia');
});

test('AI-generated captions that deny AI use are blocked and never retried', async () => {
  assert.throws(() => assertAiCaptionHonest('AI 없이 사람이 직접 작성한 글입니다', true), err => err.code === 'AI_CAPTION_MISLEADING');
  assert.doesNotThrow(() => assertAiCaptionHonest('AI 없이 사람이 직접 작성한 글입니다', false));
  assert.doesNotThrow(() => assertAiCaptionHonest('AI 도움을 받아 작성했습니다', true));
  assert.equal(errorCode(new Error('AI_CAPTION_MISLEADING: 사실과 다른 표현')), 'AI_CAPTION_MISLEADING');
  const env = seed({ env:{ P7_FB:FB_SECRET } });
  const channelId = addChannel(env, { provider:'meta', channelType:'facebook_page', credentialRef:'P7_FB' });
  const { jobId } = addJob(env, channelId, { caption:'100% human-written, no AI', contentJson:{ isAiGenerated:true } });
  const fetchImpl = mockFetch([]);
  await withFetch(fetchImpl, () => runScheduler(env));
  const job = jobRow(env, jobId);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(job.status, 'failed');
  assert.match(job.last_error, /^AI_CAPTION_MISLEADING/);
});

// ---------------------------------------------------------------- 5. YouTube 공개 범위

test('YouTube privacy policy: default private, job > channel override, publishAt forces private', () => {
  const now = Date.parse('2026-10-24T00:00:00Z');
  assert.deepEqual(resolveYoutubePrivacy({ now }), { privacyStatus:'private', publishAt:'', requestedPrivacy:'private', source:'default', scheduled:false });
  assert.equal(resolveYoutubePrivacy({ channelPrivacy:'public', now }).privacyStatus, 'public');
  assert.equal(resolveYoutubePrivacy({ channelPrivacy:'public', jobPrivacy:'unlisted', now }).privacyStatus, 'unlisted');
  assert.equal(resolveYoutubePrivacy({ channelPrivacy:'everyone', now }).privacyStatus, 'private');
  const scheduled = resolveYoutubePrivacy({ jobPrivacy:'public', publishAt:'2026-10-25T09:00:00+09:00', now });
  assert.equal(scheduled.privacyStatus, 'private');
  assert.equal(scheduled.publishAt, '2026-10-25T00:00:00.000Z');
  assert.equal(scheduled.requestedPrivacy, 'public');
  assert.equal(resolveYoutubePrivacy({ jobPrivacy:'public', publishAt:'2026-10-23T00:00:00Z', now }).privacyStatus, 'public', 'past publishAt is ignored');
});

test('growth worker immediate YouTube path uses the privacy policy instead of a hard-coded private', async () => {
  const growth = await read('marketing-growth-worker.js');
  const start = growth.indexOf('async function publishYouTube(env, connection, content)');
  const block = growth.slice(start, growth.indexOf('async function executePublish', start));
  assert.match(block, /resolveYoutubePrivacy\(\{jobPrivacy:content\.privacyStatus,channelPrivacy:setting\?\.publish_privacy,publishAt:content\.publishAt\}\)/);
  assert.match(block, /metadata\.status\.publishAt = policy\.publishAt/);
  assert.doesNotMatch(block, /privacyStatus:'private'\}/);
  assert.match(block, /privacyStatus:privacy,publishAt:policy\.publishAt/);
});

// ---------------------------------------------------------------- 6. 게시물 URL

test('canonical post URLs per channel and FB feed URL capture in the scheduler', async () => {
  assert.equal(canonicalPostUrl({ provider:'facebook', id:'111_222' }), 'https://www.facebook.com/111_222');
  assert.equal(canonicalPostUrl({ provider:'facebook', id:'vid', format:'reel' }), 'https://www.facebook.com/reel/vid');
  assert.equal(canonicalPostUrl({ provider:'facebook', id:'x', permalink:'/permalink.php?story_fbid=1' }), 'https://www.facebook.com/permalink.php?story_fbid=1');
  assert.equal(canonicalPostUrl({ provider:'youtube', id:'abc' }), 'https://www.youtube.com/watch?v=abc');
  assert.equal(canonicalPostUrl({ provider:'youtube', id:'abc', format:'short' }), 'https://www.youtube.com/shorts/abc');
  assert.equal(canonicalPostUrl({ provider:'youtube', id:'abc', channelType:'youtube_short' }), 'https://www.youtube.com/shorts/abc');
  assert.equal(canonicalPostUrl({ provider:'instagram', id:'m1', permalink:'https://www.instagram.com/p/A/' }), 'https://www.instagram.com/p/A/');
  assert.equal(canonicalPostUrl({ provider:'instagram', id:'m1' }), '', 'IG URLs are never guessed from media ids');
  assert.equal(canonicalPostUrl({ provider:'threads', id:'t1', permalink:'https://www.threads.net/@ekodi/post/X' }), 'https://www.threads.net/@ekodi/post/X');

  const env = seed({ env:{ P7_FB:FB_SECRET } });
  const channelId = addChannel(env, { provider:'meta', channelType:'facebook_page', credentialRef:'P7_FB' });
  const { jobId, variantId } = addJob(env, channelId, { linkUrl:'https://ekodi.kr/mall', variant:{ channel:'facebook', format:'feed' } });
  await withFetch(mockFetch([[u => u.endsWith('/111/feed'), () => ({ id:'111_555' })]]), () => runScheduler(env));
  const job = jobRow(env, jobId);
  assert.equal(job.external_post_id, '111_555');
  assert.equal(job.external_post_url, 'https://www.facebook.com/111_555');
  assert.equal(env.DB.raw.prepare('SELECT status FROM marketing_content_variants WHERE id=?').get(variantId).status, 'published');

  // 공급자가 URL을 주지 않은 vault 결과도 표준 URL로 채운다(YouTube Shorts).
  const vault = seed({ env:{ MARKETING_GROWTH:{ async publishFromVault() { return { id:'ys1', url:'', provider:'youtube', format:'short' }; } } } });
  const ytChannel = addChannel(vault, { provider:'youtube', channelType:'channel', config:{ credentialMode:'oauth-vault', oauthConnectionId:9 } });
  const ytJob = addJob(vault, ytChannel, { assetUrl:'https://cdn.example.org/s.mp4', contentJson:{ studio:{ format:'short' } } }).jobId;
  await runScheduler(vault);
  assert.equal(jobRow(vault, ytJob).external_post_url, 'https://www.youtube.com/shorts/ys1');
});

// ---------------------------------------------------------------- 7. Idempotency

test('Idempotency-Key on /v1/publish returns the same job and creates no duplicate', async () => {
  assert.equal(normalizeIdempotencyKey(''), '');
  assert.equal(normalizeIdempotencyKey('short'), null);
  assert.equal(normalizeIdempotencyKey('key with space'), null);
  const env = seed({ env:{ P7_FB:FB_SECRET } });
  const channelId = addChannel(env, { provider:'meta', channelType:'facebook_page', credentialRef:'P7_FB' });
  const identity = { id:'u1', email:'admin@example.org' };
  const request = key => new Request('https://example.org/v1/publish', { method:'POST', headers:{ 'content-type':'application/json', 'idempotency-key':key }, body:JSON.stringify({ channelIds:[channelId], content:{ caption:'한 번만 게시' } }) });
  const first = await queuePublishForTest(request('req-0001-abcdef'), env, identity, SUBJECT);
  const firstBody = await first.json();
  assert.equal(first.status, 201, JSON.stringify(firstBody));
  const second = await queuePublishForTest(request('req-0001-abcdef'), env, identity, SUBJECT);
  const secondBody = await second.json();
  assert.equal(second.status, 201);
  assert.equal(secondBody.idempotent, true);
  assert.deepEqual(secondBody.jobs, firstBody.jobs);
  const count = () => env.DB.raw.prepare('SELECT count(*) AS n FROM marketing_publication_jobs').get().n;
  assert.equal(count(), 1);
  const stored = env.DB.raw.prepare('SELECT job_id,status,scope FROM marketing_request_idempotency').get();
  assert.equal(stored.job_id, firstBody.jobs[0].id);
  assert.equal(stored.status, 'completed');
  assert.match(stored.scope, /^marketing-publishing:\/v1\/publish:tenant:p7-lab$/);
  const other = await queuePublishForTest(request('req-0002-abcdef'), env, identity, SUBJECT);
  assert.equal(other.status, 201);
  assert.equal(count(), 2);
  const invalid = await queuePublishForTest(request('bad'), env, identity, SUBJECT);
  assert.equal(invalid.status, 400);

  // 진행 중 키는 409, 같은 키라도 다른 주체(scope)는 별개.
  const begun = await beginIdempotentRequest(env.DB, { scope:'s1', key:'inflight-key-1' });
  assert.equal(begun.state, 'new');
  assert.equal((await beginIdempotentRequest(env.DB, { scope:'s1', key:'inflight-key-1' })).state, 'in_progress');
  assert.equal((await beginIdempotentRequest(env.DB, { scope:'s2', key:'inflight-key-1' })).state, 'new');
  await completeIdempotentRequest(env.DB, begun.id, { jobId:77, status:200, body:{ ok:true } });
  const replay = await beginIdempotentRequest(env.DB, { scope:'s1', key:'inflight-key-1' });
  assert.equal(replay.state, 'replay');
  assert.equal(replay.jobId, 77);
  // 마이그레이션이 아직 적용되지 않았으면 멱등성 없이 기존처럼 동작한다.
  const legacy = { prepare:() => ({ bind:() => ({ first:async () => { throw new Error('D1_ERROR: no such table: marketing_request_idempotency'); } }) }) };
  assert.equal((await beginIdempotentRequest(legacy, { scope:'s', key:'whatever-key-1' })).state, 'unavailable');
});

test('growth worker /v1/publish is wrapped by the same idempotency store', async () => {
  const growth = await read('marketing-growth-worker.js');
  assert.match(growth, /return idempotentExecutePublish\(request,env,identity,subject,body\)/);
  assert.match(growth, /scope:`marketing-growth:\/v1\/publish:\$\{subject\.type\}:\$\{subject\.key\}`/);
  const migration = await read('migrations/0207_marketing_request_idempotency.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS marketing_request_idempotency \(\n  key TEXT PRIMARY KEY,\n  scope TEXT NOT NULL,/);
  assert.match(migration, /job_id INTEGER/);
});

// ---------------------------------------------------------------- 8. 토큰 상태

test('token health: Threads refresh, Meta needs_reauth / expired transitions with audit rows', async () => {
  const env = seed();
  const now = Date.parse('2026-10-24T18:17:00Z');
  const day = 86400_000;
  const insert = (provider, resource, externalId, expiresAt, cipher = 'plain-token') => Number(env.DB.raw.prepare(`INSERT INTO marketing_oauth_connections(subject_type,subject_key,provider,resource_type,external_id,display_name,token_ciphertext,token_expires_at,status,created_at,updated_at)
    VALUES('tenant','p7-lab',?,?,?,?,?,?,'active',?,?)`).run(provider, resource, externalId, provider, cipher, expiresAt, new Date(now).toISOString(), new Date(now).toISOString()).lastInsertRowid);
  const threadsSoon = insert('threads', 'profile', 'th1', new Date(now + 5 * day).toISOString(), 'th-old');
  const threadsFails = insert('threads', 'profile', 'th2', new Date(now + 3 * day).toISOString(), 'th-broken');
  const threadsFar = insert('threads', 'profile', 'th3', new Date(now + 40 * day).toISOString());
  const metaSoon = insert('facebook', 'page', 'pg1', new Date(now + 3 * day).toISOString(), 'fb-soon');
  const metaInvalid = insert('instagram', 'business', 'ig1', new Date(now + 50 * day).toISOString(), 'ig-invalid');
  const metaForever = insert('facebook', 'page', 'pg2', new Date(now + 2 * day).toISOString(), 'fb-forever');
  addChannel(env, { provider:'instagram', channelType:'business', externalId:'ig1', config:{ credentialMode:'oauth-vault', oauthConnectionId:metaInvalid } });
  const fetchImpl = mockFetch([
    [u => u.startsWith('https://graph.threads.net/refresh_access_token') && u.includes('access_token=th-old'), () => ({ access_token:'th-new', expires_in:60 * 86400 })],
    [u => u.startsWith('https://graph.threads.net/refresh_access_token'), () => jsonResponse({ error:{ message:'Session expired' } }, 400)],
    [u => u.includes('/debug_token') && u.includes('input_token=fb-soon'), () => ({ data:{ is_valid:true, expires_at:Math.floor((now + 3 * day) / 1000) } })],
    [u => u.includes('/debug_token') && u.includes('input_token=ig-invalid'), () => ({ data:{ is_valid:false, error:{ message:'Session has been invalidated' } } })],
    [u => u.includes('/debug_token') && u.includes('input_token=fb-forever'), () => ({ data:{ is_valid:true, expires_at:0 } })],
  ]);
  const summary = await runOAuthTokenHealth({
    db:env.DB, fetchImpl, now, decrypt:async row => row.token_ciphertext, encrypt:async (row, token) => `enc:${token}`,
    metaAppId:'app', metaAppSecret:'secret', graphVersion:'v25.0',
  });
  assert.deepEqual({ ...summary }, { checked:6, healthy:2, refreshed:1, needsReauth:2, expired:1, errors:0, schemaReady:true });
  const row = id => env.DB.raw.prepare('SELECT status,token_ciphertext,token_expires_at,last_error FROM marketing_oauth_connections WHERE id=?').get(id);
  assert.equal(row(threadsSoon).token_ciphertext, 'enc:th-new');
  assert.equal(row(threadsSoon).token_expires_at, new Date(now + 60 * day).toISOString());
  assert.equal(row(threadsSoon).status, 'active');
  assert.equal(row(threadsFails).status, 'active', 'still valid until expiry');
  assert.match(row(threadsFails).last_error, /^needs_reauth: Threads 토큰 갱신 실패/);
  assert.equal(row(threadsFar).last_error, '');
  assert.equal(row(metaSoon).status, 'active');
  assert.match(row(metaSoon).last_error, /^needs_reauth: Meta 토큰 만료 임박/);
  assert.equal(row(metaInvalid).status, 'expired');
  assert.match(row(metaInvalid).last_error, /^needs_reauth: Meta 토큰 무효/);
  assert.equal(row(metaForever).status, 'active');
  assert.equal(row(metaForever).token_expires_at, null, 'never-expiring page token clears the stale user-token expiry');
  assert.equal(env.DB.raw.prepare("SELECT status FROM marketing_publish_channels WHERE external_account_id='ig1'").get().status, 'credentials_required');
  const actions = env.DB.raw.prepare("SELECT action FROM marketing_publication_audit WHERE actor='token-health' ORDER BY id").all().map(r => r.action);
  assert.deepEqual(actions, ['oauth_token_refreshed', 'oauth_token_needs_reauth', 'oauth_token_needs_reauth', 'oauth_token_needs_reauth']);
  // 두 번째 점검은 이미 표시된 재인증 필요 건에 감사 로그를 중복으로 쌓지 않는다.
  await runOAuthTokenHealth({ db:env.DB, fetchImpl, now, decrypt:async r => r.token_ciphertext, encrypt:async (r, t) => `enc:${t}`, metaAppId:'app', metaAppSecret:'secret' });
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM marketing_publication_audit WHERE actor='token-health'").get().n, 4);
  // 앱 자격증명 없이도 저장된 만료일로 판단한다.
  const env2 = seed();
  const old = Number(env2.DB.raw.prepare(`INSERT INTO marketing_oauth_connections(subject_type,subject_key,provider,resource_type,external_id,token_ciphertext,token_expires_at,status,created_at,updated_at) VALUES('tenant','p7-lab','facebook','page','x',?,?,'active',?,?)`).run('t', new Date(now - day).toISOString(), 'a', 'a').lastInsertRowid);
  const s2 = await runOAuthTokenHealth({ db:env2.DB, fetchImpl:mockFetch([]), now, decrypt:async r => r.token_ciphertext, encrypt:async () => '' });
  assert.equal(s2.expired, 1);
  assert.equal(env2.DB.raw.prepare('SELECT status FROM marketing_oauth_connections WHERE id=?').get(old).status, 'expired');
});

test('token health runs once a day from the existing publishing cron via the Growth service binding', async () => {
  assert.equal(tokenHealthDue(new Date('2026-10-24T18:17:30Z')), true);
  assert.equal(tokenHealthDue(new Date('2026-10-24T18:18:00Z')), false);
  assert.equal(tokenHealthDue(new Date('2026-10-24T09:17:00Z')), false);
  const fired = [];
  const env = seed({ env:{ MARKETING_GROWTH:{ async runTokenHealth(input) { fired.push(input); return { ok:true }; }, async runGrowthCycle() { return { ok:true }; } } } });
  const waits = [];
  await publishingWorker.scheduled({ scheduledTime:Date.parse('2026-10-24T18:17:00Z') }, env, { waitUntil:p => waits.push(p) });
  await publishingWorker.scheduled({ scheduledTime:Date.parse('2026-10-24T18:18:00Z') }, env, { waitUntil:p => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(fired, [{ reason:'daily-publishing-cron' }]);
  const growth = await read('marketing-growth-worker.js');
  assert.match(growth, /async runTokenHealth\(input = \{\}\)/);
  const wrangler = await read('wrangler.marketing-publishing.toml');
  assert.match(wrangler, /crons = \["\* \* \* \* \*"\]/, 'no new cron or worker');
});

// ---------------------------------------------------------------- 9. 카탈로그·포맷·배포 매핑

test('channel catalog automatic flags match real adapters', async () => {
  const ig = Object.fromEntries(CHANNEL_PUBLISHING_TARGETS.instagram.formats.map(f => [f.id, f]));
  const fb = Object.fromEntries(CHANNEL_PUBLISHING_TARGETS.facebook.formats.map(f => [f.id, f]));
  assert.equal(ig.stories.automatic, false);
  assert.equal(ig.reels.automatic, true);
  assert.equal(fb.reels.automatic, true);
  const [publisher, growth, adapter] = await Promise.all([read('marketing-publishing-worker.js'), read('marketing-growth-worker.js'), read('channel-meta-reels-adapter.js')]);
  assert.match(adapter, /media_type:'REELS'/);
  assert.match(adapter, /upload_phase:'start'/);
  assert.match(adapter, /\/video_reels`/);
  for (const source of [publisher, growth]) {
    assert.match(source, /publishFacebookReel\(/);
    assert.match(source, /publishInstagramReel\(/);
    assert.match(source, /instagramQuotaDecision\(/);
  }
  assert.equal(contentFormat('{"studio":{"format":"reel"}}'), 'reel');
  assert.equal(contentFormat({ format:'short' }), 'short');
  assert.equal(contentFormat({ format:'hologram' }), '');
});

test('deployment mapping: new channel modules ship with both Publishing and Growth; migration 0207 ships with Control API', async () => {
  const script = await read('scripts/converge-orchestrated-pr-merge.mjs');
  const growthBlock = script.slice(script.indexOf('const marketingGrowthTouched'), script.indexOf('].includes(file));', script.indexOf('const marketingGrowthTouched')));
  const publishingBlock = script.slice(script.indexOf('const marketingPublishingTouched'), script.indexOf('\n);', script.indexOf('const marketingPublishingTouched')));
  const apiBlock = script.slice(script.indexOf('const controlApiTouched'), script.indexOf('const marketingGrowthTouched'));
  const growthWorkflow = await read('.github/workflows/deploy-marketing-growth.yml');
  const growthSource = await read('marketing-growth-worker.js');
  const publishingSource = await read('marketing-publishing-worker.js');
  const channelImports = source => [...source.matchAll(/from '\.\/(channel-[^']+\.js)'/g)].map(m => m[1]);
  // Growth가 import하는 모든 channel-*.js는 Growth 배포를 깨워야 한다(토큰 머지·push 모두).
  for (const file of channelImports(growthSource)) {
    assert.ok(growthBlock.includes(`'${file}'`), `${file} must dispatch Marketing Growth`);
    assert.ok(growthWorkflow.includes(`- '${file}'`), `${file} must be in the Growth push paths`);
  }
  assert.ok(channelImports(growthSource).includes('channel-meta-reels-adapter.js'));
  assert.ok(channelImports(growthSource).includes('channel-publish-hardening.js'));
  // Publishing 레인은 channel-*.js 정규식으로 새 모듈을 모두 포함한다.
  assert.ok(publishingBlock.includes('/^channel-[^/]+\\.js$/'));
  for (const file of channelImports(publishingSource)) assert.match(file, /^channel-[^/]+\.js$/);
  // ekodi-auth 루트 마이그레이션은 Control API 배포가 적용한다(0206과 같은 경로).
  assert.match(apiBlock, /\(file\.startsWith\('migrations\/'\)&&file\.endsWith\('\.sql'\)&&!file\.includes\('messenger'\)\)/);
  assert.ok(MIGRATION_FILES.includes('0207_marketing_request_idempotency.sql'));
  const numbered = MIGRATION_FILES.filter(f => /^\d{4}_/.test(f)).map(f => f.slice(0, 4));
  assert.equal(numbered.filter(n => n === '0207').length, 1, '0207 must be unique');
});
