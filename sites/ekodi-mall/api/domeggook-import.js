// EKODI-MALL-DOMEGGOOK-IMPORT-001
// 에코디언 전용: 도매꾹·도매매 상품번호(또는 상품 URL) 하나로 위탁배송 상품 초안을 만든다.
// - 선발주 없음: 상품만 등록하고 공급처 정보(supply_*)를 남겨 주문 시 발주에 쓴다.
// - 가격: (공급가 + 공급 배송비) / (1 - 결제수수료) × (1 + 마진), 100원 올림, 권장 최저판매가 이상.
// - 이미지: 공급사가 desc.license.usable=true 로 허용한 경우에만 R2 로 복사한다.
// - 주기 동기화: 판매종료·재고 0·원가 상승으로 역마진이면 품절 처리하고 관리자 알림을 남긴다.
// 응답 경로 근거: 도매꾹 Open API 문서 getItemView 4.6 (basis/price/qty/deli/thumb/desc).
import { MEDIA_PREFIX, MAX_IMAGES, MAX_IMAGE_BYTES } from './product-media.js';
import { raiseAlert } from './ops-alerts.js';
import { maskSupplierText } from './supplier-mask.js';

export const PROVIDER = 'domeggook';
const ENDPOINT = 'https://domeggook.com/ssl/api/';
const PG_FEE_RATE = 0.04;
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_STOCK = 50;
const IMAGE_HOST = /(^|\.)(domeggook\.com|domeme\.com|domeggook\.co\.kr)$/i;

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const isoNow = () => new Date().toISOString();

export function parseItemNo(input) {
  const text = clean(input, 500);
  if (/^\d{4,15}$/.test(text)) return text;
  try {
    const url = new URL(text);
    const q = url.searchParams.get('no') || url.searchParams.get('itemNo');
    if (q && /^\d{4,15}$/.test(q)) return q;
    const m = url.pathname.match(/(\d{4,15})(?!.*\d{4,15})/);
    if (m) return m[1];
  } catch {}
  return '';
}

/** 정수 또는 구간가 문자열("1+3800|20+3500")에서 1개 구매 단가를 꺼낸다. */
export function firstPrice(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  const text = String(value).replace(/,/g, '').trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text)) || null;
  const tier = text.split('|')[0];
  const m = tier.match(/^\s*\d+\s*\+\s*(\d+)/);
  return m ? Number(m[1]) || null : null;
}

function num(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function truthy(value) {
  return value === true || ['true', 'y', 'yes', '1'].includes(String(value ?? '').trim().toLowerCase());
}

function deliveryFee(part) {
  if (!part || typeof part !== 'object') return null;
  const type = clean(part.type, 40);
  if (/무료|free/i.test(type)) return 0;
  const fee = num(part.fee);
  return fee !== null && fee >= 0 ? Math.round(fee) : null;
}

function detailImageUrls(html) {
  const urls = [];
  const re = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || ''))) && urls.length < 12) urls.push(m[1]);
  return urls;
}

export function normalizeDomeggookDetail(payload) {
  const root = payload?.domeggook && typeof payload.domeggook === 'object' ? payload.domeggook : (payload || {});
  const basis = root.basis || {};
  const price = root.price || {};
  const qty = root.qty || {};
  const deli = root.deli || {};
  const thumb = root.thumb || {};
  const desc = root.desc || {};
  const supplyCost = firstPrice(price.supply);
  const domeCost = firstPrice(price.dome);
  const market = supplyCost ? 'supply' : 'dome';
  const cost = supplyCost || domeCost;
  const shipping = market === 'supply' ? deliveryFee(deli.supply) : deliveryFee(deli.dome);
  const moq = num(market === 'supply' ? (qty.supplyMoq ?? qty.supplyUnit ?? 1) : (qty.domeMoq ?? 1));
  const resale = price.resale || {};
  return {
    itemNo: clean(basis.no ?? root.no, 30),
    title: clean(basis.title, 200),
    status: clean(basis.status, 40),
    market,
    cost,
    shipping,
    moq: moq && moq > 0 ? moq : 1,
    inventory: num(qty.inventory),
    resaleMin: firstPrice(resale.minumum ?? resale.minimum),
    resaleRecommend: firstPrice(resale.Recommand ?? resale.recommend),
    jejuExtra: num(deli.feeExtra?.jeju),
    licenseUsable: truthy(desc.license?.usable),
    licenseMsg: clean(desc.license?.msg, 200),
    thumbUrl: clean(thumb.original || thumb.large || thumb.small, 600),
    thumbCandidates: [thumb.original, thumb.large, thumb.small].map((u) => clean(u, 600)).filter(Boolean),
    detailImages: detailImageUrls(desc.contents?.item),
    // 주문옵션(JSON 문자열, 도매꾹 문서: '상품 주문옵션 정보 (JSON 포맷)')
    selectOpt: typeof root.selectOpt === 'string' ? root.selectOpt.slice(0, 4000) : (root.selectOpt ? JSON.stringify(root.selectOpt).slice(0, 4000) : '')
  };
}

export function quoteSalePrice({ cost, shipping = 0, resaleMin = null }, marginPct = 25) {
  const base = (Number(cost) || 0) + (Number(shipping) || 0);
  if (!(base > 0)) return null;
  const margin = Math.min(200, Math.max(5, Number(marginPct) || 25)) / 100;
  const raw = (base * (1 + margin)) / (1 - PG_FEE_RATE);
  const rounded = Math.ceil(raw / 100) * 100;
  return Math.max(rounded, resaleMin ? Math.ceil(resaleMin / 100) * 100 : 0);
}

/** 판매가에서 원가·배송비·결제수수료를 뺀 1개당 예상 순이익. */
export function unitProfit(salePrice, cost, shipping) {
  return Math.round(Number(salePrice) * (1 - PG_FEE_RATE) - Number(cost || 0) - Number(shipping || 0));
}

export function importBlockers(item) {
  const blockers = [];
  if (!item.title) blockers.push('상품명을 확인하지 못했습니다');
  if (item.status && item.status !== '판매중') blockers.push(`공급처 판매상태가 '${item.status}'입니다`);
  if (!item.cost) blockers.push('공급가를 확인하지 못했습니다');
  if (item.shipping === null) blockers.push('공급 배송비를 확인하지 못했습니다');
  if (item.moq > 1) blockers.push(`최소구매수량이 ${item.moq}개라 1개 위탁판매에 맞지 않습니다`);
  if (item.inventory !== null && item.inventory <= 0) blockers.push('공급처 재고가 없습니다');
  return blockers;
}

export async function fetchDomeggookItem(env, itemNo, fetchImpl = fetch) {
  if (!env.DOMEMAE_API_KEY) return { error: '도매꾹 API 키가 아직 등록되지 않았습니다.', code: 'DOMEGGOOK_KEY_MISSING' };
  const params = new URLSearchParams({ ver: '4.6', mode: 'getItemView', aid: env.DOMEMAE_API_KEY, no: itemNo, om: 'json' });
  let response;
  try { response = await fetchImpl(`${ENDPOINT}?${params}`, { headers: { accept: 'application/json' } }); }
  catch { return { error: '도매꾹 API에 연결하지 못했습니다.', code: 'DOMEGGOOK_NETWORK' }; }
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch {}
  if (!response.ok || !payload) return { error: `도매꾹 API 응답 오류(${response.status})`, code: 'DOMEGGOOK_BAD_RESPONSE' };
  const apiError = payload.errors || payload.error || payload.domeggook?.errors;
  if (apiError) return { error: `도매꾹: ${redact(clean(apiError.message || apiError.msg || JSON.stringify(apiError), 200), env)}`, code: 'DOMEGGOOK_API_ERROR' };
  return { item: normalizeDomeggookDetail(payload) };
}

function redact(text, env) {
  const key = String(env?.DOMEMAE_API_KEY || '');
  return key ? text.split(key).join('***') : text;
}

function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return ['image/jpeg', 'jpg'];
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return ['image/png', 'png'];
  if (String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return ['image/webp', 'webp'];
  return null;
}

// 공급사 API 응답에 들어 있는 이미지 주소는 도매꾹 CDN 외 호스트일 수 있다.
// 공인 호스트명(https)만 허용하고 IP·내부 주소는 막는다.
function apiImageHostOk(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (IMAGE_HOST.test(h)) return true;
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^[\d.]+$/.test(h) || h.includes(':')) return false;
  return true;
}

async function copyImages(env, productId, urls, fetchImpl, { anyHost = false, reasons = null } = {}) {
  if (!env.MEDIA?.put) { reasons?.push('no-media'); return []; }
  const images = [];
  const seen = new Set();
  for (const raw of urls) {
    if (images.length >= MAX_IMAGES) break;
    let url;
    try { url = new URL(raw.startsWith('//') ? `https:${raw}` : raw); } catch { reasons?.push('bad-url'); continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') { reasons?.push('protocol'); continue; }
    if (!(anyHost ? apiImageHostOk(url.hostname) : IMAGE_HOST.test(url.hostname))) { reasons?.push(`host:${url.hostname}`.slice(0, 60)); continue; }
    url.protocol = 'https:';
    if (seen.has(url.toString())) continue;
    seen.add(url.toString());
    try {
      const res = await fetchImpl(url.toString(), { redirect: 'follow' });
      if (!res.ok) { reasons?.push(`http:${res.status}`); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) { reasons?.push(`size:${bytes.length}`); continue; }
      const type = sniff(bytes);
      if (!type) { reasons?.push('type'); continue; }
      const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const key = `${MEDIA_PREFIX}${productId}/${id}.${type[1]}`;
      await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type[0], cacheControl: 'public, max-age=31536000, immutable' } });
      images.push({ id, key, width: null, height: null, source: 'domeggook', createdAt: isoNow() });
    } catch { reasons?.push('fetch'); }
  }
  return images;
}

export function productBodyFromItem(rawItem, salePrice) {
  // 공개 문구에는 공급처 주소·상품번호를 남기지 않는다(에코디몰 고유 상품으로 노출).
  const item = { ...rawItem, title: maskSupplierText(rawItem.title) || '에코디몰 엄선 상품' };
  const stock = item.inventory === null ? 10 : Math.min(MAX_STOCK, Math.max(0, Math.trunc(item.inventory)));
  const jeju = item.jejuExtra ? ` 제주·도서산간은 추가 배송비가 있을 수 있습니다.` : '';
  return {
    seller: { type: 'individual', displayName: '에코디몰' },
    store: null,
    product: {
      saleType: 'direct', category: 'living', region: null, name: item.title,
      audience: '', oneLine: `${item.title} · 무료배송`,
      price: salePrice, stockQuantity: stock,
      benefits: ['무료배송', '에코디몰 안전결제', '교환·환불 안내 제공'],
      specs: [],
      story: `${item.title}을(를) 에코디몰이 엄선해 소개합니다.\n주문하시면 공급처에서 바로 출고되는 위탁배송 상품입니다.`,
      fulfillment: `결제 확인 후 공급처에서 직접 발송합니다(보통 1~3영업일). 배송비는 상품가에 포함되어 있습니다.${jeju}`,
      contact: '', affiliateUrl: '', action: { url: '' }
    },
    content: { headline: `${item.title} · 무료배송` }
  };
}

/**
 * 상품 초안 생성(또는 같은 공급 상품이면 갱신). saveProduct 는 worker.js 에서 주입한다.
 * 반환: { status, body }
 */
export async function importDomeggookProduct(env, user, input, { saveProduct, getProduct, fetchImpl = fetch, requireLicense = false, maxImages = MAX_IMAGES } = {}) {
  const itemNo = parseItemNo(input?.itemNo ?? input?.url ?? input);
  if (!itemNo) return { status: 400, body: { error: '도매꾹·도매매 상품번호 또는 상품 주소를 넣어 주세요.' } };
  const fetched = await fetchDomeggookItem(env, itemNo, fetchImpl);
  if (fetched.error) return { status: fetched.code === 'DOMEGGOOK_KEY_MISSING' ? 503 : 502, body: { error: fetched.error, code: fetched.code } };
  const item = { ...fetched.item, itemNo: fetched.item.itemNo || itemNo };
  const blockers = importBlockers(item);
  if (requireLicense && !item.licenseUsable) blockers.push('공급사가 사진 재사용을 허용하지 않습니다');
  if (blockers.length) return { status: 422, body: { error: `가져올 수 없는 상품입니다: ${blockers.join(', ')}`, blockers } };
  const salePrice = quoteSalePrice(item, env.DOMEGGOOK_MARGIN_PCT);
  const existing = await env.DB.prepare('SELECT id FROM products WHERE seller_id=? AND supply_provider=? AND supply_item_no=?')
    .bind(user.id, PROVIDER, item.itemNo).first();
  const now = isoNow();
  let productId = existing?.id || '';
  if (existing) {
    // 재가져오기는 판매자가 고친 문구를 덮지 않고 가격·재고만 새로 맞춘다.
    const stock = item.inventory === null ? null : Math.min(MAX_STOCK, Math.max(0, Math.trunc(item.inventory)));
    await env.DB.prepare('UPDATE products SET price=?,stock_quantity=COALESCE(?,stock_quantity),updated_at=? WHERE id=? AND seller_id=?')
      .bind(salePrice, stock, now, productId, user.id).run();
  } else {
    const saved = await saveProduct(env, user, productBodyFromItem(item, salePrice), '');
    if (saved.errors) return { status: 400, body: { error: saved.errors.join(' ') } };
    productId = saved.product.id;
  }
  await env.DB.prepare('UPDATE products SET supply_provider=?,supply_item_no=?,supply_market=?,supply_cost=?,supply_shipping=?,supply_synced_at=? WHERE id=? AND seller_id=?')
    .bind(PROVIDER, item.itemNo, item.market, item.cost, item.shipping, now, productId, user.id).run();
  let imageNote = '';
  if (!existing) {
    if (item.licenseUsable) {
      const images = await copyImages(env, productId, [item.thumbUrl, ...item.detailImages].filter(Boolean).slice(0, maxImages), fetchImpl);
      if (images.length) await env.DB.prepare('UPDATE products SET images_json=? WHERE id=? AND seller_id=?').bind(JSON.stringify(images), productId, user.id).run();
      imageNote = images.length ? `공급사 허용 사진 ${images.length}장을 넣었습니다.` : '사진을 가져오지 못했습니다. 직접 올려 주세요.';
    } else {
      imageNote = '공급사가 사진 재사용을 허용하지 않아 사진은 직접 올려야 합니다.';
    }
  }
  const product = await getProduct(env, user.id, productId);
  return {
    status: existing ? 200 : 201,
    body: {
      product,
      supply: { provider: PROVIDER, itemNo: item.itemNo, market: item.market, cost: item.cost, shipping: item.shipping, inventory: item.inventory },
      pricing: { salePrice, unitProfit: unitProfit(salePrice, item.cost, item.shipping), resaleMin: item.resaleMin, marginPct: Number(env.DOMEGGOOK_MARGIN_PCT) || 25 },
      imageNote,
      refreshed: Boolean(existing)
    }
  };
}

async function recordProbe(env, status, metadata) {
  try {
    await env.DB.prepare(`INSERT INTO supplier_connector_checks (id,provider_id,check_type,external_ref,result_status,metadata_json,checked_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(`chk_${crypto.randomUUID().replaceAll('-', '')}`, 'domemae-official', 'item_lookup', 'probe:getItemList', status, JSON.stringify(metadata).slice(0, 1500), isoNow()).run();
  } catch {}
}

/** 키가 실제로 동작하는지 6시간마다 한 번 확인한다(키 값은 기록하지 않음). */
export async function probeDomeggookKey(env, fetchImpl = fetch) {
  if (!env?.DB || !env.DOMEMAE_API_KEY) return { skipped: 'no-key' };
  const last = await env.DB.prepare("SELECT checked_at FROM supplier_connector_checks WHERE external_ref='probe:getItemList' ORDER BY checked_at DESC LIMIT 1").first().catch(() => null);
  if (last && Date.now() - Date.parse(last.checked_at) < SYNC_INTERVAL_MS) return { skipped: 'recent' };
  const params = new URLSearchParams({ ver: '4.1', mode: 'getItemList', aid: env.DOMEMAE_API_KEY, market: 'supply', om: 'json', kw: '수건', sz: '1', pg: '1' });
  try {
    const res = await fetchImpl(`${ENDPOINT}?${params}`, { headers: { accept: 'application/json' } });
    const text = await res.text();
    let payload = null; try { payload = JSON.parse(text); } catch {}
    const root = payload?.domeggook || payload || {};
    const ok = res.ok && Boolean(root.list || root.header);
    const errText = ok ? '' : redact(clean(JSON.stringify(payload?.errors || payload?.error || root.errors || text.slice(0, 200)), 300), env);
    await recordProbe(env, ok ? 'ok' : 'failed', { httpStatus: res.status, keys: Object.keys(root).slice(0, 12), error: errText, items: num(root.header?.numberOfItems) });
    if (ok) await env.DB.prepare("UPDATE mall_ops_alerts SET status='resolved',resolved_at=?,updated_at=? WHERE status='open' AND kind='supply.key_failed'").bind(isoNow(), isoNow()).run().catch(() => {});
    else await raiseAlert(env, { severity: 'warn', kind: 'supply.key_failed', message: `도매꾹 API 키 확인 실패(${res.status}) ${errText}`.slice(0, 400) });
    return { ok, status: res.status };
  } catch (error) {
    await recordProbe(env, 'failed', { error: 'network' });
    return { ok: false, error: 'network' };
  }
}

/** 위탁 상품 가격·재고·판매상태 동기화. 문제 시 품절 처리 + 관리자 알림. */
export async function syncSupplyProducts(env, fetchImpl = fetch, limit = 20) {
  if (!env?.DB || !env.DOMEMAE_API_KEY) return { synced: 0 };
  const cutoff = new Date(Date.now() - SYNC_INTERVAL_MS).toISOString();
  const rows = await env.DB.prepare(`SELECT id,seller_id,name,price,stock_quantity,supply_item_no,supply_cost,supply_shipping FROM products
    WHERE supply_provider=? AND status='published' AND (supply_synced_at IS NULL OR supply_synced_at<?) ORDER BY supply_synced_at LIMIT ?`)
    .bind(PROVIDER, cutoff, limit).all().catch(() => ({ results: [] }));
  let synced = 0, soldOut = 0;
  for (const row of rows.results || []) {
    const fetched = await fetchDomeggookItem(env, row.supply_item_no, fetchImpl);
    const now = isoNow();
    if (fetched.error) {
      await env.DB.prepare('UPDATE products SET supply_synced_at=? WHERE id=?').bind(now, row.id).run();
      await raiseAlert(env, { severity: 'warn', kind: 'supply.sync_failed', productId: row.id, message: `${row.name}: ${fetched.error}` });
      continue;
    }
    const item = fetched.item;
    const blockers = importBlockers(item);
    const profit = item.cost ? unitProfit(row.price, item.cost, item.shipping ?? row.supply_shipping) : -1;
    if (profit < 0) blockers.push(`원가 상승으로 역마진(1개당 ${profit}원)`);
    if (blockers.length) {
      await env.DB.prepare('UPDATE products SET stock_quantity=0,supply_cost=COALESCE(?,supply_cost),supply_shipping=COALESCE(?,supply_shipping),supply_synced_at=?,updated_at=? WHERE id=?')
        .bind(item.cost, item.shipping, now, now, row.id).run();
      await raiseAlert(env, { severity: 'warn', kind: 'supply.unavailable', productId: row.id, message: `${row.name}: ${blockers.join(', ')} → 자동 품절 처리` });
      soldOut += 1;
    } else {
      const stock = item.inventory === null ? row.stock_quantity : Math.min(MAX_STOCK, Math.trunc(item.inventory));
      await env.DB.prepare('UPDATE products SET stock_quantity=?,supply_cost=?,supply_shipping=?,supply_synced_at=? WHERE id=?')
        .bind(stock, item.cost, item.shipping, now, row.id).run();
    }
    synced += 1;
  }
  return { synced, soldOut };
}

/** 결제 완료된 위탁상품 주문 → 관리자 '발주 필요' 알림(자동발주는 Private API 승인 후 연결). */
export async function notifySupplyOrder(env, order) {
  if (!env?.DB || !order?.product_id) return false;
  const row = await env.DB.prepare('SELECT name,supply_provider,supply_item_no,supply_cost,supply_shipping FROM products WHERE id=?').bind(order.product_id).first();
  if (!row || row.supply_provider !== PROVIDER) return false;
  // 자동발주가 켜져 있으면 cron 이 발주하고, 실패할 때만 알림을 남긴다.
  if (String(env.DOMEGGOOK_AUTO_ORDER_ENABLED || '').toLowerCase() === 'true' && env.DOMEMAE_USER_ID && env.DOMEMAE_PASSWORD) return true;
  await raiseAlert(env, {
    severity: 'warn', kind: 'supply.order_needed', orderId: order.id, productId: order.product_id,
    message: `발주 필요 · 도매꾹 ${row.supply_item_no} · ${row.name} × ${order.quantity || 1} (예상 공급비 ${((row.supply_cost || 0) * (order.quantity || 1) + (row.supply_shipping || 0)).toLocaleString('ko-KR')}원)`
  });
  return true;
}

/**
 * 판매 중인데 사진이 없는 위탁상품에 공급사 허용 사진을 다시 채운다.
 * - 공급사가 재사용을 허용(desc.license.usable)한 사진만 사용한다(저작권).
 * - 큰 원본이 4MB 를 넘으면 large/small 썸네일로 대체한다.
 * - 같은 상품은 12시간에 한 번만 다시 시도하고, 결과를 진단 기록으로 남긴다.
 * - 허용 사진이 없으면 사진 없는 상품을 계속 노출하지 않도록 판매를 잠시 멈춘다(재시도 시 자동 복귀).
 */
export async function backfillSupplyImages(env, fetchImpl = fetch, limit = 8) {
  if (!env?.DB || !env.DOMEMAE_API_KEY || !env.MEDIA?.put) return { skipped: true };
  const cutoff = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const rows = await env.DB.prepare(`SELECT p.id,p.seller_id,p.name,p.status,p.supply_release,p.supply_item_no FROM products p
    WHERE p.supply_provider=? AND (p.status='published' OR (p.status='draft' AND p.supply_release='image_hold')) AND (p.images_json IS NULL OR p.images_json IN ('','[]','null'))
      AND NOT EXISTS (SELECT 1 FROM supplier_connector_checks c WHERE c.external_ref='image:'||p.id AND c.checked_at>?)
    LIMIT ?`).bind(PROVIDER, cutoff, limit).all().catch(() => ({ results: [] }));
  let filled = 0, held = 0;
  for (const row of rows.results || []) {
    const reasons = [];
    const fetched = await fetchDomeggookItem(env, row.supply_item_no, fetchImpl);
    let images = [];
    let license = null;
    if (fetched.error) reasons.push(`lookup:${fetched.code || 'error'}`);
    else {
      const item = fetched.item;
      license = item.licenseUsable;
      if (!item.licenseUsable) reasons.push('license-denied');
      else {
        const urls = [...(item.thumbCandidates || [item.thumbUrl]), ...item.detailImages].filter(Boolean).slice(0, 12);
        images = await copyImages(env, row.id, urls, fetchImpl, { anyHost: true, reasons });
      }
    }
    const now = isoNow();
    if (images.length) {
      await env.DB.prepare(`UPDATE products SET images_json=?,updated_at=? WHERE id=?`).bind(JSON.stringify(images.slice(0, 4)), now, row.id).run();
      if (row.status === 'draft' && row.supply_release === 'image_hold') {
        await env.DB.prepare(`UPDATE products SET status='published',published_at=COALESCE(published_at,?),supply_release='released' WHERE id=?`).bind(now, row.id).run();
      }
      filled += 1;
    } else if (license === false && row.status === 'published') {
      // 공급사가 사진 사용을 허용하지 않으면 사진 없이 판매하지 않는다.
      await env.DB.prepare(`UPDATE products SET status='draft',supply_release='image_hold',updated_at=? WHERE id=? AND status='published'`).bind(now, row.id).run();
      held += 1;
    }
    try {
      await env.DB.prepare(`INSERT INTO supplier_connector_checks (id,provider_id,check_type,external_ref,result_status,metadata_json,checked_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(`chk_${crypto.randomUUID().replaceAll('-', '')}`, 'domemae-official', 'item_lookup', `image:${row.id}`, images.length ? 'ok' : 'failed',
          JSON.stringify({ itemNo: row.supply_item_no, images: images.length, license, reasons: reasons.slice(0, 12) }).slice(0, 1500), now).run();
    } catch {}
  }
  return { filled, held, tried: (rows.results || []).length };
}
