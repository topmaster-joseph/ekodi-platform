// Public, read-only guide only. Each linked store keeps separate authority, orders and accounting.
// /cmpmyi/admin/** and POS downloads remain in their existing protected routes.
export const STORE_GUIDE_PATH = '/cmpmyi';
export const STORE_GUIDE_ENTRIES = Object.freeze([
  Object.freeze({ name: 'BBQ 무안청계점', path: '/bbqcg', kind: '치킨', label: 'BBQ', feature: true,
    description: '바삭한 치킨과 따뜻한 한 끼를 만나는 우리 동네 BBQ' }),
  Object.freeze({ name: '피자마루 목포대점', path: '/pizzamaru', kind: '피자', label: 'PIZZA MARU',
    description: '취향에 맞는 피자를 골라 즐기는 목포대 후문 매장' }),
  Object.freeze({ name: '요거트퍼플 목포대점', path: '/yogurt', kind: '디저트', label: 'YOGURT PURPLE',
    description: '가볍고 산뜻한 디저트를 만나는 목포대 후문 매장' }),
]);

const css = `
:root{color-scheme:light;--ink:#20202b;--muted:#666773;--line:#ece7e2;--paper:#faf9f6}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;word-break:keep-all}
a{color:inherit;text-decoration:none}a:focus-visible{outline:3px solid #bc7a13;outline-offset:4px}
.wrap{width:min(1110px,calc(100% - 40px));margin:0 auto}
header{border-bottom:1px solid var(--line);background:#fff}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:68px}
.wordmark{font-size:20px;font-weight:900;letter-spacing:-.06em}.top-note{color:var(--muted);font-size:13px}
.hero{padding:52px 0 24px}.kicker{color:#ad6d24;font-size:12px;font-weight:850;letter-spacing:.12em}.hero h1{font-size:clamp(27px,4.3vw,46px);line-height:1.24;letter-spacing:-.055em;margin:12px 0}
.hero p{color:var(--muted);font-size:clamp(14px,1.8vw,17px);margin:0}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:18px 0 38px}
.card{display:flex;flex-direction:column;min-width:0;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 12px 36px #21202a0a}
.card .art{min-height:165px;padding:22px;display:flex;flex-direction:column;justify-content:space-between;background:#f9edea}
.art strong{font-weight:950;font-size:clamp(20px,2.2vw,27px);letter-spacing:-.045em}
.art span{font-size:11px;font-weight:850;letter-spacing:.16em;opacity:.75}
.card.bbq{border-color:#e3c5ba}.card.bbq .art{background:linear-gradient(135deg,#9a112b,#d42e43);color:#fff}
.card.pizza .art{background:linear-gradient(135deg,#e8f4e4,#c9e9c6);color:#25552d}
.card.yogurt .art{background:linear-gradient(135deg,#f0e4f6,#dac5ef);color:#563477}
.details{padding:23px;display:flex;flex:1;flex-direction:column}
.details small{font-size:12px;color:#a36a32;font-weight:800}.details h2{font-size:21px;line-height:1.35;letter-spacing:-.04em;margin:7px 0}.details p{color:var(--muted);font-size:14px;margin:0 0 22px}
.go{display:flex;align-items:center;justify-content:center;min-height:47px;margin-top:auto;border-radius:11px;color:#fff;background:#252433;font-size:14px;font-weight:850}
.card.bbq .go{background:#b71835}.go:hover{filter:brightness(1.12)}
.notice{border-top:1px solid var(--line);padding:21px 0 37px;color:var(--muted);font-size:13px}
.notice strong{color:var(--ink)}.notice a{text-decoration:underline;text-underline-offset:3px}
footer{border-top:1px solid var(--line);background:#fff;padding:20px 0;color:var(--muted);font-size:12px}
@media(max-width:820px){.cards{grid-template-columns:1fr 1fr}.card .art{min-height:144px}}
@media(max-width:580px){.wrap{width:calc(100% - 28px)}.top{min-height:59px}.wordmark{font-size:17px}.top-note{font-size:11px}.hero{padding:30px 0 14px}.cards{grid-template-columns:1fr;gap:12px;padding:10px 0 24px}.card{display:grid;grid-template-columns:34% 1fr;border-radius:15px}.card .art{min-height:178px;padding:15px}.art strong{font-size:20px;overflow-wrap:anywhere}.art span{font-size:9px}.details{padding:16px}.details h2{font-size:17px}.details p{font-size:12px;margin-bottom:13px}.go{min-height:44px;font-size:12px}.notice{padding:15px 0 22px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

function card(store, index) {
  const tone = index === 0 ? 'bbq' : index === 1 ? 'pizza' : 'yogurt';
  return '<article class="card ' + tone + '">' +
    '<div class="art"><span>' + (store.feature ? '대표 매장 · CHICKEN' : store.kind.toUpperCase()) + '</span><strong>' + store.label + '</strong></div>' +
    '<div class="details"><small>' + store.kind + ' · 독립 매장 안내</small><h2>' + store.name + '</h2>' +
    '<p>' + store.description + '</p><a class="go" href="' + store.path + '" aria-label="' + store.name + ' 전용 홈페이지로 이동">매장 홈페이지 보기 →</a></div>' +
    '</article>';
}

export function storeGatewayPage(request = new Request('https://ekodi.kr/cmpmyi')) {
  const html = '<!doctype html><html lang="ko" data-store-guide="three-independent-stores">' +
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="index,follow"><meta name="theme-color" content="#faf9f6">' +
    '<meta name="description" content="목포대 후문 BBQ 무안청계점, 피자마루 목포대점, 요거트퍼플 목포대점의 독립 매장 홈페이지 안내">' +
    '<link rel="canonical" href="https://ekodi.kr/cmpmyi"><title>목포대 후문 3개 매장 안내</title><style>' + css + '</style></head>' +
    '<body><header><div class="wrap top"><a class="wordmark" href="/cmpmyi">목포대 후문 · 매장 안내</a><span class="top-note">3개 매장 · 각각 독립 운영</span></div></header>' +
    '<main class="wrap"><section class="hero"><div class="kicker">CHEONGGYE STORE GUIDE</div>' +
    '<h1>가까운 우리 동네,<br>세 곳의 맛있는 선택</h1>' +
    '<p>매장을 선택하면 각 매장의 메뉴·주문·방문 정보를 확인할 수 있습니다.</p></section>' +
    '<section class="cards" aria-label="운영 중인 세 개 매장">' + STORE_GUIDE_ENTRIES.map(card).join('') + '</section>' +
    '<aside class="notice"><strong>안내</strong> · 세 매장은 각각 별도로 운영됩니다. 메뉴·가격·주문 가능 여부는 해당 매장 홈페이지에서 확인해 주세요. ' +
    '문의 전화 <a href="tel:0614538295">061-453-8295</a>.</aside></main>' +
    '<footer><div class="wrap">3개 매장 통합 안내 · 매장별 독립 운영</div></footer></body></html>';
  return new Response(request.method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-robots-tag': 'index,follow',
      'x-ekodi-route': 'cmpmyi-three-store-guide',
    },
  });
}
