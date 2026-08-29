export const ADMIN_MENU_GROUPS = Object.freeze([
  { id: 'home', icon: '⌂', defaultSection: 'campus', labels: { ko: '홈', en: 'Home' } },
  { id: 'operations', icon: '◎', defaultSection: 'aiops', labels: { ko: '운영', en: 'Operations' } },
  { id: 'space', icon: '▦', defaultSection: 'workspace', labels: { ko: '공간', en: 'Spaces' } },
  { id: 'services', icon: '◇', defaultSection: 'marketing-ai', labels: { ko: '서비스', en: 'Services' } },
  { id: 'system', icon: '⚙', defaultSection: 'health', labels: { ko: '시스템', en: 'System' } },
]);

export const ADMIN_MENU_REGISTRY = Object.freeze([
  // HOME: the shortest deterministic entry into the admin surface.
  { id: 'campus', group: 'home', icon: '▦', labels: { ko: '사이트 관리', en: 'Site Management' } },

  // OPERATIONS: what is happening now and what needs action.
  { id: 'aiops', group: 'operations', icon: 'AI', labels: { ko: '운영 AI', en: 'AI Operations' } },
  { id: 'work', group: 'operations', icon: 'W', labels: { ko: '업무', en: 'Work' } },
  { id: 'finance', group: 'operations', icon: '₩', labels: { ko: '결제 · 회계', en: 'Finance & Accounting' } },
  { id: 'tax', group: 'operations', icon: 'T', labels: { ko: '세금 · 증빙', en: 'Tax & Evidence' }, href: 'https://tax.ekodi.kr/', adminHandoff: true },
  { id: 'communication', group: 'operations', icon: '✦', labels: { ko: '메일 · 라이브', en: 'Mail & Live' } },

  // SPACES: ownership, tenants, organizations and working data surfaces.
  { id: 'workspace', group: 'space', icon: '▣', labels: { ko: '클라우드 · 자료', en: 'Cloud & Files' } },
  { id: 'organization', group: 'space', icon: '◫', labels: { ko: '조직 · 사업', en: 'Organizations' } },
  { id: 'clients', group: 'space', icon: 'C', labels: { ko: '고객 사이트', en: 'Customer Sites' } },

  // SERVICES: product/service capabilities. Their detailed functions belong inside each service view.
  { id: 'marketing-ai', group: 'services', icon: 'M', labels: { ko: '마케팅 AI', en: 'Marketing AI' } },
  { id: 'ai-module-spec', group: 'services', icon: 'API', labels: { ko: '외부 AI 연동규격', en: 'External AI Spec' } },
  { id: 'ai-membership', group: 'services', icon: '◈', labels: { ko: 'AI 회원운영', en: 'AI Membership' } },
  { id: 'life-ai', group: 'services', icon: 'Q', labels: { ko: '인생AI', en: 'Life AI' } },
  { id: 'community', group: 'services', icon: '◎', labels: { ko: '커뮤니티', en: 'Community' } },
  { id: 'books', group: 'services', icon: 'B', labels: { ko: '출판 · 도서', en: 'Books & Publishing' } },
  { id: 'social', group: 'services', icon: 'S', labels: { ko: '소셜', en: 'Social' } },
  { id: 'affiliates', group: 'services', icon: 'A', labels: { ko: '제휴', en: 'Affiliates' } },

  // SYSTEM: health, security, infrastructure and platform-wide access.
  { id: 'health', group: 'system', icon: '♥', labels: { ko: '시스템 건강', en: 'System Health' } },
  { id: 'security', group: 'system', icon: 'S', labels: { ko: '보안', en: 'Security' } },
  { id: 'devices', group: 'system', icon: 'D', labels: { ko: '기기 관리', en: 'Devices' } },
  { id: 'architecture', group: 'system', icon: '◇', labels: { ko: '시스템 구조 개요', en: 'System Structure' } },
  { id: 'admins', group: 'system', icon: '♜', labels: { ko: '관리자 · 권한', en: 'Administrators & Access' }, superAdminOnly: true },
  { id: 'api-cost', group: 'system', icon: '₩', labels: { ko: 'API · 비용 관리', en: 'API & Cost' } },
  { id: 'storage', group: 'system', icon: '▣', labels: { ko: '저장소', en: 'Storage' } },

  // Internal capabilities never become extra global navigation axes.
  { id: 'services', group: 'services', icon: '◉', labels: { ko: '서비스 · 통계', en: 'Services & Metrics' }, internal: true },
  { id: 'deployments', group: 'system', icon: '↥', labels: { ko: '배포', en: 'Deployments' }, internal: true },
  { id: 'policies', group: 'system', icon: '⚙', labels: { ko: '정책', en: 'Policies' }, internal: true },
]);

const BY_ID = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
const GROUP_BY_ID = new Map(ADMIN_MENU_GROUPS.map(group => [group.id, group]));

export function normalizeAdminLocale(value) {
  return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ko';
}

export function getAdminMenuItem(id) {
  return BY_ID.get(String(id || '').trim()) || null;
}

export function getAdminMenuLabel(id, locale = 'ko') {
  const item = getAdminMenuItem(id);
  const language = normalizeAdminLocale(locale);
  return item?.labels?.[language] || item?.labels?.ko || String(id || '');
}

export function getAdminMenuGroup(id) {
  return GROUP_BY_ID.get(String(id || '').trim()) || null;
}

export function getAdminMenuGroupLabel(id, locale = 'ko') {
  const group = getAdminMenuGroup(id);
  const language = normalizeAdminLocale(locale);
  return group?.labels?.[language] || group?.labels?.ko || String(id || '');
}

export function getAdminMenuGroupForSection(section) {
  return getAdminMenuItem(section)?.group || 'home';
}

export function getAdminMenuGroupDefault(id) {
  const group = getAdminMenuGroup(id);
  return group?.defaultSection || 'campus';
}

export function adminMenuGroups() {
  return ADMIN_MENU_GROUPS.map(group => group.id);
}

export function adminMenuOrder() {
  return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id);
}
