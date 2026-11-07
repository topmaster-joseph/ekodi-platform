import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMallHeader } from '../../../mall-shared-header.js';
import { loadBookstoreProducts, mergeBookstoreProducts } from './bookstore-products.mjs';
import { isPublicStaticSale, isPublicIndexableProduct } from '../api/public-sale-visibility.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const readJson = async (relative) => JSON.parse(await read(relative));
const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const fill = (template, values) => Object.entries(values).reduce(
  (html, [key, value]) => html.replaceAll(`{{${key}}}`, String(value ?? '')),
  template
);
const ensureDir = (dir) => mkdir(dir, { recursive: true });
const write = async (relative, content) => {
  const target = path.join(dist, relative);
  await ensureDir(path.dirname(target));
  await writeFile(target, content, 'utf8');
};
const formatPrice = (price) => Number.isFinite(price) ? `${new Intl.NumberFormat('ko-KR').format(price)}원` : '가격 확정 전';
const saleTypeLabels = {
  direct: '에코디몰 직접판매',
  affiliate: '외부 제휴판매',
  inquiry: '상담·문의형',
  publisher: '에코디서점 발행 도서',
  local: '지역상생 기획',
  content: '콘텐츠 상품',
  curation: '큐레이션 준비'
};

const [site, productsRaw, pages, storesRaw, regionsConfig, affiliateHubsRaw, indexTemplate, productTemplate, pageTemplate, storeTemplate, sellerTemplate, checkoutTemplate, affiliateHubTemplate] = await Promise.all([
  readJson('content/site.json'),
  readJson('content/products.json'),
  readJson('content/pages.json'),
  readJson('content/stores.json'),
  readJson('content/regions.json'),
  readJson('content/affiliate-hubs.json'),
  read('src/index.template.html'),
  read('src/product.template.html'),
  read('src/page.template.html'),
  read('src/store.template.html'),
  read('src/seller.template.html'),
  read('src/checkout.template.html'),
  read('src/affiliate-hub.template.html')
]);

const stores = storesRaw.filter((store) => store.published);
const storeMap = new Map(stores.map((store) => [store.id, store]));
const publishedStoreIds = new Set(stores.map((store) => store.id));
const bookstoreMirror = await loadBookstoreProducts(root);
const products = mergeBookstoreProducts(productsRaw, bookstoreMirror).filter((product) => product.published && publishedStoreIds.has(product.storeId));
const saleProducts = products.filter(isPublicStaticSale);
const saleStores = stores.filter((store) => saleProducts.some((product) => product.storeId === store.id));
// Keep all published preparation records in the existing seller mirror and stable detail pages.
const affiliateHubs = affiliateHubsRaw.filter((hub) => hub.published);
const baseUrl = site.seo.baseUrl.replace(/\/$/, '');
const basketHref = site.platform?.basketHref || '/checkout/';
const regions = Array.isArray(regionsConfig?.regions) ? regionsConfig.regions : [];
const regionMap = new Map(regions.map((region) => [region.id, region]));
const regionOptions = regions.filter((region) => region.selectable).map((region) => `<option value="${esc(region.id)}" data-path="${esc((region.path || []).join(','))}" data-full-name="${esc(region.fullName || region.label)}">${esc(region.fullName || region.label)}</option>`).join('');
const heroParts = site.hero.title.split('|');
const heroTitle = heroParts.length >= 3
  ? `${esc(heroParts[0])}<br><em>${esc(heroParts[1])}</em><br>${esc(heroParts.slice(2).join(''))}`
  : esc(site.hero.title);

/** 목록용 한 줄 요약: 첫 문장, 최대 46자. 자세한 설명은 상세페이지에서 본다. */
export function shortSummary(text, max = 46) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const first = (clean.match(/^.+?[.!?。](?=\s|$)/) || [clean])[0];
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

function productCard(product, options = {}) {
  const href = `/products/${product.slug}/`;
  const store = storeMap.get(product.storeId);
  const region = product.region || {};
  const regionIds = Array.isArray(region.regionIds) ? region.regionIds.filter((id) => regionMap.has(id)) : [];
  const searchable = `${product.name} ${product.badge} ${product.description} ${product.status} ${store?.name || ''} ${region.label || ''}`.toLowerCase();
  const data = options.withData === false ? '' : ` data-product="${esc(product.id)}" data-category="${esc(product.category)}" data-region-ids="${esc(regionIds.join(','))}" data-primary-region="${esc(region.primaryRegionId || '')}" data-region-label="${esc(region.label || '')}" data-local-relationship="${esc(region.relationship || '')}" data-region-verified="${region.verified ? 'true' : 'false'}" data-search="${esc(searchable)}" data-name="${esc(product.name)}" data-status="${esc(product.status)}" data-href="${href}"`;
  // Static bookstore approval is not sufficient to advertise a live purchase;
  // verify the commerce quote in the browser before exposing the catalog card.
  const pendingQuote = options.withData !== false && product.source?.system === 'ekodi-bookstore'
    ? ' data-bookstore-quote-pending="true" hidden' : '';
  const regionChip = region.label ? `<p class="region-chip">지역 · ${esc(region.label)}${region.verified ? ' · 확인됨' : ''}</p>` : '';
  const heart = options.withHeart === false ? '' : `<button class="heart" data-wish="${esc(product.id)}" aria-label="${esc(product.name)} 관심상품" aria-pressed="false">♡</button>`;
  const storeKicker = store ? `<p class="store-kicker"><a href="/stores/${esc(store.slug)}/">${esc(store.name)}</a></p>` : '';
  // MALL-LIST-IMAGE-001: 대표이미지(도서 표지·판매자 사진)를 목록에 보이고, 이미지·제목 어디를 눌러도 상세로 간다.
  const image = product.image ? `<img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" decoding="async">` : '';
  return `<article class="card"${data}${pendingQuote}><div class="thumb ${esc(product.category)}${image ? ' has-image' : ''}"><a class="thumb-link" href="${href}" aria-label="${esc(product.name)} 자세히 보기">${image}</a><span class="badge">${esc(product.badge)}</span>${heart}</div><div class="card-body">${storeKicker}<h3><a href="${href}">${esc(product.name)}</a></h3><p class="card-summary">${esc(shortSummary(product.description, product.category === 'book' ? 34 : 46))}</p>${regionChip}<div class="meta"><span class="status">${product.category === 'book' ? esc(Number(product.price) > 0 ? formatPrice(Number(product.price)) + ' · ' : '가격 확인 · ') : ''}${esc(product.status)}</span><a class="smallbtn" href="${href}">자세히</a></div></div></article>`;
}

function productDetailSections(product, store, requiresLiveQuote) {
  const saleLabel = saleTypeLabels[product.saleType] || product.saleType || '준비 중';
  const statusText = requiresLiveQuote ? '에코디서점에서 판매 상태를 확인할 수 있습니다.' : `${product.status}. ${store.name}에서 운영·검토하는 상품입니다.`;
  const transactionText = product.saleType === 'publisher'
    ? (product.action?.type === 'external' ? '에코디서점이 직접 발행한 도서입니다. 구매 버튼을 누르면 공식 전자책 판매처로 이동해 구매합니다.' : '에코디서점이 직접 발행한 도서입니다. 판매처 등록이 끝나면 이곳에서 바로 구매하실 수 있습니다.')
    : product.saleType === 'affiliate'
    ? '구매 버튼을 누르면 외부 제휴 판매처로 이동하며 주문·결제·배송·반품은 해당 판매처에서 처리합니다.'
    : product.saleType === 'direct'
      ? '직접판매 상품은 판매자 확인과 주문·결제·정산 연결이 완료된 뒤 에코디몰에서 거래됩니다.'
      : '현재는 상품 문의와 상담을 중심으로 거래를 준비합니다.';
  const sections = [
    { label: 'PURPOSE', title: '무엇을 제안하나요', body: product.description },
    ...(product.region?.label ? [{ label: 'LOCAL', title: '어느 지역과 연결되나요', body: `${product.region.label}${product.region.verified ? ' · 지역 연결 확인됨' : ' · 지역 연결 확인 필요'}` }] : []),
    { label: 'STATUS', title: '지금 어디까지 준비됐나요', body: statusText },
    { label: 'COMMERCE', title: '어떻게 거래되나요', body: requiresLiveQuote ? '판매 상태와 가격은 에코디서점에서 확인할 수 있습니다.' : `${saleLabel}. ${transactionText} ${Number.isFinite(product.price) ? `현재 표시 가격은 ${formatPrice(product.price)}입니다.` : '가격과 최종 판매 조건은 아직 확정되지 않았습니다.'}` }
  ];

  const highlights = Array.isArray(product.detail?.highlights) ? product.detail.highlights : [];
  highlights.slice(0, 4).forEach((highlight) => {
    if (typeof highlight === 'string') sections.push({ label: 'HIGHLIGHT', title: '상품 포인트', body: highlight });
    else if (highlight?.title && highlight?.body) sections.push({ label: 'HIGHLIGHT', title: highlight.title, body: highlight.body });
  });
  if (product.detail?.story) sections.push({ label: 'STORY', title: product.detail.story.title || '상품 뒤의 이야기', body: product.detail.story.body || '' });
  if (product.detail?.fulfillment) sections.push({ label: 'FULFILLMENT', title: '받는 방법', body: product.detail.fulfillment });

  return sections
    .filter((section) => section.body)
    .map((section) => `<article class="product-info-block"><small>${esc(section.label)}</small><h3>${esc(section.title)}</h3><p>${esc(section.body)}</p></article>`)
    .join('');
}

const categoryFilters = site.categories.map((category, index) =>
  `<button class="${index === 0 ? 'active' : ''}" data-filter="${esc(category.id)}">${esc(category.label)}</button>`
).join('');
const filters = `${categoryFilters}<button data-filter="local" data-filter-kind="region">${esc(site.local?.filterLabel || '내 로컬')}</button>`;

const productCards = saleProducts.map((product) => productCard(product)).join('');

const storeCards = saleStores.map((store) => {
  const href = `/stores/${store.slug}/`;
  const count = saleProducts.filter((product) => product.storeId === store.id).length;
  return `<a class="store-card" href="${href}"><div class="store-card-mark">${esc(store.name.slice(0, 1))}</div><div><p class="store-badge">${esc(store.badge || store.kind)}</p><h3>${esc(store.name)}</h3><p>${esc(store.description)}</p><span>${count}개 상품 · ${esc(store.status)}</span></div></a>`;
}).join('');

const standards = site.standards.map((item) =>
  `<article><span>${esc(item.number)}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`
).join('');

const journal = (pages.journal || []).map((item) =>
  `<article><small>${esc(item.status || 'JOURNAL')}</small><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p></article>`
).join('');

const policies = (pages.policies || []).map((policy) =>
  `<a class="policy" href="/pages/${esc(policy.slug)}/"><h3>${esc(policy.title)}</h3><p>${esc(policy.summary)}</p></a>`
).join('');

const footerPolicyLinks = (pages.policies || []).map((policy) =>
  `<p><a href="/pages/${esc(policy.slug)}/">${esc(policy.title)}</a></p>`
).join('');

const business = site.business || {};
const businessCore = `<p><strong>상호</strong> ${esc(business.name || '')} &nbsp; <strong>대표</strong> ${esc(business.representative || '')}</p>`;
const legalFieldsComplete = business.registrationNumber && business.commerceRegistrationNumber && business.address && business.customerService;
const businessInfo = legalFieldsComplete
  ? `${businessCore}<p><strong>사업자등록번호</strong> ${esc(business.registrationNumber)} &nbsp; <strong>통신판매업 신고번호</strong> ${esc(business.commerceRegistrationNumber)}</p><p>${esc(business.address)} · ${esc(business.customerService)}${business.email ? ` · ${esc(business.email)}` : ''}</p>`
  : `${businessCore}<p>정식 결제 오픈 전 사업자등록번호, 통신판매업 신고번호, 사업장 주소와 고객센터 정보를 등록합니다.</p>`;

const localTitle = site.local.title.split('|').map(esc).join('<br>');
const sellerStudioHref = site.platform?.sellerStudioHref || '/seller/';
const indexHtml = fill(indexTemplate, {
  MALL_HEADER: renderMallHeader({ home: true, sellerHref: sellerStudioHref }),
  SEO_TITLE: esc(site.seo.title),
  SEO_DESCRIPTION: esc(site.seo.description),
  BASE_URL: esc(baseUrl),
  NOTICE: esc(site.notice),
  HERO_EYEBROW: esc(site.hero.eyebrow),
  HERO_TITLE: heroTitle,
  HERO_DESCRIPTION: esc(site.hero.description),
  HERO_PRIMARY_LABEL: esc(site.hero.primaryLabel),
  HERO_PRIMARY_HREF: esc(site.hero.primaryHref),
  HERO_SECONDARY_LABEL: esc(site.hero.secondaryLabel),
  HERO_SECONDARY_HREF: esc(site.hero.secondaryHref),
  FILTERS: filters,
  PRODUCTS: productCards,
  STORES: storeCards,
  STORE_COUNT: saleStores.length,
  SELLER_STUDIO_HREF: esc(sellerStudioHref),
  BASKET_HREF: esc(basketHref),
  LOCAL_EYEBROW: esc(site.local.eyebrow),
  LOCAL_TITLE: localTitle,
  LOCAL_DESCRIPTION: esc(site.local.description),
  LOCAL_SELECTION_TITLE: esc(site.local.selectionTitle || '내 로컬을 직접 선택하세요'),
  LOCAL_SELECTION_DESCRIPTION: esc(site.local.selectionDescription || ''),
  LOCAL_PRIVACY_NOTE: esc(site.local.privacyNote || ''),
  REGION_OPTIONS: regionOptions,
  STANDARDS: standards,
  JOURNAL: journal,
  POLICIES: policies,
  INQUIRY_URL: esc(site.links.inquiry),
  TAGLINE: esc(site.brand.tagline),
  FOOTER_POLICY_LINKS: footerPolicyLinks,
  BUSINESS_INFO: businessInfo,
  BETA_MESSAGE: esc(site.commerce.betaMessage)
});

await rm(dist, { recursive: true, force: true });
await ensureDir(dist);
await write('index.html', indexHtml);
await write('category-availability.json', JSON.stringify({
  // Matches the source-of-truth sale-ready projection, not all draft categories.
  categories: [...new Set(saleProducts.map(product => product.category).filter(Boolean))].sort(),
  hasLocal: saleProducts.some(product => Array.isArray(product.region?.regionIds) && product.region.regionIds.length > 0)
}));

// Operator Seller Studio displays the same publisher-approved bookstore mirror
// as the Mall storefront. This read-only public projection is not a seller row.
await write('provider-bookstore.json', JSON.stringify({
  products: products.filter((p) => p.source?.system === 'ekodi-bookstore').map((p) => ({
    id: p.id, bookId: p.source.bookId, slug: p.slug, name: p.name, price: p.price,
    image: p.image || '', description: p.description || '',
    detailUrl: p.source.detailUrl,
    saleReady: p.action?.type === 'external' && p.status === '판매 중'
  }))
}));

await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
await cp(path.join(root, '_headers'), path.join(dist, '_headers'));
await cp(path.join(root, '_redirects'), path.join(dist, '_redirects'));

for (const product of products) {
  const productUrl = `${baseUrl}/products/${product.slug}/`;
  const store = storeMap.get(product.storeId);
  const isAffiliate = product.saleType === 'affiliate';
  const isBookstoreBook = product.source?.system === 'ekodi-bookstore';
  const isPublisherSale = product.saleType === 'publisher' && product.action?.type === 'external';
  const isDirectPublisherSale = isPublisherSale && /^https:\/\/ekodi\.kr\/books\/buy\//.test(product.action?.url || '');
  const requiresLiveQuote = isBookstoreBook && (!isPublisherSale || isDirectPublisherSale);
  const related = saleProducts
    .filter((item) => item.id !== product.id)
    .sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category))
    .slice(0, 3)
    .map((item) => productCard(item, { withData: false, withHeart: false }))
    .join('');
  const basketAction = site.commerce?.inquiryBasketEnabled && !isAffiliate && product.saleType !== 'publisher'
    ? `<button class="btn primary" type="button" data-add-basket data-product-id="${esc(product.id)}" data-product-name="${esc(product.name)}" data-store-name="${esc(store.name)}" data-product-status="${esc(product.status)}" data-product-href="/products/${esc(product.slug)}/">${site.commerce.paymentsEnabled && Number.isFinite(product.price) ? '구매목록에 담기' : '상담목록에 담기'}</button>`
    : '';
  const transactionNote = requiresLiveQuote
    ? '구매 가능 여부를 에코디서점에서 확인할 수 있습니다. 에코디서점에서 구매한 전자책은 로그인 후 내 서재의 온라인 리더에서 열람합니다.'
    : product.saleType === 'publisher'
    ? (isDirectPublisherSale ? '에코디서점에서 구매한 전자책은 로그인 후 내 서재의 온라인 리더에서 열람합니다.' : isPublisherSale ? '에코디서점 발행 도서입니다. 외부 공식 판매처를 이용하는 경우 결제와 다운로드는 그 판매처에서 처리합니다.' : '에코디서점이 발행한 도서입니다. 판매 준비가 완료되면 구매 버튼이 열립니다. 도서 정보를 먼저 확인할 수 있습니다.')
    : isAffiliate
    ? '이 상품은 외부 제휴 판매처에서 구매합니다. 구매 버튼을 누르면 제휴 링크로 이동하며, 에코디는 제휴 활동을 통해 일정 수수료를 제공받을 수 있습니다. 주문·결제·배송·반품은 해당 판매처에서 처리합니다.'
    : product.saleType === 'direct'
      ? '직접판매 상품은 판매자 확인과 결제·주문·정산 시스템 검증 후 에코디몰 결제를 활성화합니다. 현재 판매 준비 상태를 확인해 주세요.'
      : '에코디몰은 상품과 스토어의 관계, 판매 준비 상태를 분리 표시합니다. 가격과 판매 조건이 확정되지 않은 상품은 결제 가능한 상품처럼 표시하지 않습니다.';
  // Preserve the full indexed title while keeping the visible book heading readable.
  const hasBookSubtitle = product.category === 'book' && product.name.includes(' — ');
  const [productHeading, ...subtitleParts] = hasBookSubtitle ? product.name.split(' — ') : [product.name];
  const productSubtitle = subtitleParts.join(' — ');
  const html = fill(productTemplate, {
    PRODUCT_NAME: esc(product.name),
    PRODUCT_HEADING: esc(productHeading),
    PRODUCT_SUBTITLE: productSubtitle ? `<p class="detail-subtitle">${esc(productSubtitle)}</p>` : '',
    PRODUCT_DESCRIPTION: esc(product.description),
    PRODUCT_URL: esc(productUrl),
    ROBOTS_DIRECTIVE: isPublicIndexableProduct(product) ? 'index,follow,max-image-preview:large' : 'noindex,follow',
    BOOK_SOURCE_ATTR: isBookstoreBook ? `data-bookstore-book-id="${esc(product.source.bookId)}"` : '',
    BOOK_STATUS_ATTR: isBookstoreBook ? 'data-bookstore-sale-status' : '',
    BOOK_PRICE_ATTR: requiresLiveQuote ? 'data-bookstore-price' : '',
    BOOK_ACTION_ATTR: isBookstoreBook ? 'data-bookstore-purchase-link' : '',
    BOOK_TRANSACTION_ATTR: isBookstoreBook ? 'data-bookstore-transaction-note' : '',
    BOOKSTORE_LIVE_SCRIPT: isBookstoreBook ? '<script src="/assets/bookstore-live.js" defer></script>' : '',
    PRODUCT_CATEGORY: esc(product.category),
    PRODUCT_BADGE: esc(product.badge),
    PRODUCT_STATUS: esc(requiresLiveQuote ? '판매 상태 확인 필요' : product.status),
    SALE_TYPE_LABEL: esc(saleTypeLabels[product.saleType] || product.saleType || '준비 중'),
    PRICE_LABEL: esc(requiresLiveQuote ? '가격 확인 필요' : formatPrice(product.price)),
    ACTION_LABEL: esc(requiresLiveQuote ? '에코디서점에서 상태 확인' : product.action?.label || (isAffiliate ? '외부 판매처에서 구매' : '문의하기')),
    ACTION_URL: esc(requiresLiveQuote ? `https://ekodi.kr/books/book/?id=${encodeURIComponent(product.source.bookId)}` : product.action?.url || site.links.inquiry),
    ACTION_CLASS: !requiresLiveQuote && (isAffiliate || isPublisherSale) ? 'primary' : 'ghost',
    DETAIL_ART_CLASS: product.image ? ' has-image' : '',
    DETAIL_ART_IMAGE: product.image ? `<img src="${esc(product.image)}" alt="${esc(product.name)} 표지" loading="eager" decoding="async">` : '',
    ACTION_REL: product.saleType === 'publisher' ? 'noopener' : 'noopener sponsored',
    TRANSACTION_NOTE: esc(transactionNote),
    STORE_NAME: esc(store.name),
    STORE_OPERATOR: esc(store.operator),
    STORE_STATUS: esc(store.status),
    STORE_URL: `/stores/${esc(store.slug)}/`,
    BASKET_ACTION: basketAction,
    PRODUCT_DETAIL_SECTIONS: productDetailSections(product, store, requiresLiveQuote),
    RELATED_PRODUCTS: related || '<p class="empty">함께 볼 다른 상품을 준비 중입니다.</p>',
    NOTICE: esc(site.notice)
  });
  // Public bookstore titles remain searchable as *information* even when the
  // static catalogue predates a valid, file-bound runtime publishing approval.
  // Checkout remains guarded by the bookstore API and is never inferred from SEO.
  await write(`products/${product.slug}/index.html`, html);
}

for (const store of stores) {
  const storeUrl = `${baseUrl}/stores/${store.slug}/`;
  const storeProducts = saleProducts.filter((product) => product.storeId === store.id);
  const cards = storeProducts.map((product) => productCard(product, { withData: false, withHeart: false })).join('');
  const html = fill(storeTemplate, {
    STORE_NAME: esc(store.name),
    STORE_BOOKS_ATTR: store.id === 'store-ekodi-books' ? 'data-bookstore-store="true"' : '',
    STORE_STATUS_ATTR: store.id === 'store-ekodi-books' ? 'data-bookstore-store-status' : '',
    STORE_COUNT_ATTR: store.id === 'store-ekodi-books' ? 'data-bookstore-public-count' : '',
    STORE_BOOK_GRID_ATTR: store.id === 'store-ekodi-books' ? 'data-bookstore-store-grid' : '',
    STORE_BOOKS_SCRIPT: store.id === 'store-ekodi-books' ? '<script src="/assets/bookstore-live.js" defer></script>' : '',
    STORE_DESCRIPTION: esc(store.description),
    STORE_URL: esc(storeUrl),
    STORE_BADGE: esc(store.badge || store.kind),
    STORE_STATUS: esc(store.status),
    STORE_OPERATOR: esc(store.operator),
    STORE_PRODUCTS: cards || '<p class="empty">현재 공개된 상품이 없습니다.</p>',
    STORE_PRODUCT_COUNT: storeProducts.length,
    STORE_CONTACT_URL: esc(store.contactUrl || site.links.inquiry),
    NOTICE: esc(site.notice)
  });
  await write(`stores/${store.slug}/index.html`, html);
}

const moduleDescriptions = {
  'Store': '스토어별 운영 주체와 상품 소유 관계를 분리합니다.',
  'Product Studio': '판매자가 상품 정보를 구조화하고 콘텐츠 초안을 만듭니다.',
  'Affiliate Routing': '제휴상품은 에코디 결제 없이 등록된 외부 제휴링크로 안전하게 이동합니다.',
  'Inquiry Basket': '결제 전에 여러 상품 상담 목록을 안전하게 정리합니다.',
  'Orders': 'Mall 전용 주문 API가 준비되면 연결합니다.',
  'CRM': '고객 동의를 전제로 관계·재구매 흐름을 연결합니다.',
  'Marketing AI': '상품 데이터를 마케팅 콘텐츠 생성 입력으로 재사용합니다.',
  'Settlement': '실제 결제 계약과 정산 규칙 확정 후 Finance API로 연결합니다.'
};
const platformModules = (site.platform?.modules || []).map((module, index) =>
  `<article><span>${String(index + 1).padStart(2, '0')}</span><h3>${esc(module)}</h3><p>${esc(moduleDescriptions[module] || '독립 모듈로 연결합니다.')}</p></article>`
).join('');
const sellerHtml = fill(sellerTemplate, {
  PLATFORM_NAME: esc(site.platform?.name || 'EKODI Commerce Platform'),
  REGION_OPTIONS: regionOptions,
  PLATFORM_MODULES: platformModules,
  INQUIRY_URL: esc(site.links.inquiry),
  NOTICE: esc(site.notice)
});
await write('seller/index.html', sellerHtml);

const checkoutHtml = fill(checkoutTemplate, {
  BASKET_LABEL: esc(site.commerce?.basketLabel || '상담 바구니'),
  BASKET_MESSAGE: esc(site.commerce?.betaMessage || '상품 상담 준비를 위한 목록입니다.'),
  ORDER_MODE_LABEL: site.commerce?.orderMode === 'inquiry-only' ? '상담 준비 모드' : '주문 준비 모드',
  CHECKOUT_LABEL: esc(site.commerce?.checkoutLabel || '상담 요청 준비'),
  INQUIRY_URL: esc(site.links.inquiry),
  BETA_MESSAGE: esc(site.commerce?.betaMessage || ''),
  PAYMENT_STATUS: site.commerce?.paymentsEnabled ? '결제 게이트웨이 연결 상태를 확인해 주세요.' : '온라인 결제 비활성',
  NOTICE: esc(site.notice)
});
await write('checkout/index.html', checkoutHtml);

for (const hub of affiliateHubs) {
  const hubPath = hub.path || hub.id;
  const pageUrl = `${baseUrl}/${hubPath}/`;
  const html = fill(affiliateHubTemplate, {
    MALL_HEADER: renderMallHeader({ home: false, sellerHref: sellerStudioHref }),
    NAME: esc(hub.name),
    EYEBROW: esc(hub.eyebrow),
    TITLE: esc(hub.title),
    DESCRIPTION: esc(hub.description),
    PROMPT: esc(hub.prompt),
    PROVIDER_KEYS: esc((hub.providerKeys || []).join(',')),
    MODE: esc(hub.mode || 'shopping'),
    SEARCH_LABEL: esc(hub.searchLabel || '찾는 조건을 입력하세요'),
    SEARCH_BUTTON: hub.mode === 'stay' ? '숙소 검색' : '상품 검색',
    RESULTS_EYEBROW: esc(hub.resultsEyebrow || 'AFFILIATE RECOMMENDATIONS'),
    RESULTS_TITLE: esc(hub.resultsTitle || '추천'),
    RESULTS_INTRO: esc(hub.resultsIntro || '현재 연결된 제휴망에서 조건에 맞는 후보를 확인합니다.'),
    LOADING_LABEL: esc(hub.loadingLabel || '후보를 불러오고 있습니다.'),
    DISCLOSURE: esc(hub.disclosure),
    PAGE_URL: esc(pageUrl),
    NOTICE: esc(site.notice)
  });
  await write(`${hubPath}/index.html`, html);
}

for (const policy of pages.policies || []) {
  const pageUrl = `${baseUrl}/pages/${policy.slug}/`;
  const body = policy.body.map((paragraph) => `<div class="body-block"><p>${esc(paragraph)}</p></div>`).join('');
  const action = policy.action ? `<a class="btn primary" href="${esc(policy.action.url)}" target="_blank" rel="noopener">${esc(policy.action.label)}</a>` : '';
  const html = fill(pageTemplate, {
    PAGE_TITLE: esc(policy.title),
    PAGE_SUMMARY: esc(policy.summary),
    PAGE_URL: esc(pageUrl),
    PAGE_BODY: body,
    PAGE_ACTION: action,
    NOTICE: esc(site.notice)
  });
  await write(`pages/${policy.slug}/index.html`, html);
}

const urls = [
  `${baseUrl}/`,
  ...saleStores.map((store) => `${baseUrl}/stores/${store.slug}/`),
  ...products.filter(isPublicIndexableProduct).map((product) => `${baseUrl}/products/${product.slug}/`),
  ...(pages.policies || []).map((policy) => `${baseUrl}/pages/${policy.slug}/`),
  ...affiliateHubs.map((hub) => `${baseUrl}/${hub.path || hub.id}/`),
  // Server-rendered weekly picks (site-worker, ekodi.kr/ekodimall/picks)
  `${baseUrl}/picks`
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${esc(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
await write('sitemap.xml', sitemap);
await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
await write('build-meta.json', JSON.stringify({
  version: site.version,
  stores: stores.length,
  products: products.length,
  publiclyListedProducts: saleProducts.length,
  publiclyIndexableProductPages: products.filter(isPublicIndexableProduct).length,
  temporarilyHiddenProducts: products.length - saleProducts.length,
  policies: (pages.policies || []).length,
  affiliateHubs: affiliateHubs.length,
  platformMode: site.platform?.mode || 'unknown',
  inquiryBasket: Boolean(site.commerce?.inquiryBasketEnabled),
  paymentsEnabled: Boolean(site.commerce?.paymentsEnabled),
  commerceOsVersion: site.commerce?.orchestrationMode === 'commerce-os-v1' ? 1 : 0,
  paymentProviderAuthority: site.commerce?.paymentProviderAuthority || 'unknown',
  highImpactExecution: site.commerce?.highImpactExecution || 'unknown',
  affiliateExternalRouting: site.platform?.sellerPolicy?.affiliateRouting === 'external'
}, null, 2));

console.log(`EKODI Commerce Platform built: ${stores.length} stores, ${products.length} products, Commerce OS + Seller Studio + affiliate routing + inquiry basket -> dist/`);
