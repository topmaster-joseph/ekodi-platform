// EKODI AI Social Growth Phase 8 — 서버 측 유입 귀속(marketing_traffic_attributions).
//
// 왜 이 위치인가: Site Core 입구(platform-router-entry-worker.js)는 사람용 경로의 utm_* 를
// canonicalTrackingQueryRedirect()로 308 제거한다. 그래서 utm_content(=콘텐츠 스튜디오 tracking_code)는
// 그 리다이렉트 순간에만 서버가 볼 수 있다. 여기서
//   1) visit(+ /ekodimall/p/<code> 이면 product_view)을 기록하고,
//   2) 7일짜리 1st-party 쿠키(ekodi_tc=<tracking_code>, HttpOnly, 개인정보 없음)를 남겨
//   3) 이후 제휴 클릭(/api/affiliate/public/click/<id>)과 에코디몰 직접판매 주문 생성(/ekodimall/api/public/orders)을
//      같은 tracking_code로 귀속한다(주문은 order 이벤트 + external_ref=주문 ID. 금액 확정은 리포트가 Mall API에서 읽는다).
// 모든 기록은 ctx.waitUntil로 비동기(fire-and-forget) 처리하며, 실패해도 페이지 응답은 절대 바뀌지 않는다.
// 개인정보: IP·User-Agent 원문을 저장하지 않는다. 일 단위로 바뀌는 해시(방문자 키)를 멱등성 키 계산에만 쓴다.

export const TRACKING_COOKIE = 'ekodi_tc';
export const TRACKING_COOKIE_MAX_AGE = 7 * 86400;
const TRACKING_CODE_RE = /^[a-z0-9_-]{4,64}$/i;
const AFFILIATE_CLICK_RE = /^\/api\/affiliate\/public\/click\/(\d+)$/;
const MALL_PRODUCT_RE = /^\/ekodimall\/p\/([A-Za-z0-9_-]{3,80})\/?$/;
const MALL_ORDER_PATHS = new Set(['/ekodimall/api/public/orders', '/ekodimall/api/api/public/orders']);

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

export function isTrackingCode(value) { return TRACKING_CODE_RE.test(String(value || '')); }

export function trackingCodeFromUrl(url) {
  const value = clean(url.searchParams.get('utm_content'), 64);
  return isTrackingCode(value) ? value : '';
}

export function trackingCodeFromCookie(request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === TRACKING_COOKIE) {
      const value = clean(decodeURIComponent(rest.join('=') || ''), 64);
      return isTrackingCode(value) ? value : '';
    }
  }
  return '';
}

export function kstDay(ms = Date.now()) { return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10); }

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 일 단위 방문자 키: 원문(IP·UA)은 저장하지 않고, 날짜·서버 비밀(salt)과 섞은 해시의 앞 32자만 멱등성 키에 쓴다.
export async function visitorKey(request, env, day) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  const ua = request.headers.get('user-agent') || '';
  const salt = String(env?.MARKETING_ATTRIBUTION_SALT || 'ekodi-attribution-v1');
  return (await sha256Hex(`${salt}|${day}|${ip}|${ua}`)).slice(0, 32);
}

async function variantFor(env, trackingCode) {
  return env.DB.prepare(`SELECT v.id AS variant_id, v.campaign_id, v.channel, j.id AS job_id
    FROM marketing_content_variants v LEFT JOIN marketing_publication_jobs j ON j.variant_id=v.id
    WHERE v.tracking_code=? LIMIT 1`).bind(trackingCode).first();
}

// 알려진 tracking_code만 기록한다(임의 utm_content로 원장을 오염시키지 않음). INSERT OR IGNORE + UNIQUE(idempotency_key).
export async function recordAttributionEvent(env, { trackingCode, eventType, visitor, day, externalRef = '', path = '', nowIso = new Date().toISOString() }) {
  if (!env?.DB?.prepare || !isTrackingCode(trackingCode)) return { recorded:false, reason:'INVALID' };
  const variant = await variantFor(env, trackingCode);
  if (!variant) return { recorded:false, reason:'UNKNOWN_TRACKING_CODE' };
  const ref = clean(externalRef, 160);
  const idempotencyKey = `${eventType}:${trackingCode}:${day}:${visitor}${ref ? `:${ref}` : ''}`;
  const metadata = JSON.stringify({ capture:'edge-v1', path:clean(path, 200) });
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO marketing_traffic_attributions
    (tracking_code,job_id,variant_id,campaign_id,channel,event_type,external_ref,idempotency_key,value_krw,revenue_status,occurred_at,metadata_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,0,'none',?,?,?)`).bind(trackingCode, variant.job_id ?? null, variant.variant_id ?? null, variant.campaign_id ?? null,
    clean(variant.channel, 30), eventType, ref, idempotencyKey, nowIso, metadata, nowIso).run();
  return { recorded:Number(result?.meta?.changes || 0) > 0, idempotencyKey };
}

function schedule(ctx, promise) {
  const guarded = Promise.resolve(promise).catch(error => { console.error('marketing attribution capture skipped', String(error?.message || error)); });
  if (ctx?.waitUntil) ctx.waitUntil(guarded);
  return guarded;
}

function withCookie(response, trackingCode) {
  try {
    const next = new Response(response.body, response);
    next.headers.append('set-cookie', `${TRACKING_COOKIE}=${encodeURIComponent(trackingCode)}; Path=/; Max-Age=${TRACKING_COOKIE_MAX_AGE}; Secure; HttpOnly; SameSite=Lax`);
    return next;
  } catch {
    return response;
  }
}

// (1) utm 제거 리다이렉트 직전: visit/product_view 기록 + 쿠키. 반환값은 항상 Response(원래 리다이렉트 또는 쿠키만 더한 것).
export function captureTrackedLanding(request, env, ctx, redirectResponse, { now = Date.now() } = {}) {
  try {
    if (!redirectResponse || !env?.DB?.prepare) return redirectResponse;
    const url = new URL(request.url);
    const trackingCode = trackingCodeFromUrl(url);
    if (!trackingCode) return redirectResponse;
    const nowIso = new Date(now).toISOString();
    const day = kstDay(now);
    const product = url.pathname.match(MALL_PRODUCT_RE);
    schedule(ctx, (async () => {
      const visitor = await visitorKey(request, env, day);
      await recordAttributionEvent(env, { trackingCode, eventType:'visit', visitor, day, path:url.pathname, nowIso });
      if (product) await recordAttributionEvent(env, { trackingCode, eventType:'product_view', visitor, day, externalRef:product[1], path:url.pathname, nowIso });
    })());
    // 첫 접촉(first-touch) 유지: 이미 유효한 쿠키가 있으면 덮어쓰지 않는다.
    return trackingCodeFromCookie(request) ? redirectResponse : withCookie(redirectResponse, trackingCode);
  } catch {
    return redirectResponse;
  }
}

// (2) 응답 이후: 쿠키가 있는 제휴 클릭 리다이렉트와 직접판매 주문 생성을 기록한다. 응답은 그대로 돌려준다.
export function observeAttributedResponse(request, env, ctx, response, { now = Date.now() } = {}) {
  try {
    if (!response || !env?.DB?.prepare) return response;
    const trackingCode = trackingCodeFromCookie(request);
    if (!trackingCode) return response;
    const url = new URL(request.url);
    const nowIso = new Date(now).toISOString();
    const day = kstDay(now);
    const click = request.method === 'GET' ? url.pathname.match(AFFILIATE_CLICK_RE) : null;
    if (click && response.status >= 300 && response.status < 400) {
      schedule(ctx, (async () => {
        const visitor = await visitorKey(request, env, day);
        await recordAttributionEvent(env, { trackingCode, eventType:'affiliate_click', visitor, day, externalRef:`storefront:${click[1]}`, path:url.pathname, nowIso });
      })());
      return response;
    }
    if (request.method === 'POST' && MALL_ORDER_PATHS.has(url.pathname) && response.status >= 200 && response.status < 300) {
      let copy;
      try { copy = response.clone(); } catch { return response; }
      schedule(ctx, (async () => {
        const body = await copy.json().catch(() => ({}));
        const orderId = clean(body?.order?.id, 120);
        if (!orderId) return;
        const visitor = await visitorKey(request, env, day);
        await recordAttributionEvent(env, { trackingCode, eventType:'order', visitor, day, externalRef:`mall_order:${orderId}`, path:url.pathname, nowIso });
      })());
    }
    return response;
  } catch {
    return response;
  }
}
