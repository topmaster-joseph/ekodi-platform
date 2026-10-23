// EKODI AI Social Growth Phase 7 — 게시 하드닝 공용 모듈(출시 전).
// marketing-publishing-worker.js와 marketing-growth-worker.js가 함께 쓴다. D1은 인자로 받은 db만 사용하고,
// 외부 호출은 주입된 fetchImpl로만 한다.
// 1) 포맷·AI 표시·캡션 정직성  2) YouTube 공개 범위 정책  3) 표준 게시물 URL
// 4) Idempotency-Key 저장소(marketing_request_idempotency, 0207)  5) 변형 게시 완료 표시
// 6) OAuth 토큰 상태 점검(Threads 갱신, Meta 재인증 표시)

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const safeParse = (value, fallback = {}) => { try { return JSON.parse(value || ''); } catch { return fallback; } };
function httpsUrl(value) {
  const raw = clean(value, 2048);
  if (!raw) return '';
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
const missingTable = error => /no such table/i.test(String(error?.message || error));

// ---------------------------------------------------------------- 포맷·AI

export const PUBLISH_FORMATS = Object.freeze(['feed','photo','carousel','reel','short','video','story','blog_draft']);

// 콘텐츠 스튜디오 스냅샷(content_json.studio.format) 또는 직접 지정(content_json.format)에서 포맷을 읽는다.
export function contentFormat(contentJson) {
  const data = typeof contentJson === 'string' ? safeParse(contentJson, {}) : (contentJson || {});
  const format = clean(data?.studio?.format || data?.format, 30).toLowerCase();
  return PUBLISH_FORMATS.includes(format) ? format : '';
}

export function contentIsAiGenerated(contentJson) {
  const data = typeof contentJson === 'string' ? safeParse(contentJson, {}) : (contentJson || {});
  return data?.isAiGenerated === true;
}

// AI 생성 콘텐츠인데 캡션이 "AI 미사용/사람이 직접 작성" 등으로 주장하면 게시하지 않는다(재시도 없음).
const MISLEADING_AI_CLAIMS = Object.freeze([
  /AI\s*(?:를|을)?\s*(?:사용하지|쓰지|활용하지)\s*않/i,
  /AI\s*미\s*사용/i,
  /AI\s*없이/i,
  /사람이\s*직접\s*(?:작성|만든|쓴|촬영|그린)/,
  /100\s*%\s*(?:수작업|사람|직접|인간)/,
  /\bno\s+AI\b/i,
  /\bnot\s+AI[-\s]?generated\b/i,
  /\bAI[-\s]?free\b/i,
  /\bhuman[-\s]?(?:made|written|created)\b/i,
]);
export function misleadingAiClaim(caption) {
  const text = String(caption || '');
  const hit = MISLEADING_AI_CLAIMS.find(pattern => pattern.test(text));
  return hit ? clean(text.match(hit)?.[0], 80) : '';
}
export function assertAiCaptionHonest(caption, isAiGenerated) {
  if (!isAiGenerated) return;
  const claim = misleadingAiClaim(caption);
  if (claim) throw Object.assign(new Error(`AI 생성 콘텐츠의 캡션에 사실과 다른 표현("${claim}")이 있어 게시하지 않습니다.`), { code:'AI_CAPTION_MISLEADING', retryable:false });
}

// ---------------------------------------------------------------- YouTube 공개 범위

const YOUTUBE_PRIVACY = Object.freeze(['private','unlisted','public']);

// 기본은 private. 작업(job) 설정 > 채널 설정(marketing_channel_settings.publish_privacy) 순으로 public/unlisted를 허용한다.
// publishAt 예약은 YouTube API 규칙상 privacyStatus=private + 한 번도 공개된 적 없는 영상이어야 하므로
// 새로 업로드하는 영상에 private+publishAt을 강제한다.
export function resolveYoutubePrivacy({ jobPrivacy = '', channelPrivacy = '', publishAt = '', now = Date.now() } = {}) {
  const job = clean(jobPrivacy, 20).toLowerCase(), channel = clean(channelPrivacy, 20).toLowerCase();
  const source = YOUTUBE_PRIVACY.includes(job) ? 'job' : YOUTUBE_PRIVACY.includes(channel) ? 'channel' : 'default';
  const requested = source === 'job' ? job : source === 'channel' ? channel : 'private';
  const at = Date.parse(publishAt || '');
  if (Number.isFinite(at) && at > now) return { privacyStatus:'private', publishAt:new Date(at).toISOString(), requestedPrivacy:requested, source, scheduled:true };
  return { privacyStatus:requested, publishAt:'', requestedPrivacy:requested, source, scheduled:false };
}

// ---------------------------------------------------------------- 표준 게시물 URL

export function canonicalPostUrl({ provider = '', id = '', permalink = '', format = '', channelType = '' } = {}) {
  const p = String(provider || '').toLowerCase();
  const postId = clean(id, 240);
  if (p === 'facebook' || p === 'meta' && channelType === 'facebook_page') {
    const raw = clean(permalink, 2048);
    if (raw.startsWith('/')) return `https://www.facebook.com${raw}`;
    const link = httpsUrl(raw);
    if (link) return link;
    if (!postId) return '';
    return format === 'reel' ? `https://www.facebook.com/reel/${encodeURIComponent(postId)}` : `https://www.facebook.com/${encodeURIComponent(postId)}`;
  }
  if (p === 'youtube') {
    if (!postId) return '';
    const short = format === 'short' || channelType === 'youtube_short';
    return short ? `https://www.youtube.com/shorts/${encodeURIComponent(postId)}` : `https://www.youtube.com/watch?v=${encodeURIComponent(postId)}`;
  }
  // Instagram·Threads는 공급자가 돌려준 permalink만 표준 URL로 인정한다(미디어 id로 URL을 추측하지 않는다).
  return httpsUrl(permalink);
}

// ---------------------------------------------------------------- 변형 상태

export async function markVariantPublished(db, variantId, at = new Date().toISOString()) {
  const id = Number(variantId || 0);
  if (!db || !Number.isInteger(id) || id <= 0) return false;
  try {
    const result = await db.prepare("UPDATE marketing_content_variants SET status='published',updated_at=? WHERE id=? AND status IN ('approved','scheduled')").bind(at, id).run();
    return Number(result?.meta?.changes || 0) > 0;
  } catch (error) {
    if (missingTable(error)) return false;
    throw error;
  }
}

// Facebook Reels 30개/24시간 소프트 가드: EKODI가 게시 완료로 기록한 Reels 수로 판단한다.
export async function recentPublishedReels(db, channelId, sinceIso) {
  const row = await db.prepare(`SELECT count(*) AS n, MIN(published_at) AS first_at FROM marketing_publication_jobs
    WHERE channel_id=? AND status='published' AND published_at>=? AND json_extract(provider_response_json,'$.format')='reel'`).bind(Number(channelId), sinceIso).first();
  return { count:Number(row?.n || 0), firstAt:row?.first_at || '' };
}

// ---------------------------------------------------------------- Idempotency-Key

export const IDEMPOTENCY_PENDING_STALE_MS = 10 * 60 * 1000;

// undefined/빈 값 → '' (미사용), 형식 오류 → null.
export function normalizeIdempotencyKey(value) {
  const key = String(value ?? '').trim();
  if (!key) return '';
  if (key.length < 8 || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) return null;
  return key;
}

export async function idempotencyRecordKey(scope, key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${scope}\n${key}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readIdempotency(db, id) {
  return db.prepare('SELECT key,scope,status,job_id,content_id,response_status,response_json,created_at,updated_at FROM marketing_request_idempotency WHERE key=?').bind(id).first();
}

function replayOf(row) {
  return { state:'replay', id:row.key, jobId:row.job_id == null ? null : Number(row.job_id), status:Number(row.response_status || 200), body:safeParse(row.response_json, {}) };
}

// 반환: {state:'none'} 키 없음, {state:'invalid'}, {state:'unavailable'} 테이블 미적용,
// {state:'new', id}, {state:'replay', id, status, body, jobId}, {state:'in_progress', id}
export async function beginIdempotentRequest(db, { scope, key, now = Date.now() } = {}) {
  const normalized = normalizeIdempotencyKey(key);
  if (normalized === '') return { state:'none' };
  if (normalized === null) return { state:'invalid' };
  const id = await idempotencyRecordKey(scope, normalized);
  const stamp = new Date(now).toISOString();
  try {
    const existing = await readIdempotency(db, id);
    if (existing) {
      if (existing.status === 'completed') return replayOf(existing);
      if (now - Date.parse(existing.updated_at || existing.created_at) < IDEMPOTENCY_PENDING_STALE_MS) return { state:'in_progress', id };
      const taken = await db.prepare("UPDATE marketing_request_idempotency SET updated_at=? WHERE key=? AND status='pending' AND updated_at=?").bind(stamp, id, existing.updated_at).run();
      return Number(taken?.meta?.changes || 0) > 0 ? { state:'new', id } : { state:'in_progress', id };
    }
    try {
      await db.prepare("INSERT INTO marketing_request_idempotency(key,scope,status,response_json,created_at,updated_at) VALUES(?,?,'pending','{}',?,?)").bind(id, clean(scope, 200), stamp, stamp).run();
      return { state:'new', id };
    } catch (error) {
      if (missingTable(error)) throw error;
      const raced = await readIdempotency(db, id);
      if (raced?.status === 'completed') return replayOf(raced);
      return { state:'in_progress', id };
    }
  } catch (error) {
    if (missingTable(error)) return { state:'unavailable' };
    throw error;
  }
}

export async function completeIdempotentRequest(db, id, { jobId = null, contentId = null, status = 200, body = {} } = {}) {
  if (!id) return;
  await db.prepare("UPDATE marketing_request_idempotency SET status='completed',job_id=?,content_id=?,response_status=?,response_json=?,updated_at=? WHERE key=?")
    .bind(jobId == null ? null : Number(jobId), contentId == null ? null : Number(contentId), Number(status), JSON.stringify(body ?? {}), new Date().toISOString(), id).run();
}

export async function abandonIdempotentRequest(db, id) {
  if (!id) return;
  await db.prepare("DELETE FROM marketing_request_idempotency WHERE key=? AND status='pending'").bind(id).run();
}

// ---------------------------------------------------------------- OAuth 토큰 상태

export const THREADS_REFRESH_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
export const META_REAUTH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const NEEDS_REAUTH_PREFIX = 'needs_reauth';
const META_PROVIDERS = Object.freeze(['facebook','instagram','facebook_ads']);

// 하루 한 번(UTC 18:17 = KST 03:17) 매분 크론에서 실행한다. 새 Worker·새 크론을 만들지 않는다.
export function tokenHealthDue(date = new Date()) {
  return date.getUTCHours() === 18 && date.getUTCMinutes() === 17;
}

async function connectionAudit(db, row, action, detail, at) {
  await db.prepare('INSERT INTO marketing_publication_audit(subject_type,subject_key,workspace_id,job_id,action,detail,actor,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(row.subject_type, row.subject_key, '', null, action, clean(`${row.provider}:${row.external_id}:${detail}`, 1000), 'token-health', at).run();
}

async function pauseChannels(db, row, at) {
  if (!['facebook','instagram','threads'].includes(row.provider)) return;
  await db.prepare("UPDATE marketing_publish_channels SET status='credentials_required',last_error='token_needs_reauth',last_check_at=?,updated_at=? WHERE subject_type=? AND subject_key=? AND provider=? AND external_account_id=? AND status='active'")
    .bind(at, at, row.subject_type, row.subject_key, row.provider, row.external_id).run();
}

// 만료됐거나 무효: status='expired'(0028 CHECK 제약상 'needs_reauth' 상태값이 없다) + last_error 'needs_reauth: …'.
async function markExpired(db, row, reason, at) {
  await db.prepare("UPDATE marketing_oauth_connections SET status='expired',last_check_at=?,last_error=?,updated_at=? WHERE id=?")
    .bind(at, clean(`${NEEDS_REAUTH_PREFIX}: ${reason}`, 500), at, row.id).run();
  await pauseChannels(db, row, at);
  await connectionAudit(db, row, 'oauth_token_needs_reauth', `expired:${reason}`, at);
  return 'expired';
}

// 곧 만료: 토큰은 아직 유효하므로 게시를 멈추지 않고 재인증 필요만 표시한다(관리자 채널 화면의 last_error로 노출).
async function markNeedsReauth(db, row, reason, at) {
  const already = String(row.last_error || '').startsWith(NEEDS_REAUTH_PREFIX);
  await db.prepare('UPDATE marketing_oauth_connections SET last_check_at=?,last_error=?,updated_at=? WHERE id=?')
    .bind(at, clean(`${NEEDS_REAUTH_PREFIX}: ${reason}`, 500), at, row.id).run();
  if (!already) await connectionAudit(db, row, 'oauth_token_needs_reauth', reason, at);
  return 'needsReauth';
}

async function markHealthy(db, row, at, expiresAt) {
  const keepError = String(row.last_error || '');
  const nextError = keepError.startsWith(NEEDS_REAUTH_PREFIX) || keepError.startsWith('token_health') ? '' : keepError;
  if (expiresAt === undefined) {
    await db.prepare('UPDATE marketing_oauth_connections SET last_check_at=?,last_error=?,updated_at=? WHERE id=?').bind(at, nextError, at, row.id).run();
  } else {
    await db.prepare('UPDATE marketing_oauth_connections SET token_expires_at=?,last_check_at=?,last_error=?,updated_at=? WHERE id=?').bind(expiresAt, at, nextError, at, row.id).run();
  }
  return 'healthy';
}

async function threadsHealth({ db, fetchImpl, row, now, decrypt, encrypt }) {
  const at = new Date(now).toISOString();
  const expMs = Date.parse(row.token_expires_at || '');
  if (!Number.isFinite(expMs) || expMs - now > THREADS_REFRESH_WINDOW_MS) return markHealthy(db, row, at);
  if (expMs <= now) return markExpired(db, row, 'Threads 토큰 만료 — 재연결 필요', at);
  const token = await decrypt(row);
  const url = new URL('https://graph.threads.net/refresh_access_token');
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', token);
  let data = {};
  try {
    const response = await fetchImpl(url.href, { method:'GET' });
    data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error || !data?.access_token) throw new Error(clean(data?.error?.message || `HTTP_${response.status}`, 200));
  } catch (error) {
    return markNeedsReauth(db, row, `Threads 토큰 갱신 실패(${clean(error?.message, 160)}) — 만료 ${new Date(expMs).toISOString()}`, at);
  }
  const ciphertext = await encrypt(row, String(data.access_token));
  const expiresIn = Number(data.expires_in || 0);
  const expiresAt = expiresIn > 0 ? new Date(now + expiresIn * 1000).toISOString() : null;
  await db.prepare("UPDATE marketing_oauth_connections SET token_ciphertext=?,token_expires_at=?,status='active',last_check_at=?,last_error='',updated_at=? WHERE id=?")
    .bind(ciphertext, expiresAt, at, at, row.id).run();
  await connectionAudit(db, row, 'oauth_token_refreshed', `expires:${expiresAt || 'unknown'}`, at);
  return 'refreshed';
}

async function metaDebugToken({ fetchImpl, token, appId, appSecret, graphVersion }) {
  if (!appId || !appSecret) return null;
  const url = new URL(`https://graph.facebook.com/${clean(graphVersion || 'v25.0', 16)}/debug_token`);
  url.searchParams.set('input_token', token);
  url.searchParams.set('access_token', `${appId}|${appSecret}`);
  try {
    const response = await fetchImpl(url.href, { method:'GET' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error || !data?.data) return null;
    return data.data;
  } catch { return null; }
}

async function metaHealth({ db, fetchImpl, row, now, decrypt, metaAppId, metaAppSecret, graphVersion }) {
  const at = new Date(now).toISOString();
  let expMs = Date.parse(row.token_expires_at || '');
  let expiresUpdate;
  const token = await decrypt(row);
  const debug = await metaDebugToken({ fetchImpl, token, appId:metaAppId, appSecret:metaAppSecret, graphVersion });
  if (debug) {
    if (debug.is_valid === false) return markExpired(db, row, clean(`Meta 토큰 무효(${debug?.error?.message || 'debug_token is_valid=false'})`, 300), at);
    const exp = Number(debug.expires_at);
    if (Number.isFinite(exp) && exp === 0) { expMs = Number.POSITIVE_INFINITY; expiresUpdate = row.token_expires_at ? null : undefined; }
    else if (Number.isFinite(exp) && exp > 0) { expMs = exp * 1000; expiresUpdate = new Date(expMs).toISOString(); }
  }
  if (Number.isFinite(expMs) && expMs <= now) return markExpired(db, row, 'Meta 토큰 만료 — 재연결 필요', at);
  if (Number.isFinite(expMs) && expMs - now <= META_REAUTH_WINDOW_MS) {
    if (expiresUpdate !== undefined) await db.prepare('UPDATE marketing_oauth_connections SET token_expires_at=? WHERE id=?').bind(expiresUpdate, row.id).run();
    return markNeedsReauth(db, row, `Meta 토큰 만료 임박(${new Date(expMs).toISOString()}) — 재연결 필요`, at);
  }
  return markHealthy(db, row, at, expiresUpdate);
}

export async function runOAuthTokenHealth({
  db, fetchImpl = globalThis.fetch, now = Date.now(), decrypt, encrypt,
  metaAppId = '', metaAppSecret = '', graphVersion = 'v25.0', limit = 200,
} = {}) {
  const summary = { checked:0, healthy:0, refreshed:0, needsReauth:0, expired:0, errors:0 };
  let rows = [];
  try {
    const result = await db.prepare(`SELECT id,subject_type,subject_key,provider,resource_type,external_id,token_ciphertext,token_expires_at,status,last_error
      FROM marketing_oauth_connections WHERE status='active' AND provider IN ('threads','facebook','instagram','facebook_ads') ORDER BY id LIMIT ?`).bind(Number(limit)).all();
    rows = result.results || [];
  } catch (error) {
    if (missingTable(error)) return { ...summary, schemaReady:false };
    throw error;
  }
  for (const row of rows) {
    summary.checked += 1;
    try {
      const outcome = row.provider === 'threads'
        ? await threadsHealth({ db, fetchImpl, row, now, decrypt, encrypt })
        : META_PROVIDERS.includes(row.provider) ? await metaHealth({ db, fetchImpl, row, now, decrypt, metaAppId, metaAppSecret, graphVersion }) : 'healthy';
      summary[outcome] += 1;
    } catch (error) {
      summary.errors += 1;
      const at = new Date(now).toISOString();
      await db.prepare('UPDATE marketing_oauth_connections SET last_check_at=?,last_error=?,updated_at=? WHERE id=?')
        .bind(at, clean(`token_health_error: ${error?.message || error}`, 500), at, row.id).run().catch(() => {});
    }
  }
  return { ...summary, schemaReady:true };
}
