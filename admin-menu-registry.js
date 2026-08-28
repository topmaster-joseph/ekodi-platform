export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'overview', icon: '⌂', labels: { ko: '통합 운영', en: 'Operations' } },
  { id: 'campus', icon: '▦', labels: { ko: '사이트 관리', en: 'Site Management' } },
  { id: 'aiops', icon: 'AI', labels: { ko: '운영 AI', en: 'AI Operations' } },
  { id: 'ai-module-spec', icon: 'API', labels: { ko: '외부 AI 연동규격', en: 'External AI Spec' } },
  { id: 'health', icon: '♥', labels: { ko: '시스템 건강', en: 'System Health' } },
  { id: 'api-cost', icon: '₩', labels: { ko: 'API · 비용 관리', en: 'API & Cost' } },
  { id: 'storage', icon: '▣', labels: { ko: '저장소', en: 'Storage' } },
  { id: 'security', icon: 'S', labels: { ko: '보안', en: 'Security' } },
  { id: 'marketing-ai', icon: 'M', labels: { ko: '마케팅 AI', en: 'Marketing AI' } },
  { id: 'work', icon: 'W', labels: { ko: '업무', en: 'Work' } },
  { id: 'finance', icon: '₩', labels: { ko: '결제 · 회계', en: 'Finance & Accounting' } },
  { id: 'communication', icon: '✦', labels: { ko: '메일 · 라이브', en: 'Mail & Live' } },
  { id: 'workspace', icon: '▣', labels: { ko: '클라우드 · 자료', en: 'Cloud & Files' } },
  { id: 'devices', icon: 'D', labels: { ko: '기기 · 장치', en: 'Devices' } },
  { id: 'domains', icon: '◎', labels: { ko: '도메인 · DNS', en: 'Domains & DNS' } },
  { id: 'organization', icon: '◫', labels: { ko: '조직 · 사업', en: 'Organizations' } },
  { id: 'clients', icon: 'C', labels: { ko: '고객 사이트', en: 'Customer Sites' } },
  { id: 'admins', icon: '♙', labels: { ko: '관리자 · 권한', en: 'Administrators & Access' }, superAdminOnly: true },
  { id: 'community', icon: '♧', labels: { ko: '커뮤니티', en: 'Community' } },
  { id: 'books', icon: 'B', labels: { ko: '출판 · 도서', en: 'Books & Publishing' } },
  { id: 'social', icon: 'S', labels: { ko: '소셜', en: 'Social' } },
  { id: 'affiliates', icon: 'A', labels: { ko: '제휴', en: 'Affiliates' } },
  { id: 'architecture', icon: '◇', labels: { ko: '시스템 구조 개요', en: 'System Structure' } },
  { id: 'services', icon: '◉', labels: { ko: '서비스 · 통계', en: 'Services & Metrics' }, internal: true },
  { id: 'deployments', icon: '↟', labels: { ko: '배포', en: 'Deployments' }, internal: true },
  { id: 'policies', icon: '◆', labels: { ko: '정책', en: 'Policies' }, internal: true }
]);
const channel = (id, config = {}) => Object.freeze({
  id,
  canonicalHash: config.canonicalHash || `#${id}`,
  hashes: Object.freeze(config.hashes || [config.canonicalHash || `#${id}`]),
  paths: Object.freeze(config.paths || []),
  aliases: Object.freeze(config.aliases || []),
  styles: Object.freeze(config.styles || []),
  scripts: Object.freeze(config.scripts || []),
  secondaryStyles: Object.freeze(config.secondaryStyles || []),
  secondaryScripts: Object.freeze(config.secondaryScripts || []),
  real: config.real || '',
  panel: config.panel || `[data-panel~="${id}"]`,
  preserveExistingNav: Boolean(config.preserveExistingNav),
  serialScripts: Boolean(config.serialScripts),
  superAdminOnly: Boolean(config.superAdminOnly),
});

export const ADMIN_MENU_CHANNELS = Object.freeze({
  campus: channel('campus', { canonicalHash: '#campus', hashes: ['#campus'], aliases: ['sites'], styles: ['campus-actions.css'], scripts: ['campus-actions.js'], real: '[data-section="campus"]' }),
  aiops: channel('aiops', { canonicalHash: '#ai-ops', hashes: ['#ai-ops', '#aiops'], styles: ['ai-ops-admin.css'], scripts: ['ai-ops-admin.js'], secondaryScripts: ['admin-lazy-features.js'], real: '[data-section="aiops"]' }),
  'ai-module-spec': channel('ai-module-spec', { styles: ['ai-module-spec-admin.css'], scripts: ['ai-module-spec-admin.js'], real: '[data-section="ai-module-spec"]' }),
  health: channel('health', { styles: ['system-health-admin.css'], scripts: ['system-health-admin.js'], real: '[data-section="health"]' }),
  'api-cost': channel('api-cost', { styles: ['api-cost-admin.css'], scripts: ['api-cost-admin.js'], real: '[data-section="api-cost"]' }),
  storage: channel('storage', { styles: ['storage-admin.css'], scripts: ['storage-admin.js'], real: '[data-section="storage"]' }),
  security: channel('security', { styles: ['admin-secret-generator.css'], scripts: ['admin-secret-generator.js'], real: '[data-section="security"]' }),
  work: channel('work', { paths: ['/work', '/work/'], styles: ['work-admin.css'], scripts: ['work-admin.js'], real: '[data-section="work"]' }),
  'marketing-ai': channel('marketing-ai', { styles: ['marketing-ai-admin.css'], scripts: ['marketing-ai-admin.js'], real: '[data-section="marketing-ai"]' }),
  devices: channel('devices', { styles: ['device-control-admin.css'], scripts: ['device-control-admin.js'], real: '[data-device-control-nav], [data-section="devices"]' }),
  admins: channel('admins', { styles: ['google-admin-auth.css'], scripts: ['google-admin-auth.js'], real: '[data-section="admins"]', superAdminOnly: true }),
  clients: channel('clients', { styles: ['client-access.css', 'marketing-funnel-admin.css'], scripts: ['client-access.js', 'marketing-funnel-admin.js'], serialScripts: true, real: '[data-section="clients"]' }),
  community: channel('community', { styles: ['community-reports-admin.css'], scripts: ['community-reports-admin.js'], real: '[data-section="community"]' }),
  books: channel('books', { styles: ['books-admin.css', 'books-finance-admin.css'], scripts: ['books-admin.js', 'books-finance-admin.js'], serialScripts: true, real: '[data-section="books"]', panel: '#booksAdminSection' }),
  social: channel('social', { styles: ['social-admin.css'], scripts: ['social-admin.js'], real: '[data-section="social"]' }),
  affiliates: channel('affiliates', { styles: ['marketing-funnel-admin.css'], scripts: ['marketing-funnel-admin.js'], real: '[data-section="affiliates"]' }),
  domains: channel('domains', { styles: ['domains-hub.css'], scripts: ['domains-hub.js'], real: '[data-section="domains"]' }),
  finance: channel('finance', { styles: ['control-center-finance.css', 'author-billing-admin.css'], scripts: ['finance-monitor.js', 'author-billing-admin.js'], preserveExistingNav: true, panel: '[data-panel~="finance"]' }),
});

const BY_ID = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
const ALIASES = new Map();
for (const [id, item] of Object.entries(ADMIN_MENU_CHANNELS)) {
  ALIASES.set(id, id);
  for (const alias of item.aliases) ALIASES.set(alias, id);
}
ALIASES.set('marketing', 'marketing-ai');
ALIASES.set('ai-ops', 'aiops');
ALIASES.set('operations', 'overview');
ALIASES.set('release', 'deployments');

export function normalizeAdminLocale(value) {
  return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ko';
}

export function normalizeAdminSection(value) {
  const id = String(value || '').trim().toLowerCase();
  return ALIASES.get(id) || id;
}

export function getAdminMenuItem(id) {
  return BY_ID.get(normalizeAdminSection(id)) || null;
}
export function getAdminMenuLabel(id, locale = 'ko') {
  const item = getAdminMenuItem(id);
  const language = normalizeAdminLocale(locale);
  return item?.labels?.[language] || item?.labels?.ko || String(id || '');
}

export function getAdminMenuChannel(id) {
  return ADMIN_MENU_CHANNELS[normalizeAdminSection(id)] || null;
}

export function adminMenuOrder() {
  return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id);
}

export function canonicalAdminHash(id, subservice = '') {
  const section = normalizeAdminSection(id);
  if (section === 'overview') return '#operations';
  const base = getAdminMenuChannel(section)?.canonicalHash || `#${section}`;
  return subservice ? `${base}/${encodeURIComponent(String(subservice).trim())}` : base;
}

export function resolveAdminMenuLocation(locationLike = globalThis.location) {
  const hash = String(locationLike?.hash || '').toLowerCase();
  const path = String(locationLike?.pathname || '/').toLowerCase();
  if (hash === '#sites' || hash.startsWith('#sites/')) return { section: 'campus', subservice: 'sites' };
  if (hash === '#ai-membership' || hash.startsWith('#ai-membership/')) return { section: 'aiops', subservice: 'membership' };
  if (hash === '#storige') return { section: 'storage', subservice: '' };
  const [baseHash, rawSubservice = ''] = hash.split('/', 2);
  for (const item of Object.values(ADMIN_MENU_CHANNELS)) {
    if (item.hashes.includes(baseHash) || item.paths.includes(path)) {
      return { section: item.id, subservice: rawSubservice ? decodeURIComponent(rawSubservice) : '' };
    }
  }
  if (baseHash === '#operations') return { section: 'overview', subservice: rawSubservice };
  const candidate = normalizeAdminSection(baseHash.replace(/^#/, ''));
  return BY_ID.has(candidate) ? { section: candidate, subservice: rawSubservice } : { section: '', subservice: '' };
}
