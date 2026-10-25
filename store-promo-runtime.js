// Store promotion API (Workspace Platform) — weekly drafts, phone approval, auto scheduling.
//
//   GET  /v1/store-promo/week                 this week's posts + variant states + connected channels
//   POST /v1/store-promo/week/ensure          create this week's drafts once (idempotent per store-week-post)
//   POST /v1/store-promo/posts/:id/approve    approve every pending variant of the post, then schedule
//   POST /v1/store-promo/posts/:id/reject     reject every pending variant of the post
//   POST /v1/store-promo/schedule             schedule approved, unscheduled SNS variants to active channels
//
// Content is created in the shared studio ledger (marketing_content_items + marketing_content_variants)
// under the owned tenant subject (tenant:jadam|pizzamaru|yogurt) that the publishing scheduler and plan gates
// already govern. Nothing is published without the owner's approval; Naver Blog stays copy-and-post.
// Authorization: store tenant subject + tenant.marketing.manage capability.
import { auditPrincipal } from './ekodi-principal.js';
import { storeOrderAdminContext } from './store-sms-order-runtime.js';
import { TENANT_ADMIN_CAPABILITIES } from './tenant-admin-policy.js';
import { createVariant, reviewVariant, scheduleVariant, channelAccepts } from './marketing-content-studio.js';
import { STORE_PROMO_STORES, buildStorePromoWeek, isoWeekKey } from './store-promo-engine.js';

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const toId = value => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
const safeParse = (value, fallback) => { try { return JSON.parse(value || ''); } catch { return fallback; } };

function cors(request, env) {
  const origin = clean(request.headers.get('origin'), 500);
  const allowedOrigins = clean(env?.ALLOWED_ORIGINS, 2000).split(',').map(v => v.trim()).filter(Boolean);
  const allowed = !origin || allowedOrigins.includes(origin);
  const headers = { 'access-control-allow-headers':'content-type, authorization', 'access-control-allow-methods':'GET, POST, OPTIONS', 'access-control-max-age':'86400', vary:'Origin' };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return { allowed, headers };
}
function json(request, env, data, status = 200) {
  const { headers } = cors(request, env);
  return new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', ...headers } });
}

async function context(request, env, write = false) {
  const { ctx, response } = await storeOrderAdminContext(request, env, { write, capability:TENANT_ADMIN_CAPABILITIES.marketing, errorCode:'STORE_MARKETING_CAPABILITY_REQUIRED' });
  if (response) return { response };
  const store = STORE_PROMO_STORES[ctx.subject.key];
  if (!store) return { response:json(request, env, { error:'STORE_PROMO_NOT_ENABLED' }, 404) };
  return { ctx, store };
}

function factsFrom(ctx) {
  const s = ctx.store || {};
  const menu = (ctx.menu || []).map(item => ({ name:item?.name || item?.display_name, price:item?.price_krw ?? item?.price ?? item?.priceKrw }));
  return { address:s.address || s.public_address, phone:s.phone || s.public_phone, hours:s.business_hours?.display || s.hours, menu };
}

async function weekRows(env, store, weekKey) {
  const rows = await env.DB.prepare(`SELECT c.id AS content_id, c.title AS content_title, c.content_json, v.id AS variant_id, v.channel, v.format, v.title, v.body,
      v.hashtags_json, v.status, j.id AS job_id, j.status AS job_status, j.scheduled_at
    FROM marketing_content_items c
    LEFT JOIN marketing_content_variants v ON v.content_id = c.id
    LEFT JOIN marketing_publication_jobs j ON j.variant_id = v.id
    WHERE c.subject_type = 'tenant' AND c.subject_key = ? AND json_extract(c.content_json, '$.storePromo.weekKey') = ?
    ORDER BY c.id, v.id`).bind(store.subjectKey, weekKey).all();
  const posts = new Map();
  for (const row of rows.results || []) {
    const meta = safeParse(row.content_json, {}).storePromo || {};
    if (!posts.has(row.content_id)) posts.set(row.content_id, { id:Number(row.content_id), key:meta.key, theme:meta.theme, title:row.content_title, scheduledAt:meta.scheduledAt || null, variants:[] });
    if (row.variant_id) posts.get(row.content_id).variants.push({
      id:Number(row.variant_id), channel:row.channel, format:row.format, title:row.title, body:row.body,
      hashtags:safeParse(row.hashtags_json, []), status:row.status, jobId:row.job_id ? Number(row.job_id) : null, jobStatus:row.job_status || null, scheduledAt:row.scheduled_at || null,
    });
  }
  return [...posts.values()];
}

async function activeChannels(env, store) {
  const rows = await env.DB.prepare(`SELECT id, provider, channel_type, display_name, status FROM marketing_publish_channels
    WHERE subject_type = 'tenant' AND subject_key = ? AND status = 'active' ORDER BY id`).bind(store.subjectKey).all();
  return rows.results || [];
}

export async function ensureWeek(env, actor, store, facts, weekKey) {
  const week = buildStorePromoWeek(store.subjectKey, facts, { weekKey });
  let created = 0;
  for (const post of week.posts) {
    const existing = await env.DB.prepare(`SELECT id FROM marketing_content_items WHERE subject_type = 'tenant' AND subject_key = ?
      AND json_extract(content_json, '$.storePromo.key') = ? LIMIT 1`).bind(store.subjectKey, post.key).first();
    if (existing) continue;
    let contentId = 0;
    for (const variant of post.variants) {
      const made = await createVariant(env, actor, {
        ...(contentId ? { contentId } : { content:{ subjectType:'tenant', subjectKey:store.subjectKey, title:post.title, caption:variant.body } }),
        channel:variant.channel, format:variant.format, title:variant.title, body:variant.body, hashtags:variant.hashtags,
        aiGenerated:false, campaignKey:`store-promo-${post.key}`,
      });
      if (!contentId) {
        contentId = made.contentId;
        await env.DB.prepare(`UPDATE marketing_content_items SET content_json = ? WHERE id = ?`)
          .bind(JSON.stringify({ storePromo:{ weekKey, key:post.key, theme:post.theme, scheduledAt:post.scheduledAt, storeKey:store.subjectKey, engine:'store-promo-v1' } }), contentId).run();
      }
    }
    created += 1;
  }
  return created;
}

// Schedule approved SNS variants of this week onto connected channels at their planned slot
// (or right away if the slot already passed). Naver Blog has no write API and is left for copy.
export async function scheduleApproved(env, actor, store, weekKey, channels) {
  const posts = await weekRows(env, store, weekKey);
  const results = [];
  for (const post of posts) {
    for (const variant of post.variants) {
      if (variant.status !== 'approved' || variant.jobId || variant.channel === 'naver_blog') continue;
      const channel = channels.find(ch => channelAccepts(variant.channel, ch));
      if (!channel) { results.push({ variantId:variant.id, channel:variant.channel, state:'channel_required' }); continue; }
      const planned = post.scheduledAt && Date.parse(post.scheduledAt) > Date.now() + 60000 ? post.scheduledAt : new Date().toISOString();
      try {
        const out = await scheduleVariant(env, actor, variant.id, { channelId:channel.id, scheduledAt:planned });
        results.push({ variantId:variant.id, channel:variant.channel, state:'scheduled', jobId:out.job?.id || null, scheduledAt:planned });
      } catch (error) {
        results.push({ variantId:variant.id, channel:variant.channel, state:'error', error:clean(error?.code || error?.message, 80) });
      }
    }
  }
  return results;
}

async function getWeek(request, env) {
  const { ctx, store, response } = await context(request, env); if (response) return response;
  const weekKey = isoWeekKey();
  const [posts, channels] = await Promise.all([weekRows(env, store, weekKey), activeChannels(env, store)]);
  await auditPrincipal(env, ctx.principal, 'conversation:read');
  return json(request, env, {
    storeKey:store.subjectKey, weekKey, canonical:store.canonical, marketingUrl:`https://ekodi.kr/${store.subjectKey}/marketing`,
    channels:channels.map(ch => ({ provider:ch.provider, type:ch.channel_type, name:ch.display_name })), posts,
  });
}

async function postEnsure(request, env) {
  const { ctx, store, response } = await context(request, env, true); if (response) return response;
  const weekKey = isoWeekKey();
  const created = await ensureWeek(env, ctx.principal.id, store, factsFrom(ctx), weekKey);
  await auditPrincipal(env, ctx.principal, 'conversation:write');
  return json(request, env, { ok:true, weekKey, created, posts:await weekRows(env, store, weekKey) });
}

async function postDecision(request, env, contentId, decision) {
  const { ctx, store, response } = await context(request, env, true); if (response) return response;
  const owned = await env.DB.prepare(`SELECT id, content_json FROM marketing_content_items WHERE id = ? AND subject_type = 'tenant' AND subject_key = ?`).bind(contentId, store.subjectKey).first();
  if (!owned || !safeParse(owned.content_json, {}).storePromo) return json(request, env, { error:'PROMO_POST_NOT_FOUND' }, 404);
  const variants = await env.DB.prepare(`SELECT id FROM marketing_content_variants WHERE content_id = ? AND status = 'pending_review'`).bind(contentId).all();
  let changed = 0;
  for (const row of variants.results || []) { await reviewVariant(env, ctx.principal.id, Number(row.id), decision, decision === 'reject' ? 'store owner rejected on mobile' : ''); changed += 1; }
  let scheduling = [];
  const weekKey = safeParse(owned.content_json, {}).storePromo.weekKey;
  if (decision === 'approve') scheduling = await scheduleApproved(env, ctx.principal.id, store, weekKey, await activeChannels(env, store));
  await auditPrincipal(env, ctx.principal, 'conversation:write');
  return json(request, env, { ok:true, changed, scheduling, posts:await weekRows(env, store, weekKey) });
}

async function postSchedule(request, env) {
  const { ctx, store, response } = await context(request, env, true); if (response) return response;
  const weekKey = isoWeekKey();
  const scheduling = await scheduleApproved(env, ctx.principal.id, store, weekKey, await activeChannels(env, store));
  await auditPrincipal(env, ctx.principal, 'conversation:write');
  return json(request, env, { ok:true, scheduling, posts:await weekRows(env, store, weekKey) });
}

export async function handleStorePromoApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/store-promo/')) return null;
  const { allowed, headers } = cors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:allowed ? 204 : 403, headers });
  if (!allowed) return json(request, env, { error:'ORIGIN_FORBIDDEN' }, 403);
  if (!env?.DB) return json(request, env, { error:'DATABASE_UNAVAILABLE' }, 503);
  if (url.pathname === '/v1/store-promo/week' && request.method === 'GET') return getWeek(request, env);
  if (url.pathname === '/v1/store-promo/week/ensure' && request.method === 'POST') return postEnsure(request, env);
  if (url.pathname === '/v1/store-promo/schedule' && request.method === 'POST') return postSchedule(request, env);
  const match = url.pathname.match(/^\/v1\/store-promo\/posts\/(\d+)\/(approve|reject)$/);
  if (match && request.method === 'POST') return postDecision(request, env, toId(match[1]), match[2]);
  return json(request, env, { error:'NOT_FOUND' }, 404);
}
