import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  affiliate: '외부 제휴 예정',
  local: '지역상생 기획',
  content: '콘텐츠 상품',
  curation: '큐레이션 준비'
};

const [site, productsRaw, pages, storesRaw, indexTemplate, productTemplate, pageTemplate, storeTemplate, sellerTemplate] = await Promise.all([
  readJson('content/site.json'),
  readJson('content/products.json'),
  readJson('content/pages.json'),
  readJson('content/stores.json'),
  read('src/index.template.html'),
  read('src/product.template.html'),
  read('src/page.template.html'),
  read('src/store.template.html'),
  read('src/seller.template.html')
]);

const stores = storesRaw.filter((store) => store.published);
const storeMap = new Map(stores.map((store) => [store.id, store]));
const publishedStoreIds = new Set(stores.map((store) => store.id));
const products = productsRaw.filter((product) => product.published && publishedStoreIds.has(product.storeId));
const baseUrl = site.seo.baseUrl.replace(/\/$/, '');
const heroParts = site.hero.title.split('|');
const heroTitle = heroParts.length >= 3
  ? `${esc(heroParts[0])}<br><em>${esc(heroParts[1])}</em><br>${esc(heroParts.slice(2).join(''))}`
  : esc(site.hero.title);

const filters = site.categories.map((category, index) =>
  `<button class="${index === 0 ? 'active' : ''}" data-filter="${esc(category.id)}">${esc(category.label)}</button>`
).join('');

const productCards = products.map((product) => {
  const href = `/products/${product.slug}/`;
  const store = storeMap.get(product.storeId);
  const searchable = `${product.name} ${product.badge} ${product.description} ${product.status} ${store?.name || ''}`.toLowerCase();
  return `<article class="card" data-product="${esc(product.id)}" data-category="${esc(product.category)}" data-search="${esc(searchable)}" data-name="${esc(product.name)}" data-status="${esc(product.status)}" data-href="${href}"><div class="thumb ${esc(product.category)}"><span class="badge">${esc(product.badge)}</span><button class="heart" data-wish="${esc(product.id)}" aria-label="${esc(product.name)} 관심상품" aria-pressed="false">♡</button></div><div class="card-body"><p class="store-kicker"><a href="/stores/${esc(store.slug)}/">${esc(store.name)}</a></p><h3><a href="${href}">${esc(product.name)}</a></h3><p>${esc(product.description)}</p><div class="meta"><span class="status">${esc(product.status)}</span><a class="smallbtn" href="${href}">자세히</a></div></div></article>`;
}).join('');

const storeCards = stores.map((store) => {
  const href = `/stores/${store.slug}/`;
  const count = products.filter((product) => product.storeId === store.id).length;
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
  STORE_COUNT: stores.length,
  SELLER_STUDIO_HREF: esc(sellerStudioHref),
  LOCAL_EYEBROW: esc(site.local.eyebrow),
  LOCAL_TITLE: localTitle,
  LOCAL_DESCRIPTION: esc(site.local.description),
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
await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
await cp(path.join(root, '_headers'), path.join(dist, '_headers'));
await cp(path.join(root, '_redirects'), path.join(dist, '_redirects'));

for (const product of products) {
  const productUrl = `${baseUrl}/products/${product.slug}/`;
  const store = storeMap.get(product.storeId);
  const html = fill(productTemplate, {
    PRODUCT_NAME: esc(product.name),
    PRODUCT_DESCRIPTION: esc(product.description),
    PRODUCT_URL: esc(productUrl),
    PRODUCT_CATEGORY: esc(product.category),
    PRODUCT_BADGE: esc(product.badge),
    PRODUCT_STATUS: esc(product.status),
    SALE_TYPE_LABEL: esc(saleTypeLabels[product.saleType] || product.saleType || '준비 중'),
    PRICE_LABEL: esc(formatPrice(product.price)),
    ACTION_LABEL: esc(product.action?.label || '문의하기'),
    ACTION_URL: esc(product.action?.url || site.links.inquiry),
    STORE_NAME: esc(store.name),
    STORE_OPERATOR: esc(store.operator),
    STORE_STATUS: esc(store.status),
    STORE_URL: `/stores/${esc(store.slug)}/`,
    NOTICE: esc(site.notice)
  });
  await write(`products/${product.slug}/index.html`, html);
}

for (const store of stores) {
  const storeUrl = `${baseUrl}/stores/${store.slug}/`;
  const storeProducts = products.filter((product) => product.storeId === store.id);
  const cards = storeProducts.map((product) => {
    const href = `/products/${product.slug}/`;
    return `<article class="card"><div class="thumb ${esc(product.category)}"><span class="badge">${esc(product.badge)}</span></div><div class="card-body"><h3><a href="${href}">${esc(product.name)}</a></h3><p>${esc(product.description)}</p><div class="meta"><span class="status">${esc(product.status)}</span><a class="smallbtn" href="${href}">자세히</a></div></div></article>`;
  }).join('');
  const html = fill(storeTemplate, {
    STORE_NAME: esc(store.name),
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

const platformModules = (site.platform?.modules || []).map((module, index) =>
  `<article><span>${String(index + 1).padStart(2, '0')}</span><h3>${esc(module)}</h3><p>${index < 2 ? '플랫폼 기반 구조에 우선 포함합니다.' : '다음 단계에서 안전하게 연결합니다.'}</p></article>`
).join('');
const sellerHtml = fill(sellerTemplate, {
  PLATFORM_NAME: esc(site.platform?.name || 'EKODI Commerce Platform'),
  PLATFORM_MODULES: platformModules,
  INQUIRY_URL: esc(site.links.inquiry),
  NOTICE: esc(site.notice)
});
await write('seller/index.html', sellerHtml);

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
  ...stores.map((store) => `${baseUrl}/stores/${store.slug}/`),
  ...products.map((product) => `${baseUrl}/products/${product.slug}/`),
  ...(pages.policies || []).map((policy) => `${baseUrl}/pages/${policy.slug}/`)
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${esc(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
await write('sitemap.xml', sitemap);
await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
await write('build-meta.json', JSON.stringify({ version: site.version, stores: stores.length, products: products.length, policies: (pages.policies || []).length, platformMode: site.platform?.mode || 'unknown' }, null, 2));

console.log(`EKODI Commerce Platform built: ${stores.length} stores, ${products.length} products, ${(pages.policies || []).length} policy pages -> dist/`);
