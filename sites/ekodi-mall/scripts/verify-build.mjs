import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
// build-meta mirrors content/site.json; the payments marker follows the committed owner decision.
const site = JSON.parse(await readFile(path.join(root, 'content', 'site.json'), 'utf8'));
const paymentsMarker = `"paymentsEnabled": ${site?.commerce?.paymentsEnabled === true}`;
const checks = [
  ['category-availability.json', ['"categories":', '"hasLocal":']],
  ['index.html', ['EKODI MALL', 'ALL MARKET', '7·8·9', '상품 하나부터', '무엇을 찾고 계세요?', '추천순위는 제휴수수료와 분리합니다', 'mallSearchGroups', '/assets/marketplace-live.js', '/assets/category-visibility.js', '/assets/context-curator.js', '/assets/local-commerce.js', '내 로컬']],
  ['assets/category-visibility.js', ['TOSS-MALL-UNDERWRITING-001', 'data-filter-target', 'api/public/products', 'credentials', 'MutationObserver']],
  ['assets/local-commerce.js', ['ekodiMallLocalRegionV1', 'explicit', 'geolocation', '좌표는 저장하지 않습니다', 'ekodi:local-region-change']],
  ['assets/context-curator.js', ['ekodi.kr/api/affiliate/public/products', 'diversified', 'groupOffers', '제휴수수료와 분리합니다', 'data-context-prompt', 'context-detail-button', 'context-offer-dialog', '어디서 살까요?', '판매처에서 구매']],
  ['travel/stay/index.html', ['여행·레저', '아고다 제휴 숙소', '지역·숙소명 검색', 'data-affiliate-mode="stay"', 'affiliateProductDialog', 'affiliate-hub.js', '아고다에서 숙소 찾기', 'rel="noopener noreferrer sponsored"']],
  ['coupang/index.html', ['쿠팡제휴몰', '쿠팡파트너스 제휴상품', '쿠팡 제휴상품 검색', 'data-affiliate-mode="shopping"', '쿠팡 파트너스 활동의 일환', 'affiliateProductDialog', 'affiliate-hub.js']],
  ['assets/affiliate-hub.js', ['affiliate/public/products', 'noopener sponsored', 'affiliate-card-image', 'showDetail', '아고다에서 확인']],
  ['assets/affiliate-share.js', ['shareUrlForProduct', 'prioritizeSharedProduct', 'safeAffiliateHttps', 'affiliateProviderMatches', 'conciseAffiliateDescription', 'https://ekodi.kr', 'product']],
  ['assets/context-curator.css', ['context-hero', 'context-result-grid', 'discover-grid', 'buyer-mobile', 'context-offer-dialog', 'context-detail-offer']],
  ['assets/styles.css', ['EKODI typography invariant', 'word-break:keep-all', 'overflow-wrap:break-word', 'hyphens:none', '.ekodi-break-anywhere']],
  ['seller/index.html', ['OPEN SELLER STUDIO', 'PERSONAL PRODUCT STUDIO', 'sellerDraftForm', 'Google로 무료 시작', '7%', '8%', '9%', 'STOREFRONT', 'ANALYTICS', '/assets/seller-readiness.js', '/assets/seller-analytics.js', '/assets/seller-storefronts.js', '/assets/seller-wizard.js', '/assets/analytics.css']],
  ['checkout/index.html', ['INQUIRY BASKET', 'basketItems', '/assets/commerce.js']],
  ['stores/ekodi-select/index.html', ['EKODI Select', 'STORE COLLECTION']],
  ['products/reusable-daily-bottle/index.html', ['리유저블 데일리 보틀', 'PRODUCT PAGE', 'data-add-basket']],
  ['assets/commerce.js', ['ekodiMallInquiryBasketV1', 'data-basket-copy']],
  ['assets/seller.js', ['ekodiMallSellerStudioDraftV5', 'mall-seller', "plan: 'free'", 'product-link-reservation']],
  ['assets/seller-providers.css', ['seller-provider-tab', 'aria-selected']],
  ['provider-bookstore.json', ['"products"', 'bookstore-BOOK-EKODI']],
  ['assets/seller-provider-catalog.js', ['ekodiMallProviderCatalog', 'coupang_partners', 'readCatalogs', 'affiliateRows', 'bookstoreRows']],
  ['assets/seller-server.js', ['/ekodimall/api', '서버에 저장', '게시 · 링크 활성화', '/api/products', '/share-links', '/api/orders?limit=20', '/api/settlements', '직접링크 복사 · 7%', '일반 상품링크 · 8%']],
  ['assets/seller-readiness.js', ['DIRECT SALE READINESS', '/api/readiness', '/api/verification/seller/submit', '/verification/submit', 'payments-disabled', 'product-checkout-gate']],
  ['assets/seller-analytics.js', ['SELLER ANALYTICS', '/api/analytics/summary', 'PAID GROSS', 'first-touch', 'visitor ID']],
  ['assets/seller-storefronts.js', ['MY STOREFRONTS', '/api/storefronts', 'Store URL 복사', 'Mall 8%']],
  ['assets/analytics.css', ['analytics-product-row', 'analytics-period']],
  ['assets/public-product.js', ['api/public/products', 'api/public/attribution/visit', 'api/public/checkout/quote', 'ekodiMallAnonymousVisitorV1', 'SERVER QUOTE', '최초 유입은 7일간']],
  ['assets/shared-store.html', ['SELLER STOREFRONT', '/assets/public-store.js', '/assets/storefront.css']],
  ['assets/public-store.js', ['/api/public/stores/', 'Mall 8%', '/p/']],
  ['assets/storefront.css', ['storefront-public-hero', 'storefront-product']],
  ['assets/marketplace-live.js', ['api/public/products?', 'isSaleReady', 'dataset.serverProduct', 'data-filter', '상품 더 보기']],
  ['assets/free-ops.html', ['FREE · SAFE · MANUAL FIRST', '후보 저장 + 안전판단', '비밀정보 입력 금지', '/assets/free-ops.js']],
  ['assets/free-ops.js', ['ekodiMallFreeOpsDraftV1', '/api/internal/supplier-discovery/context', '/api/internal/supplier-candidates', '/assessment', '예상 손실']],
  ['assets/free-ops.css', ['free-flow', 'free-form', 'free-item', 'free-result']],
  ['assets/sourcing-lab.html', ['EKODI SOURCING LAB', 'Auto Source', 'Dry-run', '계약 공급자', '/assets/sourcing-lab.js']],
  ['assets/sourcing-lab.js', ['/api/sourcing/providers', '/api/sourcing/sources', '/plan', 'auction-reference', '자동발주 OFF']],
  ['assets/fulfillment-lab.js', ['/api/fulfillment', '배송정보 승인 대기', '공급자 전달']],
  ['assets/fulfillment-lab.html', ['배송·발주 관리', 'fulfillment-tabs', 'fulfillment-panel-orders', 'fulfillment-panel-stages', '/assets/fulfillment-layout.css']],
  ['assets/fulfillment-layout.css', ['fulfillment-summary', 'fulfillment-tabs', 'fulfillment-panel[hidden]', 'fulfillmentLogout']],
  ['assets/supplier-ops.html', ['SUPPLIER OPS', '공급처 운영 관리', 'ops-step-tabs', 'SKU → EKODI 상품 매핑', '/assets/supplier-ops.js']],
  ['assets/supplier-ops.js', ['/api/internal/supplier-pilot/context', '/create-source', '/verify-contract', '/products', 'Auto Order OFF']],
  ['assets/supplier-ops.css', ['ops-grid', 'ops-map-form', 'ops-table']],
  ['assets/supplier-ops-layout.css', ['ops-compact-title', 'ops-step-tabs', 'ops-step-panels', '#opsLogout[hidden]']],
  ['assets/verification-ops.html', ['SELLER VERIFICATION OPS', 'COMMERCE OS COCKPIT', 'commerceCockpit', 'PRODUCTION LAUNCH GATE', 'launchReadiness', 'verificationLogin', 'verificationQueue', 'approveVerification', '/assets/verification-ops.js']],
  ['assets/verification-ops.js', ['/api/internal/verification/queue', '/api/internal/verification/launch-readiness', '/api/internal/operations/cockpit', 'provider-adapter-not-implemented', 'legal-readiness-missing', '/readiness', '/review', '/checkout-gate', 'return_to']],
  ['assets/verification-ops.css', ['verify-layout', 'verify-queue', 'readiness-grid', 'commerce-cockpit', 'cockpit-summary', 'ops-exceptions']],
  ['assets/supplier-discovery.html', ['SUPPLIER DISCOVERY', '공급처 발굴 관리', 'discovery-tabs', '증거 기반 평가', 'PILOT PREFLIGHT', '/assets/supplier-discovery-layout.css', '/assets/supplier-discovery.js']],
  ['assets/supplier-discovery-layout.css', ['discovery-title', 'discovery-tabs', 'discovery-panels', '#discoveryLogout[hidden]']],
  ['assets/supplier-discovery.js', ['/api/internal/supplier-discovery/context', '/assessment', '/evidence', '/outreach-draft', '/api/internal/supplier-preflight', '자동 발송하지 않습니다']],
  ['assets/supplier-connectors.html', ['공급망 연결 관리', '도매매 · 도매꾹 공식 API', 'ORDER DRY-RUN', '/assets/supplier-connectors.js', '자동발주 OFF', 'authEvidence']],
  ['assets/supplier-connectors.js', ['/api/internal/connectors/domemae/readiness', '/api/internal/connectors/domemae/item-lookup', '/api/internal/connectors/domemae/order-dry-run', '실제 주문 API는 호출하지 않았습니다', 'authEvidence']],
  ['assets/supplier-connectors.css', ['connector-heading', 'connector-tablist', 'connector-credentials', 'connector-panel[hidden]']],
  ['assets/shared-product.html', ['PUBLIC PRODUCT', '/assets/public-product.js']],
  ['_redirects', ['/p/* /assets/shared-product 200', '/store/* /assets/shared-store 200', '/free-ops /assets/free-ops 200', '/sourcing /assets/sourcing-lab 200', '/fulfillment', '/supplier-ops /assets/supplier-ops 200', '/verification-ops /assets/verification-ops 200', '/supplier-discovery /assets/supplier-discovery 200', '/supplier-connectors /assets/supplier-connectors 200']],
  ['build-meta.json', ['"platformMode": "marketplace-v2"', paymentsMarker, '"commerceOsVersion": 1', '"paymentProviderAuthority": "server-capability-registry"', '"highImpactExecution": "human-gated"', '"affiliateExternalRouting": true']]
];
const errors = [];
// Agoda partner search is a disclosed external referral, not a verified hotel product.
const stayHub = await readFile(path.join(dist, 'travel/stay/index.html'), 'utf8');
const shoppingHub = await readFile(path.join(dist, 'coupang/index.html'), 'utf8');
if (!stayHub.includes('https://www.agoda.com/partners/partnersearch.aspx?pcs=1&amp;cid=1980072&amp;hl=ko-kr&amp;tag=ekodi_mall_stay') ||
    !stayHub.includes('아고다에서 숙소 찾기')) errors.push('Agoda stay hub missing owner-generated CID referral link');
if (shoppingHub.includes('cid=1980072') || shoppingHub.includes('tag=ekodi_mall_stay') || shoppingHub.includes('아고다에서 숙소 찾기'))
  errors.push('Agoda referral must not appear in Coupang hub');

for (const [relative, needles] of checks) {
  let content = '';
  try { content = await readFile(path.join(dist, relative), 'utf8'); } catch { errors.push(`${relative} is missing`); continue; }
  for (const needle of needles) if (!content.includes(needle)) errors.push(`${relative} is missing marker: ${needle}`);
  if (/\{\{[A-Z0-9_]+\}\}/.test(content)) errors.push(`${relative} contains unresolved template tokens`);
}
// Keep the customer purchase path ahead of editorial and AI storytelling after static rendering.
const homepage = await readFile(path.join(dist, 'index.html'), 'utf8');
const buyerOrder = ['class="mall-category-shortcuts"', 'class="shop" id="shop"', 'class="mall-editorial"', 'class="context-recommend"'];
const buyerPositions = buyerOrder.map((marker) => homepage.indexOf(marker));
if (buyerPositions.some((pos) => pos < 0) || buyerPositions.some((pos, index) => index > 0 && pos <= buyerPositions[index - 1])) {
  errors.push('Mall buyer-first homepage order drift: product grid must precede editorial and AI recommendations');
}
const homeCss = await readFile(path.join(dist, 'assets/home-refresh.css'), 'utf8');
if (!homeCss.includes('.mall-category-shortcuts{display:none}')) errors.push('Mall desktop duplicated category shortcuts must remain hidden');
const { isPublicStaticSale } = await import('../api/public-sale-visibility.js');
const originalItems = JSON.parse(await readFile(path.join(root, 'content/products.json'), 'utf8'));
for (const item of originalItems) {
  const marker = `data-product="${item.id}"`;
  if (!isPublicStaticSale(item) && homepage.includes(marker)) errors.push('Preparing product leaked into Mall public grid: ' + item.id);
  if (!isPublicStaticSale(item)) {
    const detail = await readFile(path.join(dist, 'products', item.slug, 'index.html'), 'utf8');
    if (!detail.includes('name="robots" content="noindex,follow"')) errors.push('Preparing product detail was not marked noindex: ' + item.id);
  }
}
const mirror = JSON.parse(await readFile(path.join(dist, 'provider-bookstore.json'), 'utf8'));
const directBook = mirror.products?.find((p) => p.bookId === 'BOOK-EKODI-000001');
if (!directBook?.slug) {
  errors.push('Direct bookstore edition missing from the publisher mirror');
} else {
  const detail = await readFile(path.join(dist, 'products', directBook.slug, 'index.html'), 'utf8');
  if (!detail.includes('data-bookstore-purchase-link href="https://ekodi.kr/books/book/?id=BOOK-EKODI-000001"') ||
      !detail.includes('data-bookstore-price>가격 확인 필요') ||
      !detail.includes('온라인 리더에서 열람') || detail.includes('/books/buy/')) {
    errors.push('Static bookstore detail must display an information link and defer purchase and price to the live quote');
  }
}
const approvedBook = mirror.products?.find((p) => p.bookId === 'BOOK-EKODI-000002');
if (!approvedBook?.slug || !/^book-[a-z0-9-]+$/.test(approvedBook.slug)) {
  errors.push('Existing approved bookstore edition missing from stable publisher mirror');
} else {
  const detail = await readFile(path.join(dist, 'products', approvedBook.slug, 'index.html'), 'utf8');
  if (!detail.includes('name="robots" content="index,follow,max-image-preview:large"') ||
      detail.includes('name="robots" content="noindex')) {
    errors.push('Public bookstore information page cannot inherit sale-status noindex');
  }
  if (!detail.includes('data-bookstore-book-id="BOOK-EKODI-000002"') ||
      !detail.includes('data-bookstore-purchase-link')) {
    errors.push('Public bookstore page missing live purchase verification anchors');
  }
}
const booksStore = await readFile(path.join(dist, 'stores', 'ekodi-books', 'index.html'), 'utf8');
for (const marker of ['data-bookstore-store="true"','data-bookstore-store-grid','data-bookstore-public-count','src="/assets/bookstore-live.js"']) {
  if (!booksStore.includes(marker)) errors.push('Bookstore live storefront is missing ' + marker);
}
const liveBridge = await readFile(path.join(dist, 'assets', 'bookstore-live.js'), 'utf8');
for (const marker of ['/books/api/commerce', '/public/approvals', '/quote?book=', 'checkout?.fileReady', "checkout?.mode === 'live'"]) {
  if (!liveBridge.includes(marker)) errors.push('Bookstore sale bridge lost verification gate: ' + marker);
}
if (!homepage.includes('src="/assets/bookstore-live.js"')) errors.push('Mall homepage missing bookstore approval bridge');
const publicSitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
if (approvedBook?.slug && !publicSitemap.includes('/products/' + approvedBook.slug + '/')) {
  errors.push('Public bookstore information page missing from sitemap');
}
for (const item of originalItems.filter((p) => !isPublicStaticSale(p))) {
  if (publicSitemap.includes('/products/' + item.slug + '/')) errors.push('Preparing product listed in sitemap: ' + item.id);
}

if (errors.length) {
  console.error(`EKODI Mall build verification failed (${errors.length})`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`EKODI Mall V3.3 build verified: Free Ops reuses the existing supplier safety API and D1 with no new paid service; payments ${site?.commerce?.paymentsEnabled === true ? 'enabled for human-gated direct sales' : 'disabled'}, while PII release, supplier forwarding and Auto Order remain disabled.`);
