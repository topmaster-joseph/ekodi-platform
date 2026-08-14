import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const checks = [
  ['index.html', ['EKODI MALL', 'MARKETPLACE', 'Seller Studio', 'Inquiry Basket']],
  ['seller/index.html', ['SELLER STUDIO', 'PRODUCT STUDIO', 'sellerDraftForm', '/assets/seller.js']],
  ['checkout/index.html', ['INQUIRY BASKET', 'basketItems', '/assets/commerce.js']],
  ['stores/ekodi-select/index.html', ['EKODI Select', 'STORE COLLECTION']],
  ['products/reusable-daily-bottle/index.html', ['리유저블 데일리 보틀', 'PRODUCT PAGE', 'data-add-basket']],
  ['assets/commerce.js', ['ekodiMallInquiryBasketV1', 'data-basket-copy']],
  ['assets/seller.js', ['ekodiMallSellerStudioDraftV2', 'Product Studio local draft']],
  ['build-meta.json', ['"platformMode": "commerce-mvp"', '"inquiryBasket": true', '"paymentsEnabled": false']]
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

console.log('EKODI Mall build verified: marketplace, stores, Product Studio, inquiry basket, product pages and safety metadata are complete.');
