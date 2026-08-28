export const ADMIN_MENU_GROUPS = Object.freeze([
  { id: 'sites', labels: { ko: '사이트', en: 'Sites' } },
  { id: 'access', labels: { ko: '사용자 · 권한', en: 'Users & Access' } },
  { id: 'operations', labels: { ko: '운영 관리', en: 'Operations' } },
  { id: 'ai', labels: { ko: 'AI · 자동화', en: 'AI & Automation' } },
  { id: 'data', labels: { ko: '데이터 · 분석', en: 'Data & Analytics' } },
  { id: 'system', labels: { ko: '시스템 관리', en: 'System' } },
  { id: 'security-audit', labels: { ko: '보안 · 감사', en: 'Security & Audit' } },
  { id: 'settings', labels: { ko: '설정', en: 'Settings' } },
]);

export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'campus', group: 'sites', icon: '▦', labels: { ko: '사이트 관리', en: 'Site Management' } },
  { id: 'clients', group: 'sites', icon: 'C', labels: { ko: '고객 사이트', en: 'Customer Sites' } },

  { id: 'organization', group: 'access', icon: '◫', labels: { ko: '조직 · 사업', en: 'Organizations' } },
  { id: 'admins', group: 'access', icon: '♜', labels: { ko: '관리자 · 권한', en: 'Administrators & Access' }, superAdminOnly: true },

  { id: 'work', group: 'operations', icon: 'W', labels: { ko: '업무', en: 'Work' } },
  { id: 'finance', group: 'operations', icon: '₩', labels: { ko: '결제 · 회계', en: 'Finance & Accounting' } },
  { id: 'tax', group: 'operations', icon: 'T', labels: { ko: '세금 · 증빙', en: 'Tax & Evidence' }, href: 'https://tax.ekodi.kr/' },
  { id: 'communication', group: 'operations', icon: '✦', labels: { ko: '메일 · 라이브', en: 'Mail & Live' } },
  { id: 'community', group: 'operations', icon: '◎', labels: { ko: '커뮤니티', en: 'Community' } },
  { id: 'books', group: 'operations', icon: 'B', labels: { ko: '출판 · 도서', en: 'Books & Publishing' } },
  { id: 'social', group: 'operations', icon: 'S', labels: { ko: '소셜', en: 'Social' } },
  { id: 'affiliates', group: 'operations', icon: 'A', labels: { ko: '제휴', en: 'Affiliates' } },

  { id: 'aiops', group: 'ai', icon: 'AI', labels: { ko: '운영 AI', en: 'AI Operations' } },
  { id: 'ai-module-spec', group: 'ai', icon: 'API', labels: { ko: '외부 AI 연동규격', en: 'External AI Spec' } },
  { id: 'ai-membership', group: 'ai', icon: '◈', labels: { ko: 'AI 회원운영', en: 'AI Membership' } },
  { id: 'life-ai', group: 'ai', icon: 'Q', labels: { ko: '인생AI', en: 'Life AI' } },
  { id: 'marketing-ai', group: 'ai', icon: 'M', labels: { ko: '마케팅 AI', en: 'Marketing AI' } },

  { id: 'api-cost', group: 'data', icon: '₩', labels: { ko: 'API · 비용 관리', en: 'API & Cost' } },
  { id: 'storage', group: 'data', icon: '▣', labels: { ko: '저장소', en: 'Storage' } },

  { id: 'health', group: 'system', icon: '♥', labels: { ko: '시스템 건강', en: 'System Health' } },
  { id: 'architecture', group: 'system', icon: '◇', labels: { ko: '시스템 구조 개요', en: 'System Structure' } },
  { id: 'devices', group: 'system', icon: 'D', labels: { ko: '기기 관리', en: 'Devices' } },

  { id: 'security', group: 'security-audit', icon: 'S', labels: { ko: '보안', en: 'Security' } },

  { id: 'workspace', group: 'settings', icon: '▣', labels: { ko: '클라우드 · 자료', en: 'Cloud & Files' } },

  { id: 'services', group: 'data', icon: '◉', labels: { ko: '서비스 · 통계', en: 'Services & Metrics' }, internal: true },
  { id: 'deployments', group: 'system', icon: '↥', labels: { ko: '배포', en: 'Deployments' }, internal: true },
  { id: 'policies', group: 'settings', icon: '⚙', labels: { ko: '정책', en: 'Policies' }, internal: true },
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

export function adminMenuGroups() {
  return ADMIN_MENU_GROUPS.map(group => group.id);
}

export function adminMenuOrder() {
  return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id);
}
