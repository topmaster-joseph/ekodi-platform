import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const checks = [
  ['index.html', ['EKODI MALL', 'MARKETPLACE', 'Seller Studio', 'Inquiry Basket']],
  ['seller/index.html', ['OPEN SELLER STUDIO', 'STORE & PRODUCT STUDIO', 'sellerDraftForm', 'Google로 무료 시작', 'Starter AI', 'Pro AI', 'Business AI', '/assets/seller.js']],
  ['checkout/index.html', ['INQUIRY BASKET', 'basketItems', '/assets/commerce.js']],
  ['stores/ekodi-select/index.html', ['EKODI Select', 'STORE COLLECTION']],
  ['products/reusable-daily-bottle/index.html', ['리유저블 데일리 보틀', 'PRODUCT PAGE', 'data-add-basket']],
  ['assets/commerce.js', ['ekodiMallInquiryBasketV1', 'data-basket-copy']],
  ['assets/seller.js', ['ekodiMallSellerStudioDraftV3', 'mall-seller', "plan: 'free'", "type: 'affiliate'", 'affiliateRoutingReady']],
  ['build-meta.json', ['"platformMode": "marketplace-v2"', '"inquiryBasket": true', '"paymentsEnabled": false', '"affiliateExternalRouting": true']]
];

const errors = [];
for (const [relative, needles] of checks) {
  let content = '';
  try {
    content = await readFile(path.join(dist, relative), 'utf8');
  } catch {
    errors.push(`${relative} is missing`);
    continue;
  }
  for (const needle of needles) {
    if (!content.includes(needle)) errors.push(`${relative} is missing marker: ${needle}`);
  }
  if (/\{\{[A-Z0-9_]+\}\}/.test(content)) errors.push(`${relative} contains unresolved template tokens`);
}

if (errors.length) {
  console.error(`EKODI Mall build verification failed (${errors.length})`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('EKODI Mall V2 build verified: Google seller entry, free membership, tiered AI plans, affiliate routing, direct-sale safety gate and marketplace pages are complete.');
