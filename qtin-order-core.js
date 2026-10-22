// EKODI-QTIN-GROUP-ORDER-001 — pure, dependency-free core logic.
// Time windows (KST), QTM product parsing and order validation live here so they
// can be unit-tested without D1, network or the Toss SDK.

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const OPEN_DAY = 20;
export const CLOSE_DAY = 25;
export const MAX_QTY_PER_ITEM = 50;
export const MAX_ITEMS_PER_ORDER = 30;
export const PENDING_TTL_MS = 30 * 60 * 1000;
export const ORGS = Object.freeze({
  church: Object.freeze({ id: 'church', label: '에코디교회' }),
  mission: Object.freeze({ id: 'mission', label: '에코디선교회' }),
  other: Object.freeze({ id: 'other', label: '기타' }),
});
export const FULFILLMENT = Object.freeze(['waiting', 'ordered', 'received', 'distributed']);
export const QTM_ORIGIN = 'https://www.qtm.or.kr';

export function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ---------- KST calendar ----------
export function kstParts(date = new Date()) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), hour: shifted.getUTCHours() };
}

/** UTC Date for a KST wall-clock time. month is 1-based and may overflow. */
export function kstToUtc(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - KST_OFFSET_MS);
}

export function campaignId(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseCampaignId(id) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(id || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function addMonth(year, month, delta) {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/** Default intake window for target issue year/month: prior month 20th 00:00 → 25th 23:59:59 KST. */
export function defaultWindow(targetYear, targetMonth) {
  const prev = addMonth(targetYear, targetMonth, -1);
  return {
    opensAt: kstToUtc(prev.year, prev.month, OPEN_DAY, 0, 0, 0).toISOString(),
    closesAt: kstToUtc(prev.year, prev.month, CLOSE_DAY, 23, 59, 59).toISOString(),
  };
}

/** The issue whose intake is current or next relative to `now`. */
export function targetIssueFor(now = new Date()) {
  // Every intake window (20th–25th of month M) is for issue M+1, so the
  // current-or-next window always belongs to next month's issue.
  const { year, month } = kstParts(now);
  const next = addMonth(year, month, 1);
  return { ...next, id: campaignId(next.year, next.month) };
}

/** Should the scheduler prepare/sync the next issue now? (KST 19th–25th) */
export function inPreparationWindow(now = new Date()) {
  const { day } = kstParts(now);
  return day >= OPEN_DAY - 1 && day <= CLOSE_DAY;
}

export function campaignState(campaign, now = new Date()) {
  if (!campaign) return 'none';
  if (campaign.manual_state === 'force_closed') return 'closed';
  if (campaign.manual_state === 'force_open') return 'open';
  if (campaign.status === 'cancelled') return 'closed';
  const t = now.getTime();
  if (t < Date.parse(campaign.opens_at)) return 'scheduled';
  if (t > Date.parse(campaign.closes_at)) return 'closed';
  return 'open';
}

export function formatKst(iso, withTime = true) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const d = new Date(time + KST_OFFSET_MS);
  const base = `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
  if (!withTime) return base;
  return `${base} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatWon(value) {
  return `${Math.trunc(Number(value) || 0).toLocaleString('ko-KR')}원`;
}

// ---------- QTM parsing ----------
const ISSUE_RE = /(\d{4})\s*년\s*(\d{1,2})(?:\s*[·∙,~\-]\s*(\d{1,2}))?\s*월\s*호/;

/** Parse "큐티인(QTIN)(큰글씨) 2026년 11월호" → { year, month, months, series }. */
export function parseIssueTitle(name) {
  const text = clean(name, 300);
  const match = ISSUE_RE.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const second = match[3] ? Number(match[3]) : null;
  if (month < 1 || month > 12) return null;
  const months = second && second >= 1 && second <= 12 ? [month, second] : [month];
  const series = clean(text.slice(0, match.index).replace(/\s+/g, ' '), 200);
  return { year, month, months, series };
}

export function titleMatchesIssue(name, year, month) {
  const parsed = parseIssueTitle(name);
  return Boolean(parsed && parsed.year === year && parsed.months.includes(month));
}

/** Only genuine QTIN-family periodicals (exclude unrelated products that merely carry a date). */
export function isQtinFamily(name) {
  return /큐티인|QTIN|QTin|Qtin/i.test(String(name || ''));
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function toPrice(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

export function absoluteQtmUrl(value) {
  const raw = decodeEntities(clean(value, 1000));
  if (!raw) return '';
  try {
    const url = new URL(raw, QTM_ORIGIN + '/');
    if (url.hostname !== 'www.qtm.or.kr' && url.hostname !== 'qtm.or.kr') return '';
    url.protocol = 'https:';
    url.hostname = 'www.qtm.or.kr';
    return url.toString();
  } catch {
    return '';
  }
}

/** Every QTM product id linked from a page (list, search or detail prev/next links). */
export function extractItemIds(html) {
  const ids = new Set();
  const text = String(html || '');
  for (const m of text.matchAll(/(?:https?:\/\/(?:www\.)?qtm\.or\.kr)?\/shop\/(\d{6,14})(?=["'?#\/\s>])/g)) ids.add(m[1]);
  for (const m of text.matchAll(/it_id=(\d{6,14})/g)) ids.add(m[1]);
  return [...ids];
}

/** Parse a youngcart-style QTM product detail page. Returns null when no name/price can be proven. */
export function parseProductDetail(html, itemId) {
  const text = String(html || '');
  let name = '';
  const titleMatch = /<h2[^>]*id=["']sit_title["'][^>]*>([\s\S]*?)<\/h2>/i.exec(text);
  if (titleMatch) name = stripTags(titleMatch[1].replace(/<span[^>]*sound_only[^>]*>[\s\S]*?<\/span>/gi, ''));
  if (!name) {
    const h2 = /<h2[^>]*>([^<]*?\d{4}\s*년\s*\d{1,2}[^<]*?월\s*호[^<]*?)(?:<|요약정보)/i.exec(text);
    if (h2) name = stripTags(h2[1]);
  }
  if (!name) {
    const notice = /도서명\s*<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(text);
    if (notice) name = stripTags(notice[1]);
  }
  name = clean(name.replace(/요약정보\s*및\s*구매/g, ''), 200);

  let salePrice = 0;
  const hidden = /id=["']it_price["'][^>]*value=["'](\d+)["']|value=["'](\d+)["'][^>]*id=["']it_price["']/i.exec(text);
  if (hidden) salePrice = Number(hidden[1] || hidden[2]);
  if (!salePrice) {
    const sale = /판매가격\s*<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(text);
    if (sale) salePrice = toPrice(stripTags(sale[1]));
  }
  let listPrice = 0;
  const list = /시중가격\s*<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(text);
  if (list) listPrice = toPrice(stripTags(list[1]));

  let imageUrl = '';
  const id = String(itemId || '');
  const imgRe = new RegExp(`(?:src|href)=["']([^"']*/data/item/${id}/[^"']+\\.(?:jpe?g|png|gif|webp))["']`, 'gi');
  const candidates = [...text.matchAll(imgRe)].map(m => m[1]);
  const preferred = candidates.find(src => !/thumb-[^/]*_\d+x\d+\./i.test(src)) || candidates[0] || '';
  imageUrl = absoluteQtmUrl(preferred);

  if (!name || !salePrice || salePrice < 100 || salePrice > 1_000_000) return null;
  return { qtmItemId: id, name, salePrice, listPrice, imageUrl, productUrl: `${QTM_ORIGIN}/shop/${id}` };
}

const SERIES_ORDER = ['작은글씨', '큰글씨', 'Young', '청소년', 'Teens', '어린이', '샛별', '새싹', '영문', 'English'];
export function seriesSortOrder(name) {
  const idx = SERIES_ORDER.findIndex(key => String(name).includes(key));
  return idx === -1 ? 90 : (idx + 1) * 10;
}

// ---------- order validation ----------
export function normalizePhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!/^01[016789]\d{7,8}$/.test(digits)) return '';
  return digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function maskName(name) {
  const value = clean(name, 40);
  if (value.length <= 1) return value;
  if (value.length === 2) return value[0] + '*';
  return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
}

/**
 * Validate a public order request against the server's current product list.
 * Prices always come from `products` (server), never from the request.
 */
export function buildOrderDraft(body, products) {
  const errors = [];
  const org = ORGS[clean(body?.org, 20)] ? clean(body.org, 20) : '';
  if (!org) errors.push('소속(에코디교회·에코디선교회·기타)을 선택해 주세요.');
  const applicantName = clean(body?.name, 40);
  if (applicantName.length < 2) errors.push('신청자 이름을 2자 이상 입력해 주세요.');
  const phone = normalizePhone(body?.phone);
  if (!phone) errors.push('휴대전화 번호를 정확히 입력해 주세요.');
  const email = clean(body?.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('이메일 형식이 올바르지 않습니다.');
  if (body?.privacyConsent !== true) errors.push('개인정보 수집·이용에 동의해 주세요.');
  const department = clean(body?.department, 80);
  // 기타 소속은 어디에 속한 분인지 알아야 나눠 드릴 수 있으므로 소속 이름이 필수다.
  if (org === 'other' && department.length < 2) errors.push('기타 소속을 선택하셨다면 소속 교회·단체 이름을 입력해 주세요.');
  const memo = clean(body?.memo, 300);

  const byId = new Map((products || []).filter(p => Number(p.active) === 1).map(p => [p.id, p]));
  const raw = Array.isArray(body?.items) ? body.items : [];
  if (raw.length > MAX_ITEMS_PER_ORDER) errors.push('신청 항목이 너무 많습니다.');
  const lines = [];
  const seen = new Set();
  for (const entry of raw.slice(0, MAX_ITEMS_PER_ORDER)) {
    const productId = clean(entry?.productId, 120);
    const quantity = Math.trunc(Number(entry?.quantity));
    if (!productId || !Number.isFinite(quantity) || quantity === 0) continue;
    const product = byId.get(productId);
    if (!product) { errors.push('선택한 도서 중 신청할 수 없는 항목이 있습니다. 새로고침 후 다시 선택해 주세요.'); continue; }
    if (seen.has(productId)) { errors.push('같은 도서가 중복 선택되었습니다.'); continue; }
    if (quantity < 1 || quantity > MAX_QTY_PER_ITEM) { errors.push(`수량은 도서별 1~${MAX_QTY_PER_ITEM}권입니다.`); continue; }
    seen.add(productId);
    const unitPrice = Math.trunc(Number(product.sale_price));
    lines.push({ productId, qtmItemId: product.qtm_item_id, productName: product.name, unitPrice, quantity, lineAmount: unitPrice * quantity });
  }
  if (!lines.length) errors.push('신청할 도서와 수량을 선택해 주세요.');
  const totalAmount = lines.reduce((sum, line) => sum + line.lineAmount, 0);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (lines.length && (totalAmount < 100 || totalAmount > 5_000_000)) errors.push('결제 금액 범위를 벗어났습니다.');
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  const first = lines[0].productName.replace(/\s+/g, ' ');
  const orderName = clean(lines.length > 1 ? `${first} 외 ${lines.length - 1}종` : first, 100);
  return { ok: true, draft: { org, applicantName, phone, email, department, memo, lines, totalAmount, totalQuantity, orderName } };
}

export function newOrderId(campaign, random = crypto.getRandomValues(new Uint8Array(10))) {
  const suffix = [...random].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
  return `QTIN-${String(campaign).replace(/[^0-9]/g, '')}-${suffix}`;
}

export function isValidTossOrderId(id) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(String(id || ''));
}

/** Server-side guard before calling the Toss confirm API. */
export function assessConfirmation(order, amount, now = new Date()) {
  if (!order) return { ok: false, status: 404, code: 'ORDER_NOT_FOUND', message: '신청 내역을 찾을 수 없습니다.' };
  if (order.status === 'paid') return { ok: false, status: 409, code: 'ALREADY_PAID', message: '이미 결제가 완료된 신청입니다.' };
  if (order.status !== 'payment_pending') return { ok: false, status: 409, code: 'NOT_PAYABLE', message: '결제할 수 없는 신청 상태입니다.' };
  const expected = Math.trunc(Number(order.total_amount));
  if (!Number.isFinite(amount) || Math.trunc(amount) !== expected) return { ok: false, status: 409, code: 'AMOUNT_MISMATCH', message: '결제 금액이 신청 금액과 일치하지 않습니다.' };
  const expires = Date.parse(order.expires_at);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return { ok: false, status: 410, code: 'ORDER_EXPIRED', message: '결제 가능 시간이 지났습니다. 다시 신청해 주세요.' };
  return { ok: true };
}

export function csvEscape(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Book introduction (목차·책 속으로·출판사 서평 …) from a QTM product detail page.
 * Youngcart renders it in #sit_inf_explan; fall back to the text between the
 * "상품 상세설명" and "상품 정보 고시" headings. Images and scripts are dropped.
 */
export function parseProductIntro(html) {
  const text = String(html || '');
  let block = '';
  const start = text.search(/id=["']sit_inf_explan["']/i);
  if (start !== -1) {
    const open = text.indexOf('>', start) + 1;
    const ends = [/id=["']sit_inf_open["']/i, /상품\s*정보\s*고시/, /id=["']sit_use["']/i].map(re => { const i = text.slice(open).search(re); return i === -1 ? Infinity : open + i; });
    block = text.slice(open, Math.min(...ends, open + 200000));
  } else {
    const head = text.search(/상품\s*상세설명/);
    if (head !== -1) {
      const rest = text.slice(head);
      const stop = rest.search(/상품\s*정보\s*고시/);
      block = rest.slice(rest.indexOf('>') + 1, stop === -1 ? 200000 : stop);
    }
  }
  if (!block) return '';
  const lines = decodeEntities(block
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/gi, '\n')
    .replace(/<(td|th)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ''))
    .split('\n')
    .map(line => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(line => line && !/^(상품\s*상세설명|상품\s*정보\s*고시)$/.test(line) && !/\.(jpe?g|png|gif|webp)$/i.test(line));
  const out = [];
  for (const line of lines) if (out[out.length - 1] !== line) out.push(line);
  return out.join('\n').slice(0, 8000);
}
