export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'overview', icon: '⌂', labels: { ko: '운영 현황', en: 'Operations' } },
  { id: 'campus', icon: '▦', labels: { ko: '사이트 관리', en: 'Site Management' } },
  { id: 'aiops', icon: 'AI', labels: { ko: '운영 AI', en: 'AI Operations' } },
  { id: 'health', icon: '♥', labels: { ko: '서비스 상태', en: 'Service Health' } },
  { id: 'security', icon: 'S', labels: { ko: '보안', en: 'Security' } },
  { id: 'marketing-ai', icon: 'M', labels: { ko: '마케팅 AI', en: 'Marketing AI' } },
  { id: 'work', icon: 'W', labels: { ko: '업무', en: 'Work' } },
  { id: 'finance', icon: '₩', labels: { ko: '결제 · 회계', en: 'Finance & Accounting' } },
  { id: 'communication', icon: '✦', labels: { ko: '메일 · 라이브', en: 'Mail & Live' } },
  { id: 'workspace', icon: '▣', labels: { ko: '클라우드 · 자료', en: 'Cloud & Files' } },
  { id: 'devices', icon: 'D', labels: { ko: '기기 · 장치', en: 'Devices' } },
  { id: 'organization', icon: '◫', labels: { ko: '조직 · 사업', en: 'Organizations' } },
  { id: 'clients', icon: 'C', labels: { ko: '고객 사이트', en: 'Customer Sites' } },
  { id: 'admins', icon: '♜', labels: { ko: '관리자 · 권한', en: 'Administrators & Access' }, superAdminOnly: true },
  { id: 'community', icon: '◎', labels: { ko: '커뮤니티', en: 'Community' } },
  { id: 'books', icon: 'B', labels: { ko: '출판 · 도서', en: 'Books & Publishing' } },
  { id: 'social', icon: 'S', labels: { ko: '소셜', en: 'Social' } },
  { id: 'affiliates', icon: 'A', labels: { ko: '제휴', en: 'Affiliates' } },
  { id: 'architecture', icon: '◇', labels: { ko: '시스템 구조 개요', en: 'System Structure' } },
  { id: 'services', icon: '◉', labels: { ko: '서비스 · 통계', en: 'Services & Metrics' }, internal: true },
  { id: 'deployments', icon: '↥', labels: { ko: '배포', en: 'Deployments' }, internal: true },
  { id: 'policies', icon: '⚙', labels: { ko: '정책', en: 'Policies' }, internal: true }
]);

const BY_ID = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));

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

export function adminMenuOrder() {
  return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id);
}
