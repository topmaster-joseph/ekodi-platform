// EKODI AI Social Growth Phase 8 — 게시물 성과 수집기(marketing_post_metrics, source='provider_api').
//
// 실행 위치: Control API(mission-control-entry-worker.js)의 기존 10분 cron 안에서 상태 기반 6시간 주기로 돈다.
// (새 Worker·새 cron 없음. 게시 Worker(marketing-publishing-worker.js)는 Phase 7이 수정 중이라 건드리지 않는다.)
//
// 원칙
// - 순수 모듈: fetch·now·자격증명 해석기를 주입받는다(테스트는 네트워크 없이 실행).
// - 최근 30일 안에 게시되고 external_post_id가 있는 작업만 수집한다.
// - 토큰이 없는 채널은 건너뛴다(skip 사유를 남김). 토큰·원문 응답은 절대 저장하지 않는다(raw_json에는 숫자 지표만).
// - 공급자 rate limit(HTTP 429, Graph 코드 4/17/32/613, YouTube quotaExceeded 등)이면 그 채널만 지수 백오프한다.
// - 어떤 오류도 cron 밖으로 던지지 않는다.
//
// 공식 API 메모(2026-10 기준)
// - Facebook: 2025-11-15부터 Page/Post 지표 impressions → views 계열로 바뀌었다. 게시물 views는 post_media_view,
//   도달은 post_total_media_view_unique를 쓴다(확인필요: 앱 버전별 지표명). 반응·댓글·공유는 게시물 필드 summary로 읽는다.
// - Instagram: /{media-id}/insights?metric=views,reach,saved,shares,likes,comments (instagram_manage_insights 권한, 최대 48시간 지연).
// - Threads: /{media-id}/insights?metric=views,likes,replies,reposts,quotes,shares (확인필요: threads_manage_insights 권한).
// - YouTube: Data API videos.list part=statistics (1 unit) — Analytics API 대신 사용한다. 공개 영상은 YOUTUBE_API_KEY로 충분하다.
// 공급자 지표는 "누적(lifetime)" 값이므로, 같은 날 여러 번 수집하면 그날 행을 최신 값으로 덮어쓴다(UNIQUE(job_id,metric_date,source)).

import { decryptChannelCredential } from './channel-credential-vault.js';

export const METRICS_TASK_KEY = 'marketing_metrics_collect';
export const METRICS_INTERVAL_MS = 6 * 3600_000;
export const METRICS_LOOKBACK_DAYS = 30;
export const METRICS_MAX_JOBS = 120;
export const DEFAULT_GRAPH_VERSION = 'v25.0';
const THREADS_GRAPH = 'https://graph.threads.net/v1.0';
const BACKOFF_BASE_MS = 15 * 60_000;
const BACKOFF_MAX_MS = 24 * 3600_000;
const GRAPH_RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80004, 80005, 80006, 80008]);
const YOUTUBE_RATE_REASONS = new Set(['quotaExceeded','rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded']);
const METRIC_FIELDS = Object.freeze(['views','reach','likes','comments','shares','saves','clicks','video_views']);

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const safeParse = (value, fallback) => { try { const parsed = JSON.parse(value || ''); return parsed ?? fallback; } catch { return fallback; } };
const count = value => { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n > 0 ? n : 0; };

export function kstDate(ms = Date.now()) { return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10); }

export function metricsPlatform(channel = {}) {
  const provider = String(channel.provider || '').toLowerCase();
  const type = String(channel.channel_type || '').toLowerCase();
  if (provider === 'facebook' || (provider === 'meta' && type === 'facebook_page')) return 'facebook';
  if (provider === 'instagram' || (provider === 'meta' && type === 'instagram_business')) return 'instagram';
  if (provider === 'threads') return 'threads';
  if (provider === 'youtube') return 'youtube';
  return '';
}

export function channelBackoffKey(channel = {}) { return `${metricsPlatform(channel) || 'unknown'}:${Number(channel.channel_id ?? channel.id ?? 0)}`; }

export class ProviderRateLimitError extends Error {
  constructor(message, retryAfterMs = 0) { super(message); this.code = 'PROVIDER_RATE_LIMITED'; this.retryAfterMs = retryAfterMs; }
}

function retryAfterMs(response) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

async function fetchJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, init);
  const data = await response.json().catch(() => ({}));
  const graphCode = Number(data?.error?.code);
  const ytReasons = (data?.error?.errors || []).map(item => String(item?.reason || ''));
  if (response.status === 429 || GRAPH_RATE_LIMIT_CODES.has(graphCode) || ytReasons.some(reason => YOUTUBE_RATE_REASONS.has(reason))) {
    throw new ProviderRateLimitError(clean(data?.error?.message || `HTTP ${response.status}`, 300), retryAfterMs(response));
  }
  if (!response.ok || data?.error) {
    throw Object.assign(new Error(clean(data?.error?.message || `HTTP ${response.status}`, 300)), { code:'PROVIDER_ERROR', status:response.status });
  }
  return data;
}

// Graph insights 응답(data[].values[0].value 또는 total_value.value)을 {name:value}로 편다.
export function flattenInsights(data) {
  const out = {};
  for (const row of Array.isArray(data?.data) ? data.data : []) {
    const name = String(row?.name || '');
    if (!name) continue;
    const value = row?.total_value?.value ?? row?.values?.[0]?.value;
    out[name] = typeof value === 'object' && value ? Object.values(value).reduce((sum, v) => sum + count(v), 0) : count(value);
  }
  return out;
}

const emptyMetrics = () => Object.fromEntries(METRIC_FIELDS.map(key => [key, 0]));

async function facebookMetrics(fetchImpl, postId, credential) {
  const version = clean(credential.graphVersion || DEFAULT_GRAPH_VERSION, 20);
  const token = encodeURIComponent(credential.accessToken);
  const base = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(postId)}`;
  const fields = await fetchJson(fetchImpl, `${base}?fields=${encodeURIComponent('shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)')}&access_token=${token}`);
  const metrics = emptyMetrics();
  metrics.likes = count(fields?.reactions?.summary?.total_count);
  metrics.comments = count(fields?.comments?.summary?.total_count);
  metrics.shares = count(fields?.shares?.count);
  try {
    const insights = flattenInsights(await fetchJson(fetchImpl, `${base}/insights?metric=${encodeURIComponent('post_media_view,post_total_media_view_unique,post_clicks')}&access_token=${token}`));
    metrics.views = count(insights.post_media_view);
    metrics.reach = count(insights.post_total_media_view_unique);
    metrics.clicks = count(insights.post_clicks);
  } catch (error) {
    if (error instanceof ProviderRateLimitError) throw error;
    metrics.insightsUnavailable = true; // 지표명 변경·권한 부족(확인필요) — 반응·댓글·공유는 그대로 저장한다.
  }
  return metrics;
}

async function instagramMetrics(fetchImpl, mediaId, credential) {
  const version = clean(credential.graphVersion || DEFAULT_GRAPH_VERSION, 20);
  const url = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(mediaId)}/insights?metric=${encodeURIComponent('views,reach,saved,shares,likes,comments')}&access_token=${encodeURIComponent(credential.accessToken)}`;
  const insights = flattenInsights(await fetchJson(fetchImpl, url));
  return { ...emptyMetrics(), views:count(insights.views), reach:count(insights.reach), likes:count(insights.likes), comments:count(insights.comments), shares:count(insights.shares), saves:count(insights.saved) };
}

async function threadsMetrics(fetchImpl, mediaId, credential) {
  // 확인필요: Threads insights 지표명은 공식 문서 기준 views·likes·replies·reposts·quotes·shares.
  const url = `${THREADS_GRAPH}/${encodeURIComponent(mediaId)}/insights?metric=${encodeURIComponent('views,likes,replies,reposts,quotes,shares')}&access_token=${encodeURIComponent(credential.accessToken)}`;
  const insights = flattenInsights(await fetchJson(fetchImpl, url));
  return { ...emptyMetrics(), views:count(insights.views), likes:count(insights.likes), comments:count(insights.replies), shares:count(insights.reposts) + count(insights.quotes) + count(insights.shares) };
}

async function youtubeMetrics(fetchImpl, videoId, credential) {
  const params = new URLSearchParams({ part:'statistics', id:videoId });
  const init = {};
  if (credential.apiKey) params.set('key', credential.apiKey);
  else init.headers = { authorization:`Bearer ${credential.accessToken}` };
  const data = await fetchJson(fetchImpl, `https://www.googleapis.com/youtube/v3/videos?${params}`, init);
  const stats = data?.items?.[0]?.statistics || {};
  const views = count(stats.viewCount);
  return { ...emptyMetrics(), views, video_views:views, likes:count(stats.likeCount), comments:count(stats.commentCount) };
}

export const METRIC_FETCHERS = Object.freeze({ facebook:facebookMetrics, instagram:instagramMetrics, threads:threadsMetrics, youtube:youtubeMetrics });

// ---------------------------------------------------------------- 자격증명 해석(기본 구현)
// 게시 Worker와 같은 저장소를 읽는다: (1) oauth: 참조 → channel_oauth_connections + channel-credential-vault(CHANNEL_CREDENTIAL_KEY)
// (2) env 비밀 이름 → JSON (3) oauth-vault(Marketing Growth) → marketing_oauth_connections v1 토큰(공급자 앱 비밀로 복호화).
// Control API에 해당 비밀이 없으면 null(=skip). 확인필요: Control API에 CHANNEL_CREDENTIAL_KEY · META_APP_SECRET ·
// THREADS_APP_SECRET · YOUTUBE_API_KEY가 등록돼 있어야 실제 수집이 시작된다.

function b64ToBytes(value) { const raw = atob(value); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
function vaultSecret(env, provider) {
  // marketing-growth-worker.js providerSecret()와 같은 규칙.
  if (provider === 'threads') return String(env.THREADS_APP_SECRET || env.META_APP_SECRET || '');
  if (provider === 'youtube') return String(env.MARKETING_OAUTH_VAULT_KEY || env.GOOGLE_CLIENT_SECRET || '');
  return String(env.META_APP_SECRET || '');
}
export async function decryptVaultToken(env, provider, ciphertext) {
  // marketing-growth-worker.js decryptToken()과 같은 v1.<iv>.<data> 형식(AES-GCM, SHA-256(공급자 비밀)).
  const secret = vaultSecret(env, provider);
  if (!secret) return '';
  const [version, iv64, data64] = String(ciphertext || '').split('.');
  if (version !== 'v1' || !iv64 || !data64) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', digest, { name:'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64ToBytes(iv64) }, key, b64ToBytes(data64));
  return new TextDecoder().decode(plain);
}

export async function resolveChannelCredential(env, channel) {
  const platform = metricsPlatform(channel);
  const config = safeParse(channel.config_json, {});
  const graphVersion = clean(config.graphVersion || env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION, 20);
  if (platform === 'youtube' && env.YOUTUBE_API_KEY) return { apiKey:String(env.YOUTUBE_API_KEY), source:'api_key' };
  try {
    if (config.credentialMode === 'oauth-vault' && Number(config.oauthConnectionId) > 0) {
      const row = await env.DB.prepare(`SELECT provider,token_ciphertext,status FROM marketing_oauth_connections WHERE id=? AND subject_type=? AND subject_key=?`)
        .bind(Number(config.oauthConnectionId), channel.subject_type, channel.subject_key).first();
      if (!row || row.status !== 'active') return null;
      const token = await decryptVaultToken(env, row.provider, row.token_ciphertext);
      // YouTube vault 토큰은 refresh token이라 키 없이 바로 쓸 수 없다 → YOUTUBE_API_KEY가 없으면 skip.
      if (!token || platform === 'youtube') return null;
      return { accessToken:token, graphVersion, source:'oauth_vault' };
    }
    const ref = String(channel.credential_ref || '');
    if (!ref) return null;
    let secret = null;
    if (ref.startsWith('oauth:')) {
      // channel-oauth-control.managedCredential()과 같은 조회(게시 Worker 어댑터 묶음을 Control API에 끌어오지 않는다).
      if (!env.CHANNEL_CREDENTIAL_KEY) return null;
      const row = await env.DB.prepare("SELECT * FROM channel_oauth_connections WHERE id=? AND status='active'").bind(ref.slice('oauth:'.length)).first();
      if (!row) return null;
      secret = await decryptChannelCredential(env, row);
    } else if (env[ref]) {
      secret = typeof env[ref] === 'object' ? env[ref] : safeParse(String(env[ref]), null);
    }
    if (!secret) return null;
    const accessToken = String(secret.accessToken || secret.access_token || '');
    if (!accessToken) return null;
    return { accessToken, graphVersion:clean(secret.graphVersion || graphVersion, 20), source:'channel_secret' };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- DB

async function activeBackoffs(env, nowIso) {
  try {
    const rows = await env.DB.prepare('SELECT channel_key,failures,retry_after FROM marketing_metrics_backoff').all();
    const map = new Map();
    for (const row of rows.results || []) map.set(row.channel_key, { failures:Number(row.failures || 0), active:String(row.retry_after) > nowIso });
    return map;
  } catch { return new Map(); }
}

export function backoffDelayMs(failures, hintMs = 0) {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.min(BACKOFF_MAX_MS, Math.max(exp, Number(hintMs) || 0));
}

async function recordBackoff(env, key, failures, error, nowMs) {
  const retryAfter = new Date(nowMs + backoffDelayMs(failures, error?.retryAfterMs)).toISOString();
  await env.DB.prepare(`INSERT INTO marketing_metrics_backoff(channel_key,failures,retry_after,last_error,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(channel_key) DO UPDATE SET failures=excluded.failures,retry_after=excluded.retry_after,last_error=excluded.last_error,updated_at=excluded.updated_at`)
    .bind(key, failures, retryAfter, clean(error?.message, 300), new Date(nowMs).toISOString()).run();
  return retryAfter;
}

async function clearBackoff(env, key) {
  await env.DB.prepare('DELETE FROM marketing_metrics_backoff WHERE channel_key=?').bind(key).run();
}

export async function upsertPostMetrics(env, job, metricDate, metrics, nowIso) {
  const values = METRIC_FIELDS.map(key => count(metrics[key]));
  const raw = JSON.stringify({ kind:'lifetime', platform:metricsPlatform(job), ...Object.fromEntries(METRIC_FIELDS.map((key, i) => [key, values[i]])), ...(metrics.insightsUnavailable ? { insightsUnavailable:true } : {}) });
  await env.DB.prepare(`INSERT INTO marketing_post_metrics(job_id,variant_id,channel,external_post_id,metric_date,views,reach,likes,comments,shares,saves,clicks,video_views,source,raw_json,collected_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'provider_api',?,?)
    ON CONFLICT(job_id,metric_date,source) DO UPDATE SET views=excluded.views,reach=excluded.reach,likes=excluded.likes,comments=excluded.comments,
      shares=excluded.shares,saves=excluded.saves,clicks=excluded.clicks,video_views=excluded.video_views,raw_json=excluded.raw_json,collected_at=excluded.collected_at`)
    .bind(Number(job.job_id), job.variant_id == null ? null : Number(job.variant_id), metricsPlatform(job), clean(job.external_post_id, 240), metricDate, ...values, raw, nowIso).run();
}

export async function listCollectableJobs(env, { nowMs = Date.now(), lookbackDays = METRICS_LOOKBACK_DAYS, limit = METRICS_MAX_JOBS } = {}) {
  const since = new Date(nowMs - lookbackDays * 86400_000).toISOString();
  const rows = await env.DB.prepare(`SELECT j.id AS job_id, j.variant_id, j.external_post_id, j.published_at, j.channel_id,
      c.provider, c.channel_type, c.credential_ref, c.config_json, c.subject_type, c.subject_key
    FROM marketing_publication_jobs j JOIN marketing_publish_channels c ON c.id=j.channel_id
    WHERE j.status='published' AND j.external_post_id<>'' AND j.published_at IS NOT NULL AND j.published_at>=?
    ORDER BY j.published_at DESC LIMIT ?`).bind(since, limit).all();
  return rows.results || [];
}

// ---------------------------------------------------------------- 실행

export async function collectPostMetrics(env, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const nowMs = typeof options.now === 'function' ? options.now() : (options.now ?? Date.now());
  const nowIso = new Date(nowMs).toISOString();
  const resolve = options.resolveCredential || resolveChannelCredential;
  const fetchers = options.fetchers || METRIC_FETCHERS;
  const summary = { ok:true, collected:0, skipped:0, failed:0, rateLimited:0, backedOff:0, skips:{}, channels:{} };
  const skip = reason => { summary.skipped += 1; summary.skips[reason] = (summary.skips[reason] || 0) + 1; };
  if (!env?.DB?.prepare) return { ...summary, ok:false, error:'DB_UNAVAILABLE' };
  let jobs;
  try { jobs = await listCollectableJobs(env, { nowMs, lookbackDays:options.lookbackDays, limit:options.limit }); }
  catch (error) { return { ...summary, ok:false, error:clean(error?.message || 'JOB_QUERY_FAILED', 200) }; }
  const backoffs = await activeBackoffs(env, nowIso);
  const credentials = new Map();
  const blocked = new Set();
  const succeeded = new Set();
  const metricDate = kstDate(nowMs);
  for (const job of jobs) {
    const platform = metricsPlatform(job);
    if (!platform || !fetchers[platform]) { skip('UNSUPPORTED_CHANNEL'); continue; }
    const key = channelBackoffKey(job);
    if (blocked.has(key) || backoffs.get(key)?.active) { summary.backedOff += 1; continue; }
    if (!credentials.has(key)) {
      let credential = null;
      try { credential = await resolve(env, job); } catch { credential = null; }
      credentials.set(key, credential);
    }
    const credential = credentials.get(key);
    if (!credential || !(credential.accessToken || credential.apiKey)) { skip('TOKEN_UNAVAILABLE'); continue; }
    try {
      const metrics = await fetchers[platform](fetchImpl, clean(job.external_post_id, 240), credential);
      await upsertPostMetrics(env, job, metricDate, metrics, nowIso);
      summary.collected += 1;
      summary.channels[platform] = (summary.channels[platform] || 0) + 1;
      succeeded.add(key);
    } catch (error) {
      if (error instanceof ProviderRateLimitError || error?.code === 'PROVIDER_RATE_LIMITED') {
        summary.rateLimited += 1;
        blocked.add(key);
        const failures = (backoffs.get(key)?.failures || 0) + 1;
        try { await recordBackoff(env, key, failures, error, nowMs); } catch {}
      } else {
        summary.failed += 1;
      }
    }
  }
  for (const key of succeeded) if (!blocked.has(key) && backoffs.has(key)) { try { await clearBackoff(env, key); } catch {} }
  return summary;
}

// ---------------------------------------------------------------- 상태 기반 주기 실행(cron 공용)

export async function schedulerDue(env, taskKey, { nowMs = Date.now(), intervalMs, sameKstDay = false, minKstHour = 0 } = {}) {
  try {
    const row = await env.DB.prepare('SELECT last_started_at,last_success_at FROM marketing_scheduler_state WHERE task_key=?').bind(taskKey).first();
    if (sameKstDay) {
      const kstHour = new Date(nowMs + 9 * 3600_000).getUTCHours();
      if (kstHour < minKstHour) return false;
      if (row?.last_success_at && kstDate(Date.parse(row.last_success_at)) === kstDate(nowMs)) return false;
      // 같은 날 실패했으면 1시간 뒤 재시도.
      if (row?.last_started_at && nowMs - Date.parse(row.last_started_at) < 3600_000) return false;
      return true;
    }
    const last = Date.parse(row?.last_started_at || '');
    return !Number.isFinite(last) || nowMs - last >= intervalMs;
  } catch {
    return false; // 스키마가 아직 없으면(마이그레이션 전) 실행하지 않는다.
  }
}

export async function markScheduler(env, taskKey, phase, { nowMs = Date.now(), status = '', detail = {} } = {}) {
  const nowIso = new Date(nowMs).toISOString();
  const detailJson = JSON.stringify(detail).slice(0, 4000);
  if (phase === 'start') {
    await env.DB.prepare(`INSERT INTO marketing_scheduler_state(task_key,last_started_at,last_status,detail_json,updated_at) VALUES(?,?,'running','{}',?)
      ON CONFLICT(task_key) DO UPDATE SET last_started_at=excluded.last_started_at,last_status='running',updated_at=excluded.updated_at`).bind(taskKey, nowIso, nowIso).run();
    return;
  }
  const success = phase === 'success';
  await env.DB.prepare(`UPDATE marketing_scheduler_state SET last_status=?,detail_json=?,updated_at=?${success ? ',last_success_at=?' : ''} WHERE task_key=?`)
    .bind(clean(status || phase, 40), detailJson, nowIso, ...(success ? [nowIso] : []), taskKey).run();
}

export async function runScheduledMetricsCollection(env, options = {}) {
  const nowMs = options.now ?? Date.now();
  try {
    if (!env?.DB?.prepare) return { ran:false, reason:'DB_UNAVAILABLE' };
    if (!(await schedulerDue(env, METRICS_TASK_KEY, { nowMs, intervalMs:METRICS_INTERVAL_MS }))) return { ran:false, reason:'NOT_DUE' };
    await markScheduler(env, METRICS_TASK_KEY, 'start', { nowMs });
    const summary = await collectPostMetrics(env, { ...options, now:nowMs });
    await markScheduler(env, METRICS_TASK_KEY, summary.ok ? 'success' : 'failure', { nowMs, status:summary.ok ? 'ok' : 'failed', detail:summary });
    return { ran:true, ...summary };
  } catch (error) {
    return { ran:false, ok:false, error:clean(error?.message || 'METRICS_SCHEDULE_FAILED', 200) };
  }
}
