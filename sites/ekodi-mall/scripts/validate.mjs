import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (name) => JSON.parse(await readFile(path.join(root, 'content', name), 'utf8'));
const [site, products, pages, stores] = await Promise.all([
  load('site.json'),
  load('products.json'),
  load('pages.json'),
  load('stores.json')
]);

const errors = [];
const required = (value, label) => {
  if (value === undefined || value === null || String(value).trim() === '') errors.push(`${label} is required`);
};
const validUrl = (value, label) => {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
  } catch {
    errors.push(`${label} must be an http(s) URL`);
  }
};
const internalPath = (value, label) => {
  if (!value || typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) errors.push(`${label} must be an internal absolute path`);
};

required(site?.brand?.name, 'site.brand.name');
required(site?.seo?.title, 'site.seo.title');
required(site?.seo?.description, 'site.seo.description');
required(site?.platform?.mode, 'site.platform.mode');
validUrl(site?.seo?.baseUrl, 'site.seo.baseUrl');
validUrl(site?.links?.inquiry, 'site.links.inquiry');
validUrl(site?.links?.paymentGateway, 'site.links.paymentGateway');
internalPath(site?.platform?.sellerStudioHref, 'site.platform.sellerStudioHref');
internalPath(site?.platform?.basketHref, 'site.platform.basketHref');

if (!Array.isArray(site?.platform?.modules) || site.platform.modules.length < 3) errors.push('site.platform.modules must define platform modules');
if (site?.commerce?.inquiryBasketEnabled) {
  required(site?.commerce?.basketLabel, 'site.commerce.basketLabel');
  required(site?.commerce?.checkoutLabel, 'site.commerce.checkoutLabel');
}
if (!['inquiry-only', 'order-ready', 'live'].includes(site?.commerce?.orderMode)) errors.push('site.commerce.orderMode must be inquiry-only, order-ready, or live');
if (!site?.commerce?.paymentsEnabled && site?.commerce?.orderMode === 'live') errors.push('site.commerce.orderMode cannot be live while paymentsEnabled=false');

const categoryIds = new Set((site.categories || []).map((item) => item.id));
if (!categoryIds.has('all')) errors.push('site.categories must include "all"');

const storeIds = new Set();
const storeSlugs = new Set();
for (const [index, store] of stores.entries()) {
  const label = `stores[${index}]`;
  required(store.id, `${label}.id`);
  required(store.slug, `${label}.slug`);
  required(store.name, `${label}.name`);
  required(store.operator, `${label}.operator`);
  required(store.status, `${label}.status`);
  if (storeIds.has(store.id)) errors.push(`${label}.id duplicates ${store.id}`);
  if (storeSlugs.has(store.slug)) errors.push(`${label}.slug duplicates ${store.slug}`);
  storeIds.add(store.id);
  storeSlugs.add(store.slug);
  if (!/^[a-z0-9-]+$/.test(store.slug || '')) errors.push(`${label}.slug must use lowercase letters, numbers, and hyphens`);
  if (typeof store.published !== 'boolean') errors.push(`${label}.published must be boolean`);
  validUrl(store.contactUrl, `${label}.contactUrl`);
}

const ids = new Set();
const slugs = new Set();
for (const [index, product] of products.entries()) {
  const label = `products[${index}]`;
  required(product.id, `${label}.id`);
  required(product.slug, `${label}.slug`);
  required(product.storeId, `${label}.storeId`);
  required(product.name, `${label}.name`);
  required(product.category, `${label}.category`);
  required(product.status, `${label}.status`);
  if (ids.has(product.id)) errors.push(`${label}.id duplicates ${product.id}`);
  if (slugs.has(product.slug)) errors.push(`${label}.slug duplicates ${product.slug}`);
  ids.add(product.id); slugs.add(product.slug);
  if (!/^[a-z0-9-]+$/.test(product.slug || '')) errors.push(`${label}.slug must use lowercase letters, numbers, and hyphens`);
  if (!categoryIds.has(product.category)) errors.push(`${label}.category is not defined in site.categories`);
  if (!storeIds.has(product.storeId)) errors.push(`${label}.storeId does not match a store`);
  if (typeof product.published !== 'boolean') errors.push(`${label}.published must be boolean`);
  if (product.price !== null && product.price !== undefined && (!Number.isFinite(product.price) || product.price < 0)) errors.push(`${label}.price must be null or a non-negative number`);
  validUrl(product?.action?.url, `${label}.action.url`);
  required(product?.action?.label, `${label}.action.label`);
  if (!site?.commerce?.paymentsEnabled && ['purchase', 'pay', 'checkout'].includes(String(product?.action?.type || '').toLowerCase())) {
    errors.push(`${label}.action.type cannot imply purchase while paymentsEnabled=false`);
  }
  if (product.detail?.highlights && !Array.isArray(product.detail.highlights)) errors.push(`${label}.detail.highlights must be an array`);
}

const policySlugs = new Set();
for (const [index, policy] of (pages.policies || []).entries()) {
  const label = `pages.policies[${index}]`;
  required(policy.slug, `${label}.slug`);
  required(policy.title, `${label}.title`);
  required(policy.summary, `${label}.summary`);
  if (policySlugs.has(policy.slug)) errors.push(`${label}.slug duplicates ${policy.slug}`);
  policySlugs.add(policy.slug);
  if (!Array.isArray(policy.body) || policy.body.length === 0) errors.push(`${label}.body must contain at least one paragraph`);
  validUrl(policy?.action?.url, `${label}.action.url`);
}

if (site?.commerce?.paymentsEnabled) {
  for (const key of ['registrationNumber', 'commerceRegistrationNumber', 'address', 'customerService']) {
    required(site?.business?.[key], `site.business.${key} (required when paymentsEnabled=true)`);
  }
  validUrl(site?.links?.paymentGateway, 'site.links.paymentGateway (required when paymentsEnabled=true)');
}

if (errors.length) {
  console.error(`EKODI Mall content validation failed (${errors.length})`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`EKODI Mall content OK: ${stores.length} stores, ${products.length} products, ${(pages.policies || []).length} policy pages, mode=${site.platform.mode}`);
