// EKODI-PROMOTION-SQUARE-001: read-only projection of the existing public registry.
// This module never publishes, grants access or persists content.
const KINDS = new Set(['event', 'notice', 'post', 'article', 'product', 'service']);
const DENIED_PREFIXES = ['/admin', '/api', '/auth', '/oauth', '/my', '/preview', '/workspace-admin', '/_ekodi'];
export const PROMOTION_MAX_ITEMS = 60;

function safeString(value, limit = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}
function safePublicUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'ekodi.kr' || url.username || url.password || url.port || url.search || url.hash) return '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || path.toLowerCase().split('/').includes('admin')) return '';
    if (DENIED_PREFIXES.some(prefix => path.toLowerCase() === prefix || path.toLowerCase().startsWith(prefix + '/'))) return '';
    return 'https://ekodi.kr' + path;
  } catch { return ''; }
}
export function promotionCategory(type) {
  if (type === 'event') return 'event';
  if (type === 'product') return 'product';
  return 'notice';
}
function publicationTimestamp(entry) {
  const source = entry.updatedAt || entry.publishedAt || '';
  const ms = Date.parse(source);
  return Number.isFinite(ms) ? ms : 0;
}
export function preparePromotionItems(registry, limit = PROMOTION_MAX_ITEMS) {
  if (!registry || !Array.isArray(registry.resources)) return [];
  const rows = [];
  const seen = new Set();
  for (const entry of registry.resources) {
    if (!entry || typeof entry !== 'object' || !KINDS.has(entry.type)) continue;
    if (entry.visibility != null && entry.visibility !== 'public') continue;
    const url = safePublicUrl(entry.url);
    if (!url || seen.has(url)) continue;
    const title = safeString(entry.name || entry.title, 150);
    if (!title) continue;
    seen.add(url);
    rows.push({
      id: safeString(entry.id, 160) || url,
      url,
      title,
      summary: safeString(entry.description, 360),
      type: entry.type,
      category: promotionCategory(entry.type),
      siteId: safeString(entry.siteId, 100).toLowerCase(),
      timestamp: publicationTimestamp(entry),
    });
  }
  const order = { event: 0, notice: 1, post: 2, article: 3, service: 4, product: 5 };
  rows.sort((a, b) => (order[a.type] - order[b.type]) || b.timestamp - a.timestamp || a.title.localeCompare(b.title, 'ko'));
  const bounded = Math.max(1, Math.min(PROMOTION_MAX_ITEMS, Number(limit) || PROMOTION_MAX_ITEMS));
  return rows.slice(0, bounded);
}
export function filterPromotionItems(items, { category = 'all', siteId = 'all' } = {}) {
  return (Array.isArray(items) ? items : []).filter(item => (category === 'all' || item.category === category) && (siteId === 'all' || item.siteId === siteId));
}
export function promotionPage(items, page = 0, size = 5) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { items: [], page: 0, pages: 0 };
  const pageSize = Math.max(1, Math.min(10, Math.floor(size) || 5));
  const pages = Math.ceil(list.length / pageSize);
  const index = ((Math.floor(page) || 0) % pages + pages) % pages;
  return { items: list.slice(index * pageSize, (index + 1) * pageSize), page: index, pages };
}
