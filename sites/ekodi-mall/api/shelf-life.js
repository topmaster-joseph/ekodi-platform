// EKODI-MALL-SHELF-LIFE-001 (2026-10-25)
// 에코디몰 직접판매 소비기한 기준:
//  - 소비기한이 입력된 직접판매 상품은 남은 기간이 3개월 이상일 때만 판매한다.
//  - 새로 입력·변경하는 소비기한이 3개월 미만이면 등록을 거부한다.
//  - 이미 등록된 상품이 3개월 미만 구간에 들어오면 자동으로 품절 처리한다
//    (주문 quote 차단 + 10분 cron이 재고를 0으로 내리고 원래 수량을 기록).
// 날짜 기준은 한국 표준시(KST, UTC+9)다.

export const SHELF_LIFE_MIN_MONTHS = 3;
export const EXPIRY_BLOCKER = 'expiry-window';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KST_OFFSET_MS = 9 * 3600 * 1000;

function pad(n) { return String(n).padStart(2, '0'); }

function daysInMonth(year, month1) { return new Date(Date.UTC(year, month1, 0)).getUTCDate(); }

// 'YYYY-MM-DD' 형식의 실제 존재하는 날짜만 통과시킨다. 그 외는 null.
export function cleanExpiryDate(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replaceAll('.', '-').replaceAll('/', '-');
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function kstToday(now = new Date()) {
  const t = new Date(now.getTime() + KST_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// 오늘(KST) + N개월. 말일 보정: 11-30 + 3개월 = 02-28(또는 29).
export function shelfLifeCutoff(now = new Date(), months = SHELF_LIFE_MIN_MONTHS) {
  const [y, m, d] = kstToday(now).split('-').map(Number);
  const total = (m - 1) + months;
  const ty = y + Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return `${ty}-${pad(tm)}-${pad(Math.min(d, daysInMonth(ty, tm)))}`;
}

// 소비기한이 기준일(오늘+3개월)보다 앞이면 판매 불가 구간이다. 소비기한 미입력은 판단하지 않는다.
export function isInExpiryWindow(expiryDate, now = new Date()) {
  const clean = cleanExpiryDate(expiryDate);
  if (!clean) return false;
  return clean < shelfLifeCutoff(now);
}

export function expiryWindowMessage(now = new Date()) {
  return `소비기한이 ${SHELF_LIFE_MIN_MONTHS}개월 미만 남은 상품은 직접판매로 등록할 수 없습니다. ${shelfLifeCutoff(now)} 이후 소비기한이어야 합니다.`;
}

export async function shelfLifeSchemaReady(env) {
  if (!env?.DB) return false;
  try {
    const rows = await env.DB.prepare("SELECT name FROM pragma_table_info('products')").all();
    return (rows.results || []).some(r => r.name === 'expiry_date');
  } catch {
    return false;
  }
}

// cron: 3개월 미만 구간에 들어온 직접판매 상품을 품절(재고 0) 처리하고 원래 재고를 expiry_held_stock에 남긴다.
export async function sweepExpiryWindow(env, now = new Date()) {
  if (!(await shelfLifeSchemaReady(env))) return { skipped: 'schema-not-ready', soldOut: 0 };
  const cutoff = shelfLifeCutoff(now);
  const result = await env.DB.prepare(`UPDATE products
    SET expiry_held_stock=stock_quantity, stock_quantity=0, expiry_sold_out_at=?, updated_at=?
    WHERE sale_type='direct' AND expiry_date IS NOT NULL AND expiry_date < ? AND expiry_sold_out_at IS NULL`)
    .bind(now.toISOString(), now.toISOString(), cutoff).run();
  return { cutoff, soldOut: Number(result?.meta?.changes ?? result?.changes ?? 0) };
}
