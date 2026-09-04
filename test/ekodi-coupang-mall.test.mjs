import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import siteWorker from '../site-worker.js';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [api, automation, router, html, js, css, migration, registryText] = await Promise.all([
  read('affiliate-control.js'),
  read('coupang-partners-automation.js'),
  read('site-worker.js'),
  read('mall.html'),
  read('mall.js'),
  read('mall.css'),
  read('migrations/0047_ekodi_mall_auto_products.sql'),
  read('config/ecosystem-services.json'),
]);
const registry = JSON.parse(registryText);
const [offerRegistry, offerControl, offerSources, offerMigration, entryWorker, marketplace, multiMigration, marketingAdmin] = await Promise.all([
  read('offer-registry.js'),
  read('offer-registry-control.js'),
  read('offer-registry-sources.js'),
  read('migrations/0056_ekodi_offer_registry.sql'),
  read('customer-entry-worker.js'),
  read('affiliate-marketplace.js'),
  read('migrations/0057_affiliate_multi_provider_clicks.sql'),
  read('marketing-funnel-admin.js'),
]);

test('EKODI Mall remains a root storefront separate from shared Shop platform', () => {
  const mall = registry.services.find(service => service.id === 'mall');
  const shop = registry.services.find(service => service.id === 'shop');
  assert.equal(mall.url, 'https://ekodi.kr/ekodibiz/mall');
  assert.equal(mall.status, 'live');
  assert.equal(shop.url, 'https://shop.ekodi.kr');
  assert.equal(shop.status, 'planned');
  assert.equal(shop.homepage, false);
});

test('public storefront reads as a normal shopping mall', () => {
  assert.match(html, /EKODI MALL/);
  assert.match(html, /SMART SHOPPING/);
  assert.match(html, /오늘 필요한 것/);
  assert.match(html, /오늘의 상품/);
  assert.match(html, /상황에 맞는 선물 찾기/);
  assert.match(html, /새 상품을 준비하고 있습니다/);
  assert.doesNotMatch(html, /COUPANG AFFILIATE CURATION/);
  assert.doesNotMatch(html, /추천링크 클릭 후 검색하세요/);
  assert.doesNotMatch(html, /에코디 추천상품/);
});

test('official storefront canonical is ekodi.kr/ekodibiz/mall', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/ekodibiz\/mall">/);
});

test('legacy /mall redirects safely to the canonical EKODIBIZ storefront', async () => {
  const response = await siteWorker.fetch(new Request('https://ekodi.kr/mall?source=legacy'), {});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://ekodi.kr/ekodibiz/mall?source=legacy');
  assert.equal(response.headers.get('x-ekodi-route'), 'mall-legacy-canonical-redirect');
});

test('affiliate and seller disclosures are centered inside the header and absent from footer', () => {
  const headerIndex = html.indexOf('<header class="site-header">');
  const noticeIndex = html.indexOf('class="header-notice"');
  const headerEnd = html.indexOf('</header>');
  const catalogIndex = html.indexOf('class="catalog"');
  const footerIndex = html.indexOf('<footer>');
  assert.ok(headerIndex >= 0 && headerIndex < noticeIndex);
  assert.ok(noticeIndex > headerIndex && noticeIndex < headerEnd);
  assert.ok(headerEnd < catalogIndex && catalogIndex < footerIndex);
  assert.match(html, /상품의 판매·주문·결제·배송·교환·환불은 연결된 판매처의 정책에 따릅니다\./);
  assert.match(html, /쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다\./);
  const footer = html.slice(footerIndex, html.indexOf('</footer>') + '</footer>'.length);
  assert.doesNotMatch(footer, /쿠팡 파트너스 활동의 일환으로/);
  assert.doesNotMatch(footer, /판매·주문·결제·배송·교환·환불/);
  assert.match(css, /\.header-notice\{[^}]*text-align:center/);
  assert.match(css, /footer\{[^}]*text-align:center/);
});

test('product cards open basic information before outbound purchase', () => {
  assert.match(js, /priceKrw/);
  assert.match(js, /imageUrl/);
  assert.match(js, /isRocket/);
  assert.match(js, /isFreeShipping/);
  assert.match(js, /product-media-trigger/);
  assert.match(js, /openProductDialog/);
  assert.match(js, /상품정보 보기/);
  assert.match(html, /id="productDialog"/);
  assert.match(html, /id="productDialogBuy"/);
  assert.match(html, />구매하기<\/a>/);
  assert.match(html, /rel="sponsored noopener noreferrer"/);
  assert.match(js, /dialogBuy\.href = product\.clickUrl/);
  assert.match(js, /FileReader/);
  assert.match(css, /product-media/);
  assert.match(css, /product-dialog/);
  assert.match(css, /grid-template-columns:repeat\(4/);
});

test('catalog supports registered popularity and price sorting', () => {
  assert.match(html, /<option value="registered">등록순<\/option>/);
  assert.match(html, /<option value="popular">인기순<\/option>/);
  assert.match(html, /<option value="price-asc">가격 낮은순<\/option>/);
  assert.match(html, /<option value="price-desc">가격 높은순<\/option>/);
  assert.match(js, /selectedAt/);
  assert.match(js, /popularityRank/);
  assert.match(js, /sortProducts/);
  assert.match(js, /state\.sort/);
  assert.match(css, /\.sort-box select/);
});

test('contextual Gift AI ranks only live affiliate catalog products', () => {
  assert.match(html, /id="gift-ai"/);
  assert.match(js, /GIFT_DIRECT_TERMS/);
  assert.match(js, /pickGiftRecommendations/);
  assert.match(js, /searchParams\.get\('gift'\)/);
  assert.match(js, /dialogBuy\.href = product\.clickUrl/);
  assert.doesNotMatch(js, /https:\/\/link\.coupang\.com/);
});

test('mall has no fake or generic fallback products', () => {
  assert.doesNotMatch(js, /FALLBACK_PRODUCTS/);
  assert.doesNotMatch(js, /cwWXWm/);
  assert.doesNotMatch(api, /cwWXWm/);
  assert.doesNotMatch(api, /DEFAULT_AFFILIATE_URL/);
  assert.match(js, /state\.products = \[\]/);
});

test('automatic product search and partner link issuance are connected', () => {
  assert.match(automation, /TARGET_PRODUCTS = 24/);
  assert.match(automation, /searchSeed/);
  assert.match(automation, /issuePartnerLinks/);
  assert.match(automation, /createOpenAiProvider/);
  assert.match(automation, /balancedRules/);
  assert.match(automation, /GIFT_SEEDS/);
  assert.match(automation, /\uD64D\uC0BC \uC120\uBB3C\uC138\uD2B8/);
  assert.match(automation, /expectedKeywords/);
  assert.match(api, /runAffiliateAutomation/);
  assert.match(api, /public-empty/);
  assert.match(api, /public-stale/);
});

test('on-demand ingest adds requested products without replacing the batch catalog', () => {
  assert.match(automation, /ingestAffiliateProductsOnDemand/);
  assert.match(automation, /selectionSource: 'on-demand'/);
  assert.match(automation, /ON_DEMAND_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(automation, /selection_source <> 'on-demand'/);
  const start = automation.indexOf('export async function ingestAffiliateProductsOnDemand');
  const end = automation.indexOf('export const AFFILIATE_AUTOMATION_DEFAULTS', start);
  const onDemand = automation.slice(start, end);
  assert.doesNotMatch(onDemand, /UPDATE affiliate_storefront_products SET status = 'inactive'/);
  const authIndex = api.indexOf('const auth = await sessionCheck');
  const ingestIndex = api.indexOf("path === `${PREFIX}/ingest`");
  assert.ok(ingestIndex > authIndex);
  assert.match(api, /publicProductView/);
  assert.match(api, /affiliate\.product\.ingest/);
});

test('Mall products project into a provider-neutral EKODI Offer Registry', () => {
  assert.match(offerRegistry, /'product', 'service', 'program', 'provider', 'common_service'/);
  assert.match(offerRegistry, /affiliateProductOffer/);
  assert.match(offerRegistry, /upsertOffer/);
  assert.match(offerRegistry, /listPublicOffers/);
  assert.match(offerRegistry, /mall\?product=/);
  assert.match(js, /searchParams\.get\('product'\)/);
  assert.match(automation, /upsertOffer\(env\.DB, offer\)/);
  assert.match(automation, /UPDATE ekodi_offers SET status = 'inactive'/);
  for (const field of ['offer_type', 'owner_type', 'source_provider', 'source_id', 'canonical_url', 'discovery_keywords_json']) {
    assert.match(offerMigration, new RegExp(field));
  }
});

test('Offer discovery bootstraps the existing Mall catalog without remote provider search', () => {
  assert.match(automation, /bootstrapAffiliateOffersFromCatalog/);
  assert.match(automation, /LEFT JOIN ekodi_offers/);
  assert.match(automation, /p\.status = 'active' AND o\.offer_id IS NULL/);
  const start = automation.indexOf('export async function bootstrapAffiliateOffersFromCatalog');
  const end = automation.indexOf('export async function ingestAffiliateProductsOnDemand', start);
  const bootstrap = automation.slice(start, end);
  assert.doesNotMatch(bootstrap, /searchSeed\(/);
  assert.doesNotMatch(bootstrap, /coupangRequest\(/);
  assert.match(bootstrap, /NOT EXISTS/);
  assert.match(offerSources, /bootstrapAffiliateOffersFromCatalog/);
  assert.match(offerSources, /offerType === 'product'/);
  assert.match(offerControl, /bootstrapOfferSources/);
  assert.match(offerControl, /sourceProvider/);
  assert.match(offerControl, /searchParams\.get\('provider'\)/);
  assert.match(offerControl, /searchParams\.get\('kind'\)/);
  assert.match(offerRegistry, /source_provider = \?/);
});
test('multi-provider affiliate products can be registered, displayed and click-tracked', () => {
  assert.match(marketplace, /registerMarketplaceProduct/);
  assert.match(marketplace, /INSERT INTO affiliate_providers/);
  assert.match(marketplace, /INSERT INTO affiliate_accounts/);
  assert.match(marketplace, /upsertOffer/);
  assert.match(marketplace, /publicMarketplaceClick/);
  assert.match(marketplace, /affiliate_link_clicks/);
  assert.match(multiMigration, /affiliate_link_clicks/);
  assert.match(api, /listMarketplaceProducts/);
  assert.match(api, /publicMarketplaceClick/);
  assert.match(api, /path === `\$\{PREFIX\}\/products`/);
  assert.match(api, /multiProviderCatalog: true/);
  assert.match(marketingAdmin, /id="affiliateExternalProductForm"/);
  assert.match(marketingAdmin, /\/api\/affiliate\/products/);
  assert.match(js, /providerName/);
  assert.match(js, /buyLabel/);
  assert.match(html, /id="productDialogSource"/);
  assert.match(html, /id="productDialogDisclosure"/);
});

test('public Offer discovery is read-only and routed independently from affiliate admin ingest', () => {
  assert.match(offerControl, /\/api\/offers/);
  assert.match(offerControl, /\/discover/);
  assert.match(offerControl, /listPublicOffers/);
  assert.match(offerControl, /request\.method !== 'GET'/);
  assert.doesNotMatch(offerControl, /upsertOffer/);
  assert.match(entryWorker, /handleOfferRegistryRequest/);
  assert.match(entryWorker, /path\.startsWith\('\/api\/offers'\)/);
});

test('public product, image and click paths run before admin authentication', () => {
  const authIndex = api.indexOf('const auth = await sessionCheck');
  assert.ok(authIndex > 0);
  assert.ok(api.indexOf("url.pathname === `${PREFIX}/public/products`") < authIndex);
  assert.ok(api.indexOf('publicImage(request, env, url)') < authIndex);
  assert.ok(api.indexOf('publicClick(request, env, url)') < authIndex);
  assert.ok(api.indexOf('publicMarketplaceClick(request, env, url)') < authIndex);
  assert.match(api, /status: 302/);
});

test('automatic product schema is additive and stores provider facts', () => {
  for (const field of ['product_id', 'product_name', 'price_krw', 'image_url', 'affiliate_url', 'is_rocket', 'is_free_shipping', 'selection_source']) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /affiliate_recommendation_runs/);
  assert.match(migration, /affiliate_storefront_clicks/);
});

test('root router publishes Mall under EKODIBIZ and redirects the legacy root path', () => {
  assert.match(router, /const MALL_PREFIX = '\/ekodibiz\/mall'/);
  assert.match(router, /const LEGACY_MALL_PREFIX = '\/mall'/);
  assert.match(router, /mall-legacy-canonical-redirect/);
  assert.match(router, /public-ekodi-mall/);
  assert.match(router, /rewriteMallHtmlDocument/);
  assert.match(router, /MALL_PREFIX\}\/\$\{suffix/);
  assert.match(router, /responseBody = rewriteMallHtmlDocument/);
  assert.match(router, /'\/mall\.css'/);
  assert.match(router, /'\/mall\.js'/);
});
