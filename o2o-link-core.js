// Provider-neutral public entry contract for EKODI physical-to-digital activity links.
// Accessing a QR destination is never proof of attendance, identity, purchase or point eligibility.
export const O2O_SITES = Object.freeze([
  Object.freeze({ id: 'mission', name: '에코디선교회', group: '교회·선교', root: '/ekodimission', action: '신청하기' }),
  Object.freeze({ id: 'commerce', name: '청계상인회', group: '지역상권', root: '/cgma', action: '방문하기' }),
  Object.freeze({ id: 'education', name: '에코디교육', group: '교육·농업', root: '/edu', action: '참여하기' }),
  Object.freeze({ id: 'books', name: '에코디서점', group: '출판·독서', root: '/ekodibooks', action: '살펴보기' }),
  Object.freeze({ id: 'mall', name: '에코디몰', group: '커머스', root: '/ekodimall', action: '상품 보기' }),
  Object.freeze({ id: 'civic', name: '서남권국립의대', group: '시민참여', root: '/seonammedi', action: '참여하기' }),
]);
const ORIGIN = 'https://ekodi.kr';
const QUERY_KEYS = new Set(['meeting', 'event', 'activity', 'tab', 'section', 'page', 'category', 'id']);
const PRIVATE_SEGMENTS = new Set(['admin', 'api', 'auth', 'login', 'logout', 'my', 'account', 'operator', 'manage', 'settings', 'private', 'internal', 'share', 'edit']);
function reject() { throw new TypeError('o2o_public_destination_not_allowed'); }
export function resolveO2OTarget({ siteId = 'mission', targetPath = '' } = {}) {
  const site = O2O_SITES.find((item) => item.id === siteId);
  if (!site) reject();
  const input = String(targetPath || site.root).trim();
  if (input.length > 600 || !input || input.includes('\\') || /[\u0000-\u001f\u007f]/.test(input)) reject();
  // Never accept scheme-relative URLs or arbitrary schemes, even when URL() normalizes them.
  if (!(input.startsWith('/') && !input.startsWith('//')) &&
      !(input === ORIGIN || input.startsWith(ORIGIN + '/'))) reject();
  let url;
  try { url = new URL(input, ORIGIN); } catch { reject(); }
  if (url.origin !== ORIGIN || url.username || url.password || url.port) reject();
  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { reject(); }
  if (decodedPath.includes('\\') || decodedPath.includes('//') || decodedPath.includes('?') || decodedPath.includes('#')) reject();
  if (!(decodedPath === site.root || decodedPath.startsWith(site.root + '/'))) reject();
  const segments = decodedPath.split('/').filter(Boolean);
  if (segments.some((segment) => PRIVATE_SEGMENTS.has(segment.toLowerCase()) || segment === '..' || segment === '.')) reject();
  if (url.searchParams.size > 10 || url.hash.length > 80) reject();
  for (const [key, value] of url.searchParams) {
    if (!QUERY_KEYS.has(key) || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) reject();
  }
  // Stable canonical QR payload, without user identifiers, tracking or tokens.
  return Object.freeze({ site, url: url.toString(), path: url.pathname + url.search + url.hash });
}
export function formatO2OShareText({ siteId = 'mission', targetPath = '', activityName = '' } = {}) {
  const resolved = resolveO2OTarget({ siteId, targetPath });
  const title = String(activityName || '현장 활동').trim().replace(/[\r\n\t]+/g, ' ').slice(0, 90);
  return resolved.site.name + ' ' + title + ' ' + resolved.site.action + '\n' + resolved.url;
}
