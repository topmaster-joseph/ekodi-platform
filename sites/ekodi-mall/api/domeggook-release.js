// EKODI-MALL-SUPPLY-RELEASE-001
// 운영자 결정(2026-10-25):
//  1) 에코디언이 소싱한 위탁상품은 도매꾹 구매 API 승인(자동 로그인 성공) 후 자동으로 판매·검색노출·홍보를 시작한다.
//     승인 전에는 비공개(staged)로 대기 — 주문이 들어와도 발주할 수 없는 상태로 팔지 않기 위함.
//     게시(published)가 곧 결제 오픈·사이트맵/SEO·자동 홍보 레인 노출의 단일 스위치다.
//  2) 매 1시간 분석 → 선정 기준(최소 점수)을 조금씩 올리고, 판매가 난 키워드는 가중치를 올린다.
import { autoOrderEnabled } from './domeggook-order.js';
import { raiseAlert } from './ops-alerts.js';

const PROVIDER = 'domeggook';
const ekodianEmails = (env) => new Set(String(env?.MALL_EKODIAN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
const isoNow = () => new Date().toISOString();
const APPROVAL_FRESH_MS = 7 * 60 * 60 * 1000;
export const RATCHET_STEP = 0.01;
export const RATCHET_MAX = 0.9;

export async function supplyApproved(env) {
  if (!env?.DB || !autoOrderEnabled(env)) return false;
  if (String(env.DOMEGGOOK_RELEASE_WITHOUT_APPROVAL || '').toLowerCase() === 'true') return true;
  const row = await env.DB.prepare("SELECT result_status,checked_at FROM supplier_connector_checks WHERE external_ref='probe:login' ORDER BY checked_at DESC LIMIT 1").first().catch(() => null);
  return Boolean(row && row.result_status === 'ok' && Date.now() - Date.parse(row.checked_at) < APPROVAL_FRESH_MS);
}

async function ekodianSellerIds(env) {
  const emails = [...ekodianEmails(env)];
  if (!emails.length) return [];
  const rows = await env.DB.prepare(`SELECT user_id FROM seller_profiles WHERE lower(email) IN (${emails.map(() => '?').join(',')})`).bind(...emails).all();
  return (rows.results || []).map((r) => r.user_id);
}

export async function getState(env, key, fallback = '') {
  const row = await env.DB.prepare('SELECT value FROM supply_curation_state WHERE key=?').bind(key).first().catch(() => null);
  return row ? row.value : fallback;
}
async function setState(env, key, value) {
  await env.DB.prepare('INSERT INTO supply_curation_state (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(key, String(value), isoNow()).run();
}

/** 승인 전: 에코디언 위탁상품을 비공개 대기. 승인 후: 대기 상품을 배치로 게시. */
export async function applySupplyGate(env, deps, { releaseBatch = 30 } = {}) {
  if (!env?.DB) return { skipped: 'no-db' };
  const sellers = await ekodianSellerIds(env);
  if (!sellers.length) return { skipped: 'no-ekodian' };
  const inList = sellers.map(() => '?').join(',');
  const approved = await supplyApproved(env);
  const now = isoNow();
  if (!approved) {
    const held = await env.DB.prepare(`UPDATE products SET status='draft',published_at=NULL,supply_release='staged',updated_at=?
      WHERE supply_provider=? AND status='published' AND seller_id IN (${inList}) RETURNING id`).bind(now, PROVIDER, ...sellers).all();
    const n = (held.results || []).length;
    if (n) {
      await env.DB.prepare('INSERT INTO mall_ops_audit (actor,action,seller_id,store_id,product_id,request_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind('mall-auto:supply-gate', 'product.supply.held_until_api_approval', sellers[0], null, null, null, JSON.stringify({ count: n }), now).run().catch(() => {});
      await raiseAlert(env, { severity: 'info', kind: 'supply.release_held', message: `도매꾹 구매 API 승인 전이라 위탁상품 ${n}개를 비공개 대기로 전환했습니다. 승인되면 자동으로 판매·노출·홍보를 시작합니다.` });
    }
    return { approved: false, held: n };
  }
  await env.DB.prepare(`UPDATE products SET supply_release='image_hold' WHERE supply_provider=? AND status='draft' AND supply_release='staged' AND (images_json IS NULL OR images_json IN ('','[]','null'))`).bind(PROVIDER).run().catch(() => {});
  const staged = await env.DB.prepare(`SELECT id,seller_id FROM products WHERE supply_provider=? AND status='draft' AND supply_release='staged' AND seller_id IN (${inList})
    AND COALESCE(stock_quantity,0)>0 ORDER BY created_at LIMIT ?`).bind(PROVIDER, ...sellers, releaseBatch).all();
  let released = 0, failed = 0;
  for (const p of staged.results || []) {
    const result = await deps.setPublished(env, p.seller_id, p.id, true, true);
    if (result?.errors) { failed += 1; await env.DB.prepare("UPDATE products SET supply_release='blocked' WHERE id=?").bind(p.id).run(); continue; }
    await env.DB.prepare("UPDATE products SET supply_release='released' WHERE id=?").bind(p.id).run();
    released += 1;
  }
  if (released) {
    await env.DB.prepare("UPDATE mall_ops_alerts SET status='resolved',resolved_at=?,updated_at=? WHERE status='open' AND kind='supply.release_held'").bind(now, now).run().catch(() => {});
    await raiseAlert(env, { severity: 'info', kind: 'supply.release_started', message: `도매꾹 구매 API 승인 확인 → 위탁상품 ${released}개 판매·검색노출·홍보 시작` });
  }
  return { approved: true, released, failed };
}

/**
 * 매 1시간: 선정 최소점수를 RATCHET_STEP 씩 올리고(상한 RATCHET_MAX),
 * 최근 7일 결제가 난 키워드는 가중치 ×1.05(최대 1.5), 판매 없는 키워드는 ×0.99(최소 0.7).
 */
export async function hourlyRatchet(env, { force = false } = {}) {
  if (!env?.DB) return { skipped: 'no-db' };
  const last = await getState(env, 'ratchet_at', '');
  if (!force && last && Date.now() - Date.parse(last) < 60 * 60 * 1000) return { skipped: 'recent' };
  const prev = Number(await getState(env, 'min_score', '0')) || 0;
  const minScore = Math.min(RATCHET_MAX, Math.round((prev + RATCHET_STEP) * 1000) / 1000);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const perf = await env.DB.prepare(`SELECT c.keyword, COUNT(o.id) orders FROM supply_candidates c
    LEFT JOIN orders o ON o.product_id=c.product_id AND o.status IN ('paid','partially_refunded') AND o.paid_at>=?
    WHERE c.status='imported' GROUP BY c.keyword`).bind(since).all();
  let boosted = 0;
  for (const row of perf.results || []) {
    const factor = Number(row.orders) > 0 ? 1.05 : 0.99;
    if (factor > 1) boosted += 1;
    await env.DB.prepare('UPDATE supply_curation_keywords SET weight_adj=MIN(1.5,MAX(0.7,weight_adj*?)) WHERE keyword=?').bind(factor, row.keyword).run();
  }
  await setState(env, 'min_score', minScore);
  await setState(env, 'ratchet_at', isoNow());
  return { minScore, boosted, keywords: (perf.results || []).length };
}
