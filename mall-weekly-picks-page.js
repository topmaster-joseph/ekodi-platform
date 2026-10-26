// EKODI Mall — server-rendered weekly picks page (/ekodimall/picks).
//
// Why: the Mall storefront renders affiliate products client-side, so search
// engines index almost nothing of the catalog. This page renders the current
// weekly board (or, if no board exists, the top active catalog products) as
// crawlable HTML with a static affiliate disclosure, sponsored links and
// schema.org ItemList data. Read-only: it never writes to D1.
import { isoWeekInfo } from './mall-official-promotion-board.js';
import { renderMallHeader } from './mall-shared-header.js';

export const MALL_PICKS_PATH = '/ekodimall/picks';
export const MALL_PICKS_CANONICAL = 'https://ekodi.kr/ekodimall/picks';
const ACCOUNT_ID = 'coupang-ekodibiz';
const STOREFRONT = 'ekodi-mall';
const MAX_ITEMS = 12;
export const MALL_PICKS_DISCLOSURE = '이 페이지는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다. 추천 순서는 수수료와 분리해 정합니다.';

export function isMallPicksPath(pathname = '') {
  return pathname === MALL_PICKS_PATH || pathname === `${MALL_PICKS_PATH}/`;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const won = value => `${new Intl.NumberFormat('ko-KR').format(Math.max(0, Math.trunc(Number(value) || 0)))}원`;

export function clickUrl(id) { return `https://ekodi.kr/api/affiliate/public/click/${Number(id)}?storefront=${STOREFRONT}`; }
export function imageUrl(id) { return `https://ekodi.kr/api/affiliate/public/image/${Number(id)}?storefront=${STOREFRONT}`; }

// Factual "why this pick" line built only from stored attributes.
export function pickReason(item = {}) {
  const parts = [];
  if (item.category) parts.push(`${item.category} 분야`);
  if (Number(item.provider_rank) > 0 && Number(item.provider_rank) <= 3) parts.push('쿠팡 검색 상위 노출');
  if (Number(item.is_rocket) === 1) parts.push('로켓배송');
  if (Number(item.is_free_shipping) === 1) parts.push('무료배송');
  return parts.join(' · ') || '에코디 큐레이션';
}

export async function loadMallPicks(env, date = new Date()) {
  const db = env?.DB;
  if (!db?.prepare) return { items: [], source: 'unavailable', week: isoWeekInfo(date) };
  const week = isoWeekInfo(date);
  const cols = 'p.id,p.product_name,p.price_krw,p.category,p.provider_rank,p.is_rocket,p.is_free_shipping,p.last_seen_at';
  let items = [];
  let source = 'weekly-board';
  try {
    const board = await db.prepare(`SELECT ${cols},w.tier,w.slot FROM affiliate_promotion_weekly_products w
      JOIN affiliate_storefront_products p ON p.id=w.product_row_id
      WHERE w.week_key=? AND p.account_id=? AND p.storefront_slug=? AND p.status='active'
      ORDER BY CASE w.tier WHEN 'A' THEN 1 ELSE 2 END,w.slot LIMIT ?`).bind(week.weekKey, ACCOUNT_ID, STOREFRONT, MAX_ITEMS).all();
    items = board?.results || [];
  } catch { items = []; }
  if (items.length < 6) {
    source = items.length ? 'weekly-board+catalog' : 'catalog';
    try {
      const seen = new Set(items.map(item => Number(item.id)));
      const fill = await db.prepare(`SELECT ${cols} FROM affiliate_storefront_products p
        WHERE p.account_id=? AND p.storefront_slug=? AND p.status='active' AND p.price_krw>0
        ORDER BY CASE WHEN p.provider_rank>0 THEN p.provider_rank ELSE 9999 END,p.selection_score DESC,p.id DESC LIMIT ?`).bind(ACCOUNT_ID, STOREFRONT, MAX_ITEMS * 2).all();
      for (const row of fill?.results || []) {
        if (items.length >= MAX_ITEMS) break;
        if (!seen.has(Number(row.id))) { items.push(row); seen.add(Number(row.id)); }
      }
    } catch {}
  }
  return { items: items.slice(0, MAX_ITEMS), source, week };
}

export function renderMallPicksHtml({ items = [], week = isoWeekInfo(), generatedAt = new Date() } = {}) {
  const title = `이번 주 에코디 추천 상품 (${week.startDate} 주) | EKODI Mall`;
  const description = '생활·선물·주방·건강 분야에서 에코디가 이번 주 고른 상품입니다. 가격과 배송 조건은 판매처에서 최종 확인하세요.';
  const stamp = new Date(generatedAt).toISOString();
  const kst = new Date(new Date(generatedAt).getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  const ld = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: title, url: MALL_PICKS_CANONICAL,
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: String(item.product_name || '').slice(0, 150), url: clickUrl(item.id) })),
  };
  const cards = items.map((item, index) => `
      <li class="pick">
        <img src="${esc(imageUrl(item.id))}" alt="${esc(item.product_name)}" loading="${index < 3 ? 'eager' : 'lazy'}" width="200" height="200">
        <div class="pick-body">
          <p class="pick-meta">${esc(pickReason(item))}</p>
          <h2>${esc(item.product_name)}</h2>
          <p class="pick-price">${Number(item.price_krw) > 0 ? esc(won(item.price_krw)) : '가격은 판매처에서 확인'}</p>
          <a class="pick-cta" href="${esc(clickUrl(item.id))}" rel="sponsored nofollow noopener" target="_blank">쿠팡에서 보기</a>
        </div>
      </li>`).join('');
  const empty = '<p class="empty">이번 주 추천 상품을 준비하고 있습니다. <a href="/ekodimall/coupang/">생활상품 찾기</a>에서 조건으로 찾아보세요.</p>';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${MALL_PICKS_CANONICAL}">
<link rel="stylesheet" href="/ekodimall/assets/styles.css">
<link rel="stylesheet" href="/ekodimall/assets/platform.css">
<link rel="stylesheet" href="/ekodimall/assets/home-refresh.css">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${MALL_PICKS_CANONICAL}">
<script type="application/ld+json">${JSON.stringify(ld).replaceAll('<', '\\u003c')}</script>
<style>
:root{--ink:#14213d;--muted:#5b6475;--line:#e3e7ee;--bg:#fbfaf7;--accent:#1f3a8a}
@media (prefers-color-scheme:dark){:root{--ink:#eef1f6;--muted:#a9b1c0;--line:#2b3140;--bg:#12151c;--accent:#8fb0ff}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;line-height:1.55}
main{max-width:1080px;margin:0 auto;padding:28px 16px 56px}
.eyebrow{font-size:.78rem;letter-spacing:.14em;color:var(--muted);margin:0}
h1{font-size:clamp(1.5rem,3.6vw,2.2rem);margin:.3rem 0 .4rem}
.lead{color:var(--muted);margin:0 0 .8rem}
.disclosure{border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:.9rem;color:var(--muted);margin:0 0 20px}
.picks{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.pick{border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;background:color-mix(in srgb,var(--bg) 92%,#fff)}
.pick img{width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;background:#fff}
.pick-body{padding:12px 14px 16px;display:flex;flex-direction:column;gap:6px;flex:1}
.pick-meta{font-size:.78rem;color:var(--muted);margin:0}
.pick h2{font-size:1rem;margin:0;font-weight:600;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.pick-price{font-weight:700;margin:0}
.pick-cta{margin-top:auto;display:inline-block;text-align:center;border-radius:999px;padding:9px 14px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
.note{font-size:.82rem;color:var(--muted);margin-top:22px}
.empty a,.note a{color:var(--accent)}
</style>
</head>
<body>
${renderMallHeader({ publicPrefix: '/ekodimall', home: false })}
<main>
  <p class="eyebrow">EKODI MALL · WEEKLY PICKS</p>
  <h1>이번 주 에코디 추천</h1>
  <p class="lead">${esc(week.startDate)} 주간 · 생활에 바로 쓰는 상품을 이유와 함께 골랐습니다.</p>
  <p class="disclosure">${esc(MALL_PICKS_DISCLOSURE)}</p>
  ${items.length ? `<ol class="picks">${cards}\n  </ol>` : empty}
  <p class="note">가격·재고·배송 조건은 ${esc(kst)} (KST) 기준이며 판매처에서 달라질 수 있습니다. 주문·결제·배송·반품은 판매처에서 진행됩니다. · <a href="/ekodimall/">에코디몰 홈</a> · <a href="/ekodimall/coupang/">조건으로 상품 찾기</a></p>
  <span hidden data-generated-at="${esc(stamp)}"></span>
</main>
<script defer src="/ekodimall/assets/mall-header-nav.js"></script>
</body>
</html>`;
}

export async function mallPicksResponse(env, date = new Date()) {
  const data = await loadMallPicks(env, date);
  const html = renderMallPicksHtml({ ...data, generatedAt: date });
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=1800',
      'x-ekodi-picks-source': data.source,
      'x-ekodi-picks-count': String(data.items.length),
    },
  });
}
