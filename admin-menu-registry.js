export const ADMIN_MENU_GROUPS = Object.freeze([
  { id: 'home', icon: '⌂', defaultSection: 'campus', labels: { ko: '홈', en: 'Home' } },
  { id: 'operations', icon: '◎', defaultSection: 'work', labels: { ko: '운영', en: 'Operations' } },
  { id: 'people', icon: '▦', defaultSection: 'workspace', labels: { ko: '사용자·공간', en: 'People & Spaces' } },
  { id: 'services', icon: '◇', defaultSection: 'life-ai', labels: { ko: '서비스', en: 'Services' } },
  { id: 'ai', icon: 'AI', defaultSection: 'aiops', labels: { ko: 'AI·자동화', en: 'AI & Automation' } },
  { id: 'business', icon: '₩', defaultSection: 'finance', labels: { ko: '비즈니스', en: 'Business' } },
  { id: 'data', icon: '▤', defaultSection: 'storage', labels: { ko: '데이터', en: 'Data' } },
  { id: 'system', icon: '⚙', defaultSection: 'health', labels: { ko: '시스템', en: 'System' } },
]);

export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'campus', group: 'home', icon: '▦', labels: { ko: '사이트 관리', en: 'Site Management' } },
  { id: 'public-site-controls', group: 'home', icon: '임', labels: { ko: '임시페이지 설정', en: 'Maintenance Pages' } },
  { id: 'work', group: 'operations', icon: 'W', labels: { ko: '업무', en: 'Work' } },
  { id: 'communication', group: 'operations', icon: '✦', labels: { ko: '메일 · 라이브', en: 'Mail & Live' } },
  { id: 'workspace', group: 'people', icon: '▣', labels: { ko: '공간 · 자료', en: 'Spaces & Files' } },
  { id: 'organization', group: 'people', icon: '◫', labels: { ko: '조직 · 사업', en: 'Organizations' } },
  { id: 'cheonggye-members', group: 'people', icon: '名', labels: { ko: '청계면상인회 정회원', en: 'Cheonggye Members' } },
  { id: 'clients', group: 'people', icon: 'C', labels: { ko: '고객 사이트', en: 'Customer Sites' } },
  { id: 'admins', group: 'people', icon: '♜', labels: { ko: '관리자 · 권한', en: 'Administrators & Access' }, superAdminOnly: true },
  { id: 'life-ai', group: 'services', icon: 'Q', labels: { ko: '인생AI', en: 'Life AI' } },
  { id: 'common-services', group: 'services', icon: '◉', labels: { ko: '공통서비스', en: 'Common Services' } },
  { id: 'community', group: 'services', icon: '◎', labels: { ko: '커뮤니티', en: 'Community' } },
  { id: 'books', group: 'services', icon: 'B', labels: { ko: '출판 · 도서', en: 'Books & Publishing' } },
  { id: 'social', group: 'services', icon: 'S', labels: { ko: '소셜', en: 'Social' } },
  { id: 'aiops', group: 'ai', icon: 'AI', labels: { ko: '운영 AI', en: 'AI Operations' } },
  { id: 'devotional', group: 'ai', icon: 'V', labels: { ko: '매일묵상', en: 'Daily Devotional' } },
  { id: 'marketing-ai', group: 'ai', icon: 'M', labels: { ko: '마케팅 AI', en: 'Marketing AI' } },
  { id: 'ai-module-spec', group: 'ai', icon: 'API', labels: { ko: '외부 AI 연동규격', en: 'External AI Spec' } },
  { id: 'ai-membership', group: 'ai', icon: '◈', labels: { ko: 'AI 회원운영', en: 'AI Membership' } },
  { id: 'finance', group: 'business', icon: '₩', labels: { ko: '결제 · 회계', en: 'Finance & Accounting' } },
  { id: 'tax', group: 'business', icon: 'T', labels: { ko: '세금 · 증빙', en: 'Tax & Evidence' }, href: 'https://tax.ekodi.kr/', adminHandoff: true },
  { id: 'affiliates', group: 'business', icon: '🛒', labels: { ko: '에코디몰 AI 영업', en: 'Mall AI Sales' }, href: 'https://ekodi.kr/ekodibiz/mall/admin/', adminHandoff: true },
  { id: 'storage', group: 'data', icon: '▣', labels: { ko: '저장소', en: 'Storage' } },
  { id: 'api-cost', group: 'data', icon: '₩', labels: { ko: 'API · 비용', en: 'API & Cost' } },
  { id: 'health', group: 'system', icon: '♥', labels: { ko: '시스템 건강', en: 'System Health' } },
  { id: 'security', group: 'system', icon: 'S', labels: { ko: '보안', en: 'Security' } },
  { id: 'devices', group: 'system', icon: 'D', labels: { ko: '실행 인프라', en: 'Execution Infrastructure' } },
  { id: 'architecture', group: 'system', icon: '◇', labels: { ko: '시스템 구조', en: 'System Structure' } },
  { id: 'services', group: 'data', icon: '◉', labels: { ko: '서비스 · 통계', en: 'Services & Metrics' }, internal: true },
  { id: 'deployments', group: 'operations', icon: '↥', labels: { ko: '배포', en: 'Deployments' }, internal: true },
  { id: 'policies', group: 'system', icon: '⚙', labels: { ko: '정책', en: 'Policies' }, internal: true },
]);

const BY_ID = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
const GROUP_BY_ID = new Map(ADMIN_MENU_GROUPS.map(group => [group.id, group]));

export function normalizeAdminLocale(value) { return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ko'; }
export function getAdminMenuItem(id) { return BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuLabel(id, locale = 'ko') { const item = getAdminMenuItem(id); const language = normalizeAdminLocale(locale); return item?.labels?.[language] || item?.labels?.ko || String(id || ''); }
export function getAdminMenuGroup(id) { return GROUP_BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuGroupLabel(id, locale = 'ko') { const group = getAdminMenuGroup(id); const language = normalizeAdminLocale(locale); return group?.labels?.[language] || group?.labels?.ko || String(id || ''); }
export function getAdminMenuGroupForSection(section) { return getAdminMenuItem(section)?.group || 'home'; }
export function getAdminMenuGroupDefault(id) { const group = getAdminMenuGroup(id); if (!group) return 'campus'; const firstVisibleChild = ADMIN_MENU_REGISTRY.find(item => item.group === group.id && !item.internal); return firstVisibleChild?.id || group.defaultSection || 'campus'; }
export function adminMenuGroups() { return ADMIN_MENU_GROUPS.map(group => group.id); }
export function adminMenuOrder() { return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id); }

if (typeof document !== 'undefined') {
  import('./devotional-admin.js').catch(error => console.warn('[EKODI Admin] devotional bootstrap failed', error));
}