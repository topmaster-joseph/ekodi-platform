// EKODI AI Social Growth Phase 2 — 콘텐츠 스튜디오.
// 하나의 콘텐츠를 채널별 변형(variant)으로 나누고, 사람·AI가 만든 모든 변형을 관리자 검수(pending_review)에 올린다.
// 승인된 변형만 기존 게시 큐(marketing_publication_jobs)에 예약할 수 있으며, 실제 게시·재시도·한도·킬스위치는
// 기존 marketing-publishing-worker.js의 스케줄러가 그대로 담당한다(이 모듈은 게시 의미를 바꾸지 않는다).
//
// 추천·보증 표시(공정위 「추천·보증 등에 관한 표시·광고 심사지침」, 2024-12 개정): 제휴·협찬 링크가 있는 변형은
// 경제적 이해관계 표시문을 본문 "첫 부분"에 둔다. applyDisclosure()가 이를 강제한다.
// AI 생성 변형은 ai_generated=1로 저장하고, 게시 콘텐츠의 content_json.isAiGenerated로 함께 전달한다.

export const STUDIO_PREFIX = '/api/marketing/admin/studio';
export const STUDIO_CHANNELS = Object.freeze(['facebook','instagram','threads','youtube','naver_blog','other']);
export const STUDIO_FORMATS = Object.freeze(['feed','photo','carousel','reel','short','video','story','blog_draft']);
export const VARIANT_STATES = Object.freeze(['draft','pending_review','approved','rejected','scheduled','published','archived']);
export const CANONICAL_LINK_HOST = 'ekodi.kr';
// 제휴·파트너 링크로 허용하는 호스트(정확히 일치). ekodi.kr 하위 호스트는 허용하지 않는다(apex-path-only 정책).
export const PARTNER_LINK_HOSTS = Object.freeze([
  'link.coupang.com','www.coupang.com','coupang.com',
  'smartstore.naver.com','brand.naver.com',
  'ekodimall.kr','www.ekodimall.kr','ekodibiz.kr','www.ekodibiz.kr',
]);
export const DEFAULT_DISCLOSURE = '[광고] 이 게시물에는 제휴·협찬 링크가 포함되어 있으며, 구매 시 일정액의 수수료를 받을 수 있습니다.';

const MAX_BODY = 12000;
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const safeParse = (value, fallback) => { try { const parsed = JSON.parse(value || ''); return parsed ?? fallback; } catch { return fallback; } };

function studioError(code, status = 400, extra = {}) {
  return Object.assign(new Error(code), { code, status, ...extra });
}

// ---------------------------------------------------------------- 링크 · 추적 코드

export function newTrackingCode() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `ek${[...bytes].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14)}`;
}

function slug(value, max = 80) {
  return String(value ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, max);
}

export function classifyLink(baseUrl, { partnerHosts = PARTNER_LINK_HOSTS } = {}) {
  let url;
  try { url = new URL(String(baseUrl || '').trim()); } catch { return { ok:false, reason:'INVALID_URL' }; }
  if (url.protocol !== 'https:') return { ok:false, reason:'HTTPS_REQUIRED' };
  if (url.username || url.password) return { ok:false, reason:'CREDENTIALS_IN_URL' };
  const host = url.hostname.toLowerCase();
  if (host === CANONICAL_LINK_HOST) return { ok:true, url, partner:false };
  if (partnerHosts.includes(host)) return { ok:true, url, partner:true };
  return { ok:false, reason:'HOST_NOT_ALLOWED' };
}

// baseUrl에 UTM 파라미터를 붙인다. 기존 쿼리는 유지하고 같은 utm_* 키만 덮어쓴다.
export function buildTrackedLink(baseUrl, { channel, campaignKey, trackingCode } = {}, options = {}) {
  const checked = classifyLink(baseUrl, options);
  if (!checked.ok) throw studioError('TRACKED_LINK_REJECTED', 400, { reason:checked.reason });
  const source = STUDIO_CHANNELS.includes(channel) ? channel : 'other';
  const campaign = slug(campaignKey) || 'ekodi-social';
  const content = clean(trackingCode, 64);
  if (!/^[a-z0-9_-]{4,64}$/i.test(content)) throw studioError('TRACKING_CODE_REQUIRED');
  const url = checked.url;
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_content', content);
  return url.href;
}

// ---------------------------------------------------------------- 추천·보증 표시

// 표시문이 본문 첫 부분에 오도록 한다. 이미 맨 앞에 있으면 그대로, 뒤쪽에 있으면 옮기고, 없으면 붙인다.
export function applyDisclosure(body, disclosure) {
  const text = String(body ?? '');
  const notice = String(disclosure ?? '').trim();
  if (!notice) return text;
  const trimmed = text.trimStart();
  if (trimmed.startsWith(notice)) return trimmed;
  const rest = trimmed.split(notice).join('').replace(/\n{3,}/g, '\n\n').trim();
  return rest ? `${notice}\n\n${rest}` : notice;
}

export function composeCaption(variant) {
  const hashtags = safeParse(variant.hashtags_json, []);
  const tags = (Array.isArray(hashtags) ? hashtags : [])
    .map(tag => clean(tag, 60).replace(/^#+/, '').replace(/\s+/g, ''))
    .filter(Boolean).slice(0, 30).map(tag => `#${tag}`);
  const body = applyDisclosure(variant.body, variant.disclosure_text);
  const caption = tags.length && !tags.every(tag => body.includes(tag)) ? `${body}\n\n${tags.join(' ')}` : body;
  return caption.slice(0, MAX_BODY);
}

// ---------------------------------------------------------------- 상태 기계

const TRANSITIONS = Object.freeze({
  submit:{ from:['draft','rejected'], to:'pending_review' },
  approve:{ from:['pending_review'], to:'approved' },
  reject:{ from:['pending_review','approved'], to:'rejected' },
  schedule:{ from:['approved'], to:'scheduled' },
  archive:{ from:['draft','pending_review','approved','rejected','published'], to:'archived' },
});

export function nextVariantState(current, action) {
  const rule = TRANSITIONS[action];
  if (!rule || !rule.from.includes(current)) return null;
  return rule.to;
}

const CHANNEL_MATCH = {
  facebook:ch => ch.provider === 'facebook' || (ch.provider === 'meta' && ch.channel_type === 'facebook_page'),
  instagram:ch => ch.provider === 'instagram' || (ch.provider === 'meta' && ch.channel_type === 'instagram_business'),
  threads:ch => ch.provider === 'threads',
  youtube:ch => ch.provider === 'youtube',
  naver_blog:ch => String(ch.provider || '').startsWith('naver'),
  other:() => true,
};
export function channelAccepts(variantChannel, channel) {
  if (channel?.provider === 'webhook') return true;
  return Boolean(CHANNEL_MATCH[variantChannel]?.(channel || {}));
}

function contentTypeFor(format) {
  if (['short','reel','video'].includes(format)) return 'short_video';
  if (format === 'carousel') return 'card_news';
  if (format === 'blog_draft') return 'article';
  return 'social_post';
}

function mediaList(value) {
  const list = Array.isArray(value) ? value : safeParse(value, []);
  return (Array.isArray(list) ? list : []).map(item => {
    try { const u = new URL(String(item?.url ?? item ?? '')); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
  }).filter(Boolean).slice(0, 10);
}

async function audit(env, subject, jobId, action, detail, actor) {
  await env.DB.prepare(`INSERT INTO marketing_publication_audit(subject_type,subject_key,workspace_id,job_id,action,detail,actor,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(subject.subject_type, subject.subject_key, subject.workspace_id || '', jobId || null,
    clean(action, 80), clean(detail, 1000), clean(actor, 160), nowIso()).run();
}

function publicVariant(row) {
  if (!row) return null;
  return {
    id:Number(row.id), contentId:Number(row.content_id), campaignId:row.campaign_id == null ? null : Number(row.campaign_id),
    channel:row.channel, format:row.format, title:row.title, body:row.body,
    hashtags:safeParse(row.hashtags_json, []), media:safeParse(row.media_json, []), linkUrl:row.link_url,
    trackingCode:row.tracking_code, disclosureText:row.disclosure_text, aiGenerated:Number(row.ai_generated) === 1,
    status:row.status, reviewNote:row.review_note, reviewedBy:row.reviewed_by, reviewedAt:row.reviewed_at,
    createdBy:row.created_by, subjectType:row.subject_type, subjectKey:row.subject_key, workspaceId:row.workspace_id,
    jobId:row.job_id == null ? null : Number(row.job_id), jobStatus:row.job_status || null,
    createdAt:row.created_at, updatedAt:row.updated_at,
  };
}

async function readVariant(env, id) {
  return env.DB.prepare(`SELECT v.*, j.id AS job_id, j.status AS job_status FROM marketing_content_variants v
    LEFT JOIN marketing_publication_jobs j ON j.variant_id=v.id WHERE v.id=?`).bind(id).first();
}

// ---------------------------------------------------------------- 서비스 함수

export async function createVariant(env, actor, input = {}, options = {}) {
  const channel = clean(input.channel, 30).toLowerCase();
  const format = clean(input.format || 'feed', 30).toLowerCase();
  if (!STUDIO_CHANNELS.includes(channel)) throw studioError('INVALID_CHANNEL');
  if (!STUDIO_FORMATS.includes(format)) throw studioError('INVALID_FORMAT');
  const now = nowIso();
  const aiGenerated = input.aiGenerated === true || input.aiGenerated === 1 || input.source === 'ai';

  let content;
  const contentId = Number(input.contentId || 0);
  if (contentId) {
    content = await env.DB.prepare('SELECT id,subject_type,subject_key,workspace_id FROM marketing_content_items WHERE id=?').bind(contentId).first();
    if (!content) throw studioError('CONTENT_NOT_FOUND', 404);
  } else {
    const base = input.content || {};
    const subjectType = clean(base.subjectType, 20);
    const subjectKey = clean(base.subjectKey, 160);
    if (!['person','tenant','store'].includes(subjectType) || !subjectKey) throw studioError('CONTENT_OR_SUBJECT_REQUIRED');
    const inserted = await env.DB.prepare(`INSERT INTO marketing_content_items(subject_type,subject_key,workspace_id,title,content_type,caption,asset_url,link_url,content_json,source,approval_state,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'','','{}',?,'draft',?,?,?)`).bind(subjectType, subjectKey, clean(base.workspaceId, 160), clean(base.title || input.title, 240),
      'social_post', clean(base.caption || input.body, MAX_BODY), aiGenerated ? 'ai' : 'human', clean(actor, 160), now, now).run();
    content = { id:Number(inserted.meta?.last_row_id || 0), subject_type:subjectType, subject_key:subjectKey, workspace_id:clean(base.workspaceId, 160) };
    if (!content.id) throw studioError('CONTENT_INSERT_FAILED', 500);
  }

  const trackingCode = newTrackingCode();
  let linkUrl = '';
  let partner = false;
  if (clean(input.linkUrl, 2048)) {
    const checked = classifyLink(input.linkUrl, options);
    if (!checked.ok) throw studioError('TRACKED_LINK_REJECTED', 400, { reason:checked.reason });
    partner = checked.partner;
    linkUrl = buildTrackedLink(input.linkUrl, { channel, campaignKey:input.campaignKey || `content-${content.id}`, trackingCode }, options);
  }
  const sponsored = partner || input.sponsored === true || input.affiliate === true;
  let disclosure = clean(input.disclosureText, 400);
  if (sponsored && !disclosure) disclosure = DEFAULT_DISCLOSURE;
  const rawBody = clean(input.body, MAX_BODY);
  const title = clean(input.title, 240);
  if (!rawBody && !title) throw studioError('EMPTY_VARIANT');
  const body = sponsored ? applyDisclosure(rawBody, disclosure) : rawBody;
  const hashtags = (Array.isArray(input.hashtags) ? input.hashtags : []).map(tag => clean(tag, 60)).filter(Boolean).slice(0, 30);
  const media = mediaList(input.media);
  const campaignId = Number(input.campaignId || 0) || null;

  const inserted = await env.DB.prepare(`INSERT INTO marketing_content_variants(content_id,campaign_id,channel,format,title,body,hashtags_json,media_json,link_url,tracking_code,disclosure_text,ai_generated,status,created_by,workspace_id,subject_type,subject_key,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'pending_review',?,?,?,?,?,?)`).bind(content.id, campaignId, channel, format, title, body,
    JSON.stringify(hashtags), JSON.stringify(media), linkUrl, trackingCode, disclosure, aiGenerated ? 1 : 0,
    clean(actor, 160), content.workspace_id || '', content.subject_type, content.subject_key, now, now).run();
  const id = Number(inserted.meta?.last_row_id || 0);
  await audit(env, content, null, 'studio_variant_created', `variant:${id}:${channel}:${format}:${aiGenerated ? 'ai' : 'human'}`, actor);
  return publicVariant(await readVariant(env, id));
}

export async function listVariants(env, { status = '' } = {}) {
  const filter = VARIANT_STATES.includes(status) ? status : '';
  const rows = await env.DB.prepare(`SELECT v.*, j.id AS job_id, j.status AS job_status FROM marketing_content_variants v
    LEFT JOIN marketing_publication_jobs j ON j.variant_id=v.id
    ${filter ? 'WHERE v.status=?' : ''} ORDER BY v.updated_at DESC, v.id DESC LIMIT 200`).bind(...(filter ? [filter] : [])).all();
  const countRows = await env.DB.prepare('SELECT status, count(*) AS n FROM marketing_content_variants GROUP BY status').all();
  const counts = Object.fromEntries(VARIANT_STATES.map(state => [state, 0]));
  for (const row of countRows.results || []) counts[row.status] = Number(row.n || 0);
  return { variants:(rows.results || []).map(publicVariant), counts, status:filter || 'all' };
}

export async function reviewVariant(env, actor, id, decision, note = '') {
  if (!['approve','reject'].includes(decision)) throw studioError('UNKNOWN_ACTION', 404);
  const variant = await readVariant(env, id);
  if (!variant) throw studioError('VARIANT_NOT_FOUND', 404);
  const next = nextVariantState(variant.status, decision);
  if (!next) throw studioError('VARIANT_STATE_CONFLICT', 409, { current:variant.status });
  const now = nowIso();
  const updated = await env.DB.prepare(`UPDATE marketing_content_variants SET status=?,review_note=?,reviewed_by=?,reviewed_at=?,updated_at=?
    WHERE id=? AND status=?`).bind(next, clean(note, 1000), clean(actor, 160), now, now, id, variant.status).run();
  if (!updated.meta?.changes) throw studioError('VARIANT_STATE_CONFLICT', 409);
  await audit(env, variant, null, decision === 'approve' ? 'studio_variant_approved' : 'studio_variant_rejected', `variant:${id}:${clean(note, 200)}`, actor);
  return publicVariant(await readVariant(env, id));
}

// 승인된 변형만 게시 큐에 넣는다. 같은 변형을 두 번 예약해도 작업은 하나다(상태 선점 + 부분 유일 인덱스).
export async function scheduleVariant(env, actor, id, input = {}) {
  const variant = await readVariant(env, id);
  if (!variant) throw studioError('VARIANT_NOT_FOUND', 404);
  if (variant.job_id) return { variant:publicVariant(variant), job:{ id:Number(variant.job_id), status:variant.job_status }, idempotent:true };
  if (variant.status !== 'approved') throw studioError('VARIANT_NOT_APPROVED', 409, { current:variant.status });

  const channelId = Number(input.channelId || 0);
  if (!channelId) throw studioError('CHANNEL_REQUIRED');
  const channel = await env.DB.prepare(`SELECT id,provider,channel_type,status,config_json FROM marketing_publish_channels
    WHERE id=? AND subject_type=? AND subject_key=?`).bind(channelId, variant.subject_type, variant.subject_key).first();
  if (!channel) throw studioError('CHANNEL_NOT_OWNED', 404);
  if (channel.status !== 'active') throw studioError('CHANNEL_NOT_ACTIVE', 409);
  if (!channelAccepts(variant.channel, channel)) throw studioError('CHANNEL_MISMATCH', 409);

  const requested = input.scheduledAt ? Date.parse(input.scheduledAt) : Date.now();
  if (!Number.isFinite(requested)) throw studioError('INVALID_SCHEDULE');
  const scheduledAt = new Date(requested).toISOString();
  const scheduleKind = requested <= Date.now() + 5000 ? 'immediate' : 'scheduled';
  // queuePublish(marketing-publishing-worker.js)와 같은 초기 상태: 즉시=queued, 예약=scheduled.
  const initial = scheduleKind === 'immediate' ? 'queued' : 'scheduled';
  const config = safeParse(channel.config_json, {});
  const maxAttempts = Math.max(1, Math.min(20, Number(config?.maxAttempts || 5)));

  const now = nowIso();
  const claimed = await env.DB.prepare(`UPDATE marketing_content_variants SET status='scheduled',updated_at=? WHERE id=? AND status='approved'`).bind(now, id).run();
  if (!claimed.meta?.changes) {
    const current = await readVariant(env, id);
    if (current?.job_id) return { variant:publicVariant(current), job:{ id:Number(current.job_id), status:current.job_status }, idempotent:true };
    throw studioError('VARIANT_STATE_CONFLICT', 409, { current:current?.status });
  }

  try {
    const media = mediaList(variant.media_json);
    const contentJson = JSON.stringify({
      assets:media, isAiGenerated:Number(variant.ai_generated) === 1,
      studio:{ variantId:Number(variant.id), originContentId:Number(variant.content_id), trackingCode:variant.tracking_code, channel:variant.channel, format:variant.format },
    });
    const snapshot = await env.DB.prepare(`INSERT INTO marketing_content_items(subject_type,subject_key,workspace_id,title,content_type,caption,asset_url,link_url,content_json,source,approval_state,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'approved',?,?,?)`).bind(variant.subject_type, variant.subject_key, variant.workspace_id || '', variant.title,
      contentTypeFor(variant.format), composeCaption(variant), media[0] || '', variant.link_url || '', contentJson,
      Number(variant.ai_generated) === 1 ? 'ai' : 'human', clean(actor, 160), now, now).run();
    const contentId = Number(snapshot.meta?.last_row_id || 0);
    if (!contentId) throw studioError('CONTENT_INSERT_FAILED', 500);
    // 사람 관리자가 승인·예약했으므로 requested_by='human'. 플랜 게이트 트리거(0027)는 그대로 적용된다.
    const job = await env.DB.prepare(`INSERT INTO marketing_publication_jobs(subject_type,subject_key,workspace_id,content_id,channel_id,schedule_kind,scheduled_at,recurrence_rule,status,requested_by,attempt_count,max_attempts,variant_id,tracking_code,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,'',?,'human',0,?,?,?,?,?)`).bind(variant.subject_type, variant.subject_key, variant.workspace_id || '', contentId, channel.id,
      scheduleKind, scheduledAt, initial, maxAttempts, variant.id, variant.tracking_code, now, now).run();
    const jobId = Number(job.meta?.last_row_id || 0);
    await audit(env, variant, jobId, 'studio_variant_scheduled', `variant:${id}:${channel.provider}:${channel.channel_type}:${scheduledAt}:${variant.tracking_code}`, actor);
    return { variant:publicVariant(await readVariant(env, id)), job:{ id:jobId, status:initial, scheduleKind, scheduledAt }, idempotent:false };
  } catch (error) {
    await env.DB.prepare(`UPDATE marketing_content_variants SET status='approved',updated_at=? WHERE id=? AND status='scheduled'
      AND NOT EXISTS (SELECT 1 FROM marketing_publication_jobs WHERE variant_id=?)`).bind(nowIso(), id, id).run();
    const message = String(error?.message || '');
    const plan = message.match(/MARKETING_PLAN_[A-Z_]+_REQUIRED/);
    if (plan) throw studioError(plan[0], 409);
    if (/UNIQUE constraint failed/i.test(message)) {
      const current = await readVariant(env, id);
      if (current?.job_id) return { variant:publicVariant(current), job:{ id:Number(current.job_id), status:current.job_status }, idempotent:true };
    }
    throw error;
  }
}

// ---------------------------------------------------------------- HTTP

async function readJson(request) { try { return await request.json(); } catch { return null; } }

// resolveAdmin: marketing-admin-control.js의 adminSession(EKODI 관리자 세션 확인)을 그대로 주입받는다.
export async function handleContentStudio(request, env, { resolveAdmin, respond } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.startsWith(STUDIO_PREFIX)) return null;
  const reply = respond || ((data, status = 200) => new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } }));
  if (typeof resolveAdmin !== 'function') return reply({ error:'ADMIN_AUTH_NOT_CONFIGURED' }, 500);
  const session = await resolveAdmin(request, env);
  if (!session || session.authenticated === false) return reply({ error:'EKODI 관리자 인증이 필요합니다.', code:'ADMIN_AUTH_REQUIRED' }, 401);
  const actor = clean(session.email || 'admin', 160);
  const mutating = request.method === 'POST';
  if (mutating && String(env.ALLOW_MUTATIONS || 'true') === 'false') return reply({ error:'STAGING_READ_ONLY' }, 403);
  try {
    if (path === `${STUDIO_PREFIX}/variants` && request.method === 'GET') {
      return reply(await listVariants(env, { status:clean(url.searchParams.get('status'), 30) }));
    }
    if (path === `${STUDIO_PREFIX}/variants` && mutating) {
      const body = await readJson(request);
      if (!body) return reply({ error:'INVALID_JSON' }, 400);
      return reply({ ok:true, variant:await createVariant(env, actor, body, { partnerHosts:partnerHostsFrom(env) }) }, 201);
    }
    const match = path.match(/^\/api\/marketing\/admin\/studio\/variants\/(\d+)\/(approve|reject|schedule)$/);
    if (match && mutating) {
      const id = Number(match[1]);
      const body = (await readJson(request)) || {};
      if (match[2] === 'schedule') return reply({ ok:true, ...(await scheduleVariant(env, actor, id, body)) });
      return reply({ ok:true, variant:await reviewVariant(env, actor, id, match[2], body.note) });
    }
    return reply({ error:'NOT_FOUND' }, 404);
  } catch (error) {
    if (error?.code) return reply({ error:error.code, ...(error.reason ? { reason:error.reason } : {}), ...(error.current ? { current:error.current } : {}) }, error.status || 400);
    throw error;
  }
}

function partnerHostsFrom(env) {
  const extra = String(env.MARKETING_PARTNER_LINK_HOSTS || '').split(',').map(v => v.trim().toLowerCase())
    .filter(host => host && host !== CANONICAL_LINK_HOST && !host.endsWith(`.${CANONICAL_LINK_HOST}`));
  return [...PARTNER_LINK_HOSTS, ...extra];
}
