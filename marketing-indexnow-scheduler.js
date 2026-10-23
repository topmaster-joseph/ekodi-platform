// EKODI AI Social Growth Phase 8 — IndexNow 일일 예약 제출(네이버 Search Advisor + IndexNow 공용 엔드포인트).
//
// 실행 위치: Control API(mission-control-entry-worker.js)의 기존 10분 cron → 상태 기반 하루 1회(KST 04시 이후).
// 기존 platform-indexnow.js 키·키 위치와 scripts/submit-store-indexnow.mjs의 요청 형식을 그대로 쓴다.
//
// 대상 URL(정규 ekodi.kr 경로만, 쿼리·해시 없음)
// - 공개 레지스트리·사이트맵 URL(public-discovery-registry.js buildEkodiPublicRegistry, updatedAt을 지문으로 사용)
// - 에코디몰 주간 추천(/ekodimall/picks, ISO 주차를 지문으로 사용)
// - 에코디몰 공개 상품(/ekodimall/p/<shareCode>, 공개 상품 목록 응답의 상품 필드를 지문으로 사용)
// 중복 제거: marketing_indexnow_url_state에 마지막 "성공" 제출 지문을 저장하고, 지문이 바뀐 URL만 보낸다.
// 배치: 요청당 최대 10,000 URL(IndexNow 규격) — 기본 1,000개씩 나눠 보낸다. 실패한 배치의 URL은 상태를 갱신하지 않아 다음날 재시도된다.

import { EKODI_INDEXNOW_KEY, EKODI_INDEXNOW_KEY_URL } from './platform-indexnow.js';
import { buildEkodiPublicRegistry } from './public-discovery-registry.js';
import { MALL_PICKS_CANONICAL } from './mall-weekly-picks-page.js';
import { mallProductCanonicalUrl } from './mall-product-jsonld.js';
import { kstDate, markScheduler, schedulerDue } from './marketing-metrics-collector.js';

export const INDEXNOW_TASK_KEY = 'marketing_indexnow_daily';
export const INDEXNOW_HOST = 'ekodi.kr';
export const INDEXNOW_ENDPOINTS = Object.freeze([
  Object.freeze({ id:'naver', url:'https://searchadvisor.naver.com/indexnow' }),
  Object.freeze({ id:'indexnow', url:'https://api.indexnow.org/indexnow' }),
]);
export const INDEXNOW_MAX_BATCH = 10000;
export const INDEXNOW_DEFAULT_BATCH = 1000;
export const INDEXNOW_MIN_KST_HOUR = 4;
const MALL_PRODUCTS_URL = 'https://ekodi.kr/ekodimall/api/public/products?limit=48';
const UA = 'EKODI-Public-Discovery/1.0';

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

export function canonicalIndexUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== INDEXNOW_HOST || url.search || url.hash || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}

export function isoWeekKey(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600_000);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function fingerprint(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 후보 URL과 지문을 모은다. 각 출처 실패는 다른 출처를 막지 않는다.
export async function collectIndexCandidates(env, { fetch: fetchImpl = globalThis.fetch, now = Date.now(), registry = buildEkodiPublicRegistry } = {}) {
  const candidates = new Map();
  const errors = [];
  const add = async (url, basis, source) => {
    const canonical = canonicalIndexUrl(url);
    if (!canonical || candidates.has(canonical)) return;
    candidates.set(canonical, { url:canonical, fingerprint:await fingerprint(basis), source });
  };
  try {
    const built = await registry(env);
    for (const resource of built?.resources || []) await add(resource.url, [resource.updatedAt || resource.publishedAt || 'static', resource.title || ''], 'registry');
  } catch (error) { errors.push(`registry:${clean(error?.message, 120)}`); }
  await add(MALL_PICKS_CANONICAL, ['picks', isoWeekKey(now)], 'picks');
  try {
    const source = env?.MALL_API?.fetch
      ? await env.MALL_API.fetch(new Request('https://mall-api.internal/api/public/products?limit=48'))
      : await fetchImpl(MALL_PRODUCTS_URL, { headers:{ 'user-agent':UA } });
    if (!source.ok) throw new Error(`HTTP ${source.status}`);
    const body = await source.json();
    for (const item of Array.isArray(body?.products) ? body.products : []) {
      const code = clean(item?.shareCode, 80);
      if (!/^[A-Za-z0-9_-]{3,80}$/.test(code)) continue;
      const p = item.product || {};
      await add(mallProductCanonicalUrl(code), [p.name, p.price, p.oneLine, p.story, p.saleType, item.updatedAt || item.publishedAt || ''], 'mall_product');
    }
  } catch (error) { errors.push(`mall_products:${clean(error?.message, 120)}`); }
  return { candidates:[...candidates.values()], errors };
}

export async function changedCandidates(env, candidates) {
  const changed = [];
  for (const candidate of candidates) {
    const row = await env.DB.prepare('SELECT fingerprint FROM marketing_indexnow_url_state WHERE url=?').bind(candidate.url).first();
    if (!row || row.fingerprint !== candidate.fingerprint) changed.push(candidate);
  }
  return changed;
}

export function batches(list, size = INDEXNOW_DEFAULT_BATCH) {
  const limit = Math.max(1, Math.min(INDEXNOW_MAX_BATCH, Math.trunc(Number(size) || INDEXNOW_DEFAULT_BATCH)));
  const out = [];
  for (let i = 0; i < list.length; i += limit) out.push(list.slice(i, i + limit));
  return out;
}

async function submitBatch(fetchImpl, endpoint, urls) {
  try {
    const response = await fetchImpl(endpoint.url, {
      method:'POST',
      headers:{ 'content-type':'application/json; charset=utf-8', 'user-agent':UA },
      body:JSON.stringify({ host:INDEXNOW_HOST, key:EKODI_INDEXNOW_KEY, keyLocation:EKODI_INDEXNOW_KEY_URL, urlList:urls }),
    });
    // IndexNow: 200 OK, 202 Accepted(키 검증 대기)만 성공. 429는 다음날 재시도.
    return { endpoint:endpoint.id, status:response.status, ok:response.status === 200 || response.status === 202, count:urls.length };
  } catch (error) {
    return { endpoint:endpoint.id, status:0, ok:false, count:urls.length, error:clean(error?.message, 120) };
  }
}

// 네이버 엔드포인트가 받은 배치만 "성공"으로 기록한다(국내 검색 노출이 목적). 공용 엔드포인트 결과는 참고로 남긴다.
export async function submitChangedUrls(env, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const nowMs = options.now ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const { candidates, errors } = await collectIndexCandidates(env, { ...options, fetch:fetchImpl, now:nowMs });
  const changed = await changedCandidates(env, candidates);
  const summary = { ok:true, candidates:candidates.length, changed:changed.length, submitted:0, failedBatches:0, batches:[], sourceErrors:errors };
  for (const batch of batches(changed, options.batchSize)) {
    const urls = batch.map(item => item.url);
    const results = [];
    for (const endpoint of INDEXNOW_ENDPOINTS) results.push(await submitBatch(fetchImpl, endpoint, urls));
    summary.batches.push(results);
    if (results.find(result => result.endpoint === 'naver')?.ok) {
      for (const item of batch) {
        await env.DB.prepare(`INSERT INTO marketing_indexnow_url_state(url,fingerprint,source,submitted_at,updated_at) VALUES(?,?,?,?,?)
          ON CONFLICT(url) DO UPDATE SET fingerprint=excluded.fingerprint,source=excluded.source,submitted_at=excluded.submitted_at,updated_at=excluded.updated_at`)
          .bind(item.url, item.fingerprint, item.source, nowIso, nowIso).run();
      }
      summary.submitted += batch.length;
    } else {
      summary.failedBatches += 1;
    }
  }
  summary.ok = summary.failedBatches === 0;
  return summary;
}

export async function runScheduledIndexNow(env, options = {}) {
  const nowMs = options.now ?? Date.now();
  try {
    if (!env?.DB?.prepare) return { ran:false, reason:'DB_UNAVAILABLE' };
    if (String(env.MARKETING_INDEXNOW_ENABLED || 'true') === 'false') return { ran:false, reason:'DISABLED' };
    if (!(await schedulerDue(env, INDEXNOW_TASK_KEY, { nowMs, sameKstDay:true, minKstHour:INDEXNOW_MIN_KST_HOUR }))) return { ran:false, reason:'NOT_DUE' };
    await markScheduler(env, INDEXNOW_TASK_KEY, 'start', { nowMs });
    const summary = await submitChangedUrls(env, { ...options, now:nowMs });
    await markScheduler(env, INDEXNOW_TASK_KEY, summary.ok ? 'success' : 'failure', { nowMs, status:summary.ok ? 'ok' : 'failed', detail:{ ...summary, batches:summary.batches.length, date:kstDate(nowMs) } });
    return { ran:true, ...summary };
  } catch (error) {
    return { ran:false, ok:false, error:clean(error?.message || 'INDEXNOW_SCHEDULE_FAILED', 200) };
  }
}
