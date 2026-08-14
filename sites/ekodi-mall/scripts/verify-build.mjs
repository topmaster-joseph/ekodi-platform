import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const checks = [
  ['index.html', ['EKODI MALL', 'MARKETPLACE', 'Seller Studio', 'Inquiry Basket']],
  ['seller/index.html', ['OPEN SELLER STUDIO', 'PERSONAL PRODUCT STUDIO', 'sellerDraftForm', 'Google로 무료 시작', 'PG 포함 · VAT 포함', '7%', '8%', '9%', 'Starter AI', 'Pro AI', 'Business AI', '/assets/seller.js']],
  ['checkout/index.html', ['INQUIRY BASKET', 'basketItems', '/assets/commerce.js']],
  ['stores/ekodi-select/index.html', ['EKODI Select', 'STORE COLLECTION']],
  ['products/reusable-daily-bottle/index.html', ['리유저블 데일리 보틀', 'PRODUCT PAGE', 'data-add-basket']],
  ['assets/commerce.js', ['ekodiMallInquiryBasketV1', 'data-basket-copy']],
  ['assets/seller.js', ['ekodiMallSellerStudioDraftV5', 'api.mall.ekodi.kr', 'mall-seller', 'mall-api-publish', '7% 직접공유 링크 만들기', 'ratePercent:7', 'ratePercent:8', 'ratePercent:9', 'serverAuthoritative:true']],
  ['assets/public-product.html', ['PERSONAL PRODUCT', 'publicProductView', '/assets/public-product.js', '수수료 판정은 서버에서']],
  ['assets/public-product.js', ['api.mall.ekodi.kr', 'ekodiMallVisitorV1', '/api/attribution/visit', '/api/public/products/', 'PRODUCT_NOT_FOUND']],
  ['_redirects', ['/p/* /assets/public-product.html 200']],
  ['_headers', ['https://cdn.jsdelivr.net', 'https://renzehysxirjilvdxacv.supabase.co', 'https://api.mall.ekodi.kr']],
  ['build-meta.json', ['"platformMode": "marketplace-v2"', '"inquiryBasket": true', '"paymentsEnabled": false', '"affiliateExternalRouting": true']]
];

const errors = [];
for (const [relative, needles] of checks) {
  let content = '';
  try { content = await readFile(path.join(dist, relative), 'utf8'); }
  catch { errors.push(`${relative} is missing`); continue; }
  for (const needle of needles) if (!content.includes(needle)) errors.push(`${relative} is missing marker: ${needle}`);
  if (/\{\{[A-Z0-9_]+\}\}/.test(content)) errors.push(`${relative} contains unresolved template tokens`);
}
if (errors.length) {
  console.error(`EKODI Mall build verification failed (${errors.length})`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log('EKODI Mall V2.2 build verified: server-backed Seller Studio client, public personal-product shell, 7/8/9 attribution contract, affiliate routing and payment safety gate are complete.');
