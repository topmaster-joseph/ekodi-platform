import { PUBLIC_SALE_LISTING_WHERE } from './public-sale-visibility.js';
// EKODI-MALL-SEO-INDEX-001: 구매 가능한 공개상품 주소만 IndexNow 참여 검색엔진에 1시간마다 알린다.
// 구글은 별도의 sitemap 경로를 사용한다. 준비 상품은 검색 등록 대상에서 제외한다.
// 키는 ekodi.kr 공개 키 파일(https://ekodi.kr/<key>.txt)과 같은 값이다(공개값).
const INDEXNOW_KEY = 'e4c0d1a7b29f43d8a65c712fe9b3048c';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const INTERVAL_MS = 60 * 60 * 1000;
const isoNow = () => new Date().toISOString();

async function state(env, key, value) {
  if (value === undefined) {
    const row = await env.DB.prepare('SELECT value FROM supply_curation_state WHERE key=?').bind(key).first().catch(() => null);
    return row ? row.value : '';
  }
  await env.DB.prepare('INSERT INTO supply_curation_state (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(key, String(value), isoNow()).run();
}

// 첫 전송(1000건)에서 429(과다 요청)를 받아 한 번에 200건씩 나눠 보낸다(시간당 1회).
export async function submitProductIndexNow(env, fetchImpl = fetch, { force = false, limit = 200 } = {}) {
  if (!env?.DB) return { skipped: 'no-db' };
  if (String(env.MALL_INDEXNOW_ENABLED || 'true').toLowerCase() === 'false') return { skipped: 'disabled' };
  const lastRun = await state(env, 'indexnow_run_at');
  if (!force && lastRun && Date.now() - Date.parse(lastRun) < INTERVAL_MS) return { skipped: 'recent' };
  const since = (await state(env, 'indexnow_since')) || '1970-01-01T00:00:00.000Z';
  const rows = await env.DB.prepare(`SELECT p.share_code, COALESCE(p.updated_at,p.published_at) AS changed FROM products p
    WHERE ${PUBLIC_SALE_LISTING_WHERE} AND COALESCE(p.updated_at,p.published_at) > ? ORDER BY changed LIMIT ?`).bind(since, limit).all();
  const list = rows.results || [];
  await state(env, 'indexnow_run_at', isoNow());
  if (!list.length) return { submitted: 0 };
  const base = String(env.MALL_BASE_URL || 'https://ekodi.kr/ekodimall').replace(/\/$/, '');
  const urlList = list.map((r) => `${base}/p/${encodeURIComponent(r.share_code)}`);
  let status = 0;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: 'ekodi.kr', key: INDEXNOW_KEY, keyLocation: `https://ekodi.kr/${INDEXNOW_KEY}.txt`, urlList })
    });
    status = res.status;
  } catch { status = 0; }
  const ok = status === 200 || status === 202;
  if (ok) await state(env, 'indexnow_since', list[list.length - 1].changed);
  await state(env, 'indexnow_last', JSON.stringify({ at: isoNow(), status, submitted: ok ? urlList.length : 0 }));
  return { submitted: ok ? urlList.length : 0, status };
}
