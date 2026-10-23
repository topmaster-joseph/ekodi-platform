// EKODI AI Social Growth Phase 7 — Meta(Facebook Page·Instagram) Reels 게시 어댑터.
// 순수 함수 모듈: fetch·sleep·now를 주입받으며 D1·env를 직접 만지지 않는다.
// marketing-publishing-worker.js(예약 큐·레거시 secret 경로)와 marketing-growth-worker.js(OAuth Vault·즉시 게시)가
// 같은 함수를 공유한다. 실제 네트워크는 호출자가 넘긴 fetchImpl로만 나간다.
//
// 공식 제약(2026-10 기준):
// - Facebook Page Reels: POST /{page-id}/video_reels upload_phase=start → rupload.facebook.com 업로드
//   (호스팅된 파일은 file_url 헤더) → upload_phase=finish, video_state=PUBLISHED|SCHEDULED
//   (+scheduled_publish_time, 10분~29일). Page당 24시간 30개.
// - Instagram Reels: POST /{ig-user-id}/media media_type=REELS video_url=… → 컨테이너 status_code가
//   FINISHED가 될 때까지 폴링 → POST /{ig-user-id}/media_publish. 계정당 24시간 게시 한도는
//   GET /{ig-user-id}/content_publishing_limit로 확인한다(미확인 시 50으로 설계).
// - Instagram에는 네이티브 예약이 없다. 예약은 EKODI 스케줄러가 담당한다.

const GRAPH_HOST = 'https://graph.facebook.com';
const RUPLOAD_HOST = 'rupload.facebook.com';

export const FB_REELS_DAILY_LIMIT = 30;
export const IG_PUBLISH_LIMIT_FALLBACK = 50;
export const IG_REEL_POLL_BUDGET_MS = 5 * 60 * 1000;
export const IG_REEL_POLL_DELAYS_MS = Object.freeze([3000, 5000, 10000, 15000, 30000]);
export const IG_CONTAINER_RESUME_MAX_MS = 2 * 60 * 60 * 1000;
export const FB_REEL_SCHEDULE_MIN_MS = 10 * 60 * 1000;
export const FB_REEL_SCHEDULE_MAX_MS = 29 * 24 * 60 * 60 * 1000;
// 확인필요: Instagram Graph API의 AI 생성 표시 파라미터 이름(is_ai_generated)과 지원 시작 버전은
// 공개 문서로 확정하지 못했다. 그래서 기본값은 "보내지 않음"이며, 운영자가 META_AI_LABEL_ENABLED=true를
// 설정하고 Graph 버전이 아래 최소 버전 이상일 때만 선택 필드로 붙인다.
export const META_AI_LABEL_PARAM = 'is_ai_generated';
export const META_AI_LABEL_MIN_VERSION = 'v25.0';

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function metaError(code, message, extra = {}) {
  return Object.assign(new Error(message || code), { code, ...extra });
}

function httpsUrl(value) {
  const raw = clean(value, 2048);
  if (!raw) return '';
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

export function graphVersion(value) {
  const version = clean(value, 16);
  if (!/^v\d{1,3}\.\d{1,3}$/.test(version)) throw metaError('INVALID_CREDENTIAL_CONFIG', 'Graph API 버전 형식이 올바르지 않습니다.');
  return version;
}

export function graphVersionAtLeast(version, minimum) {
  const parse = value => { const m = /^v(\d+)\.(\d+)$/.exec(String(value || '')); return m ? [Number(m[1]), Number(m[2])] : null; };
  const a = parse(version), b = parse(minimum);
  if (!a || !b) return false;
  return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);
}

async function graphCall(fetchImpl, url, { method = 'GET', form = null, headers = {} } = {}) {
  const init = { method, headers:{ ...headers } };
  if (form) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
    init.body = body;
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  const response = await fetchImpl(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw metaError('PROVIDER_ERROR', clean(data?.error?.message || `Meta HTTP ${response.status}`, 600), { status:response.status, providerCode:data?.error?.code ?? null });
  }
  return data;
}

// Facebook의 permalink_url은 "/reel/…" 같은 상대 경로로 올 수 있다.
export function absoluteFacebookUrl(value) {
  const raw = clean(value, 2048);
  if (!raw) return '';
  if (raw.startsWith('/')) return `https://www.facebook.com${raw}`;
  const url = httpsUrl(raw);
  if (!url) return '';
  const host = new URL(url).hostname;
  return host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch' ? url : '';
}

// ---------------------------------------------------------------- AI 표시

export function metaAiLabelFields({ isAiGenerated = false, version = '', enabled = false, param = META_AI_LABEL_PARAM } = {}) {
  if (!isAiGenerated) return { fields:{}, label:{ isAiGenerated:false, sent:false } };
  if (!enabled) return { fields:{}, label:{ isAiGenerated:true, sent:false, reason:'platform_flag_disabled' } };
  if (!graphVersionAtLeast(version, META_AI_LABEL_MIN_VERSION)) return { fields:{}, label:{ isAiGenerated:true, sent:false, reason:'graph_version_unsupported' } };
  const name = /^[a-z_]{3,40}$/.test(String(param || '')) ? String(param) : META_AI_LABEL_PARAM;
  return { fields:{ [name]:'true' }, label:{ isAiGenerated:true, sent:true, param:name } };
}

// ---------------------------------------------------------------- Facebook Page Reels

export function facebookReelSchedule(scheduledPublishTime, now = Date.now()) {
  if (!scheduledPublishTime) return { videoState:'PUBLISHED', scheduledPublishTime:'' };
  const at = Date.parse(scheduledPublishTime);
  if (!Number.isFinite(at)) throw metaError('INVALID_SCHEDULE', 'Reels 예약 시각 형식이 올바르지 않습니다.', { retryable:false });
  const delta = at - now;
  if (delta < FB_REEL_SCHEDULE_MIN_MS) return { videoState:'PUBLISHED', scheduledPublishTime:'' };
  if (delta > FB_REEL_SCHEDULE_MAX_MS) throw metaError('INVALID_SCHEDULE', 'Facebook Reels 예약은 29일 이내만 가능합니다.', { retryable:false });
  return { videoState:'SCHEDULED', scheduledPublishTime:String(Math.floor(at / 1000)) };
}

export async function publishFacebookReel({
  fetchImpl = globalThis.fetch, graphVersion:version, pageId, accessToken, videoUrl,
  description = '', title = '', scheduledPublishTime = '', now = Date.now(),
} = {}) {
  const v = graphVersion(version);
  const page = clean(pageId, 160);
  const token = String(accessToken || '');
  if (!page || !token) throw metaError('INVALID_CREDENTIAL_CONFIG', 'Facebook Page 인증정보가 불완전합니다.');
  const video = httpsUrl(videoUrl);
  if (!video) throw metaError('ASSET_REQUIRED', 'Facebook Reels 게시에는 공개 HTTPS 영상 URL이 필요합니다.', { retryable:false });
  const schedule = facebookReelSchedule(scheduledPublishTime, now);
  const endpoint = `${GRAPH_HOST}/${v}/${encodeURIComponent(page)}/video_reels`;

  // 1) start — video_id와 업로드 URL을 받는다.
  const started = await graphCall(fetchImpl, endpoint, { method:'POST', form:{ upload_phase:'start', access_token:token } });
  const videoId = clean(started.video_id, 160);
  if (!videoId) throw metaError('PROVIDER_ERROR', 'Facebook Reels 업로드 세션을 만들지 못했습니다.');
  let uploadUrl = httpsUrl(started.upload_url);
  if (!uploadUrl || new URL(uploadUrl).hostname !== RUPLOAD_HOST) uploadUrl = `https://${RUPLOAD_HOST}/video-upload/${v}/${encodeURIComponent(videoId)}`;

  // 2) upload — 호스팅된 파일은 file_url 헤더로 넘긴다(바이트를 Worker로 내려받지 않는다).
  const uploaded = await fetchImpl(uploadUrl, { method:'POST', headers:{ authorization:`OAuth ${token}`, file_url:video } });
  const uploadData = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || uploadData?.error || uploadData?.success === false) {
    throw metaError('PROVIDER_ERROR', clean(uploadData?.error?.message || uploadData?.debug_info?.message || `Facebook Reels 업로드 실패 (${uploaded.status})`, 600), { status:uploaded.status, phase:'upload', videoId });
  }

  // 3) finish — 공개 또는 예약.
  const finished = await graphCall(fetchImpl, endpoint, { method:'POST', form:{
    upload_phase:'finish', video_id:videoId, video_state:schedule.videoState,
    scheduled_publish_time:schedule.scheduledPublishTime, description:clean(description, 2200), title:clean(title, 255), access_token:token,
  } });
  if (finished?.success === false) throw metaError('PROVIDER_ERROR', 'Facebook Reels 게시 완료 단계가 실패했습니다.', { phase:'finish', videoId });

  let url = '';
  try {
    const info = await graphCall(fetchImpl, `${GRAPH_HOST}/${v}/${encodeURIComponent(videoId)}?fields=permalink_url&access_token=${encodeURIComponent(token)}`);
    url = absoluteFacebookUrl(info.permalink_url);
  } catch {}
  if (!url) url = `https://www.facebook.com/reel/${encodeURIComponent(videoId)}`;
  const postId = clean(finished.post_id, 160);
  return {
    id:videoId, url, videoId, postId, videoState:schedule.videoState,
    response:{ video_id:videoId, post_id:postId, video_state:schedule.videoState, success:true },
  };
}

// ---------------------------------------------------------------- Instagram 게시 한도

export async function instagramPublishingQuota({ fetchImpl = globalThis.fetch, graphVersion:version, igUserId, accessToken } = {}) {
  try {
    const v = graphVersion(version);
    const url = `${GRAPH_HOST}/${v}/${encodeURIComponent(clean(igUserId, 160))}/content_publishing_limit?fields=quota_usage,config&access_token=${encodeURIComponent(String(accessToken || ''))}`;
    const data = await graphCall(fetchImpl, url);
    const row = Array.isArray(data?.data) ? data.data[0] : data;
    const usage = Number(row?.quota_usage);
    const limit = Number(row?.config?.quota_total);
    return {
      known:Number.isFinite(usage), usage:Number.isFinite(usage) ? usage : null,
      limit:Number.isFinite(limit) && limit > 0 ? limit : IG_PUBLISH_LIMIT_FALLBACK, limitKnown:Number.isFinite(limit) && limit > 0,
      durationSec:Number(row?.config?.quota_duration) > 0 ? Number(row.config.quota_duration) : 86400,
    };
  } catch (error) {
    return { known:false, usage:null, limit:IG_PUBLISH_LIMIT_FALLBACK, limitKnown:false, durationSec:86400, error:clean(error?.message, 200) };
  }
}

// quota_usage >= limit(미확인이면 50)이면 다음 창으로 미룬다. 공급자 사용량을 모르면 EKODI 자체 24시간 게시 수로 판단한다.
export function instagramQuotaDecision(quota = {}, { localPublished24h = 0, oldestLocalPublishedAt = '', now = Date.now() } = {}) {
  const limit = Number(quota.limit) > 0 ? Number(quota.limit) : IG_PUBLISH_LIMIT_FALLBACK;
  const usage = quota.known ? Number(quota.usage) : Number(localPublished24h || 0);
  if (usage < limit) return { allowed:true, usage, limit, source:quota.known ? 'provider' : 'local' };
  const oldest = Date.parse(oldestLocalPublishedAt || '');
  const window = (Number(quota.durationSec) > 0 ? Number(quota.durationSec) : 86400) * 1000;
  const nextMs = Number.isFinite(oldest) && oldest + window > now ? oldest + window + 60_000 : now + 60 * 60 * 1000;
  return {
    allowed:false, usage, limit, source:quota.known ? 'provider' : 'local', code:'IG_PUBLISH_LIMIT',
    nextAt:new Date(nextMs).toISOString(),
    message:`Instagram 24시간 게시 한도(${usage}/${limit})에 도달해 다음 창으로 미룹니다.`,
  };
}

// ---------------------------------------------------------------- Instagram 컨테이너·Reels

export async function instagramPermalink({ fetchImpl = globalThis.fetch, graphVersion:version, mediaId, accessToken, attempts = 2 } = {}) {
  const v = graphVersion(version);
  for (let i = 0; i < Math.max(1, attempts); i += 1) {
    try {
      const info = await graphCall(fetchImpl, `${GRAPH_HOST}/${v}/${encodeURIComponent(clean(mediaId, 160))}?fields=permalink&access_token=${encodeURIComponent(String(accessToken || ''))}`);
      const url = httpsUrl(info.permalink);
      if (url) return url;
    } catch {}
  }
  return '';
}

export async function pollInstagramContainer({
  fetchImpl = globalThis.fetch, sleep = defaultSleep, now = () => Date.now(), graphVersion:version, containerId, accessToken,
  budgetMs = IG_REEL_POLL_BUDGET_MS, delays = IG_REEL_POLL_DELAYS_MS,
} = {}) {
  const v = graphVersion(version);
  const started = now();
  let attempt = 0;
  for (;;) {
    const info = await graphCall(fetchImpl, `${GRAPH_HOST}/${v}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(String(accessToken || ''))}`);
    const code = clean(info.status_code, 40).toUpperCase();
    if (code && code !== 'IN_PROGRESS') return { statusCode:code, status:clean(info.status, 300), polls:attempt + 1 };
    const delay = delays[Math.min(attempt, delays.length - 1)];
    attempt += 1;
    if (now() - started + delay > budgetMs) return { statusCode:'IN_PROGRESS', status:clean(info.status, 300), polls:attempt, pending:true };
    await sleep(delay);
  }
}

// 반환값이 { pending:true }이면 크론을 막지 않도록 호출자가 작업을 next_attempt_at으로 다시 미룬다.
// 다음 시도는 resumeContainerId로 같은 컨테이너의 상태를 이어서 확인한다(중복 업로드 방지).
export async function publishInstagramReel({
  fetchImpl = globalThis.fetch, sleep = defaultSleep, now = () => Date.now(), graphVersion:version, igUserId, accessToken,
  videoUrl, caption = '', coverUrl = '', shareToFeed = true, extraFields = {},
  resumeContainerId = '', resumeCreatedAt = '', budgetMs = IG_REEL_POLL_BUDGET_MS,
} = {}) {
  const v = graphVersion(version);
  const account = clean(igUserId, 160);
  const token = String(accessToken || '');
  if (!account || !token) throw metaError('INVALID_CREDENTIAL_CONFIG', 'Instagram Business 인증정보가 불완전합니다.');
  const base = `${GRAPH_HOST}/${v}/${encodeURIComponent(account)}`;
  const resumeAge = now() - Date.parse(resumeCreatedAt || '');
  let containerId = clean(resumeContainerId, 160) && Number.isFinite(resumeAge) && resumeAge < IG_CONTAINER_RESUME_MAX_MS ? clean(resumeContainerId, 160) : '';
  let createdAt = containerId ? new Date(Date.parse(resumeCreatedAt)).toISOString() : '';
  const resumed = Boolean(containerId);
  if (!containerId) {
    const video = httpsUrl(videoUrl);
    if (!video) throw metaError('ASSET_REQUIRED', 'Instagram Reels 게시에는 공개 HTTPS 영상 URL이 필요합니다.', { retryable:false });
    const created = await graphCall(fetchImpl, `${base}/media`, { method:'POST', form:{
      media_type:'REELS', video_url:video, caption:clean(caption, 2200), cover_url:httpsUrl(coverUrl),
      share_to_feed:shareToFeed ? 'true' : 'false', ...extraFields, access_token:token,
    } });
    containerId = clean(created.id, 160);
    if (!containerId) throw metaError('PROVIDER_ERROR', 'Instagram Reels 컨테이너 생성에 실패했습니다.');
    createdAt = new Date(now()).toISOString();
  }
  const polled = await pollInstagramContainer({ fetchImpl, sleep, now, graphVersion:v, containerId, accessToken:token, budgetMs });
  if (polled.pending) return { pending:true, containerId, createdAt, statusCode:'IN_PROGRESS', resumed };
  if (polled.statusCode === 'PUBLISHED') throw metaError('IG_CONTAINER_ALREADY_PUBLISHED', 'Instagram 컨테이너가 이미 게시되었습니다. 중복 게시를 막기 위해 재시도하지 않습니다.', { retryable:false, containerId });
  if (polled.statusCode !== 'FINISHED') throw metaError('IG_CONTAINER_FAILED', clean(`Instagram Reels 처리 실패(${polled.statusCode}) ${polled.status}`, 600), { containerId });
  const published = await graphCall(fetchImpl, `${base}/media_publish`, { method:'POST', form:{ creation_id:containerId, access_token:token } });
  const mediaId = clean(published.id, 160);
  if (!mediaId) throw metaError('PROVIDER_ERROR', 'Instagram Reels 게시 응답에 media id가 없습니다.');
  const url = await instagramPermalink({ fetchImpl, graphVersion:v, mediaId, accessToken:token });
  return { id:mediaId, url, containerId, resumed, response:{ id:mediaId, container_id:containerId, media_type:'REELS' } };
}
