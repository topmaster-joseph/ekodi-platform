import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const checks = [
  ['index.html', ['EKODI MALL', 'MARKETPLACE', '7·8·9', '상품 하나부터', '/assets/marketplace-live.js']],
  ['seller/index.html', ['OPEN SELLER STUDIO', 'PERSONAL PRODUCT STUDIO', 'sellerDraftForm', 'Google로 무료 시작', '7%', '8%', '9%', 'STOREFRONT', 'ANALYTICS', '/assets/seller-readiness.js', '/assets/seller-analytics.js', '/assets/seller-storefronts.js', '/assets/analytics.css']],
  ['checkout/index.html', ['INQUIRY BASKET', 'basketItems', '/assets/commerce.js']],
  ['stores/ekodi-select/index.html', ['EKODI Select', 'STORE COLLECTION']],
  ['products/reusable-daily-bottle/index.html', ['리유저블 데일리 보틀', 'PRODUCT PAGE', 'data-add-basket']],
  ['assets/commerce.js', ['ekodiMallInquiryBasketV1', 'data-basket-copy']],
  ['assets/seller.js', ['ekodiMallSellerStudioDraftV4', 'mall-seller', "plan: 'free'", 'product-link-reservation']],
  ['assets/seller-server.js', ['mall-api.ekodi.kr', '서버에 저장', '게시 · 링크 활성화', '/api/products', '/share-links', '/api/orders?limit=20', '/api/settlements', '직접링크 복사 · 7%', '일반 상품링크 · 8%']],
  ['assets/seller-readiness.js', ['DIRECT SALE READINESS', '/api/readiness', '/api/verification/seller/submit', '/verification/submit', 'payments-disabled', 'product-checkout-gate']],
  ['assets/seller-analytics.js', ['SELLER ANALYTICS', '/api/analytics/summary', 'PAID GROSS', 'first-touch', 'visitor ID']],
  ['assets/seller-storefronts.js', ['MY STOREFRONTS', '/api/storefronts', 'Store URL 복사', 'Mall 8%']],
  ['assets/analytics.css', ['analytics-product-row', 'analytics-period']],
  ['assets/public-product.js', ['api/public/products', 'api/public/attribution/visit', 'api/public/checkout/quote', 'ekodiMallAnonymousVisitorV1', 'SERVER QUOTE', '최초 유입은 7일간']],
  ['assets/shared-store.html', ['SELLER STOREFRONT', '/assets/public-store.js', '/assets/storefront.css']],
  ['assets/public-store.js', ['/api/public/stores/', 'Mall 8%', '/p/']],
  ['assets/storefront.css', ['storefront-public-hero', 'storefront-product']],
  ['assets/marketplace-live.js', ['api/public/products?limit=24', 'Mall 8%', 'dataset.serverProduct']],
  ['assets/sourcing-lab.html', ['EKODI SOURCING LAB', 'Auto Source', 'Dry-run', '계약 공급자', '/assets/sourcing-lab.js']],
  ['assets/sourcing-lab.js', ['/api/sourcing/providers', '/api/sourcing/sources', '/plan', 'auction-reference', '자동발주 OFF']],
  ['assets/fulfillment-lab.js', ['/api/fulfillment', '배송정보 승인 대기', '공급자 전달']],
  ['assets/supplier-ops.html', ['SUPPLIER OPS', 'Supplier Partner', 'SKU → EKODI 상품 매핑', '/assets/supplier-ops.js']],
  ['assets/supplier-ops.js', ['/api/internal/supplier-pilot/context', '/create-source', '/verify-contract', '/products', 'Auto Order OFF']],
  ['assets/supplier-ops.css', ['ops-grid', 'ops-map-form', 'ops-table']],
  ['assets/supplier-discovery.html', ['SUPPLIER DISCOVERY', '증거 기반 평가', 'PILOT PREFLIGHT', '/assets/supplier-discovery.js']],
  ['assets/supplier-discovery.js', ['/api/internal/supplier-discovery/context', '/assessment', '/evidence', '/outreach-draft', '/api/internal/supplier-preflight', '자동 발송하지 않습니다']],
  ['assets/shared-product.html', ['PUBLIC PRODUCT', '/assets/public-product.js']],
  ['_redirects', ['/p/* /assets/shared-product.html 200', '/store/* /assets/shared-store.html 200', '/sourcing /assets/sourcing-lab.html 200', '/fulfillment', '/supplier-ops /assets/supplier-ops.html 200', '/supplier-discovery /assets/supplier-discovery.html 200']],
  ['build-meta.json', ['"platformMode": "marketplace-v2"', '"paymentsEnabled": false', '"affiliateExternalRouting": true']]
];
const errors = [];
for (const [relative, needles] of checks) {
  let content = '';
  try { content = await readFile(path.join(dist, relative), 'utf8'); } catch { errors.push(`${relative} is missing`); continue; }
  for (const needle of needles) if (!content.includes(needle)) errors.push(`${relative} is missing marker: ${needle}`);
  if (/\{\{[A-Z0-9_]+\}\}/.test(content)) errors.push(`${relative} contains unresolved template tokens`);
}
if (errors.length) {
  console.error(`EKODI Mall build verification failed (${errors.length})`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log('EKODI Mall V3.1 build verified: Supplier Discovery evidence scoring and manual-first pilot preflight join Supplier Partner ops, fulfillment, Storefronts and Analytics while auto outreach, payments, PII release, supplier forwarding, payout, refunds and Auto Order remain disabled by default.');
