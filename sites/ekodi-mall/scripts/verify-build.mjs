import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const checks = [
  ['index.html', ['EKODI MALL', 'MARKETPLACE', '7·8·9', '상품 하나부터', '/assets/marketplace-live.js']],
  ['seller/index.html', ['OPEN SELLER STUDIO', 'PERSONAL PRODUCT STUDIO', 'sellerDraftForm', 'Google로 무료 시작', 'Pro AI', '7%', '8%', '9%', '/assets/seller.js', '/assets/seller-server.js']],
  ['checkout/index.html', ['INQUIRY BASKET', 'basketItems', '/assets/commerce.js']],
  ['stores/ekodi-select/index.html', ['EKODI Select', 'STORE COLLECTION']],
  ['products/reusable-daily-bottle/index.html', ['리유저블 데일리 보틀', 'PRODUCT PAGE', 'data-add-basket']],
  ['assets/commerce.js', ['ekodiMallInquiryBasketV1', 'data-basket-copy']],
  ['assets/seller.js', ['ekodiMallSellerStudioDraftV4', 'mall-seller', "plan: 'free'", 'product-link-reservation']],
  ['assets/seller-server.js', ['mall-api.ekodi.kr', '서버에 저장', '게시 · 링크 활성화', '/api/products', '/share-links', '/api/orders?limit=20', '/api/settlements', '직접링크 복사 · 7%', '일반 상품링크 · 8%']],
  ['assets/public-product.js', ['api/public/products', 'api/public/attribution/visit', 'api/public/checkout/quote', 'ekodiMallAnonymousVisitorV1', 'SERVER QUOTE', '최초 유입은 7일간']],
  ['assets/marketplace-live.js', ['api/public/products?limit=24', 'Mall 8%', 'dataset.serverProduct']],
  ['assets/shared-product.html', ['PUBLIC PRODUCT', '/assets/public-product.js']],
  ['_redirects', ['/p/* /assets/shared-product.html 200']],
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
console.log('EKODI Mall V2.4 build verified: seller-direct 7%, Mall 8%, AI 9%, seven-day first-touch, live personal-product discovery, order quotes and disabled payment/payout gates are complete.');