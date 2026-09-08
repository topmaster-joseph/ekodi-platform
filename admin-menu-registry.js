export const ADMIN_MENU_GROUPS = Object.freeze([
  { id: 'home', icon: '⌂', defaultSection: 'campus', labels: { ko: '홈', en: 'Home' } },
  { id: 'operations', icon: '✦', defaultSection: 'work', labels: { ko: '운영', en: 'Operations' } },
  { id: 'space', icon: '▣', defaultSection: 'clients', labels: { ko: '공간', en: 'Spaces' } },
  { id: 'services', icon: '◆', defaultSection: 'common-services', labels: { ko: '서비스', en: 'Services' } },
  { id: 'system', icon: '◎', defaultSection: 'health', labels: { ko: '시스템', en: 'System' } },
]);

export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'campus', group: 'home', icon: '⌂', labels: { ko: '관리 홈·사이트', en: 'Admin Home & Sites' } },

  { id: 'work', group: 'operations', icon: 'W', labels: { ko: '업무', en: 'Work' } },
  { id: 'communication', group: 'operations', icon: '✉', labels: { ko: '소통', en: 'Communication' } },
  { id: 'finance', group: 'operations', icon: '₩', labels: { ko: '결제·회계', en: 'Finance & Accounting' } },
  { id: 'tax', group: 'operations', icon: 'T', labels: { ko: '세금·증빙', en: 'Tax & Evidence' }, href: 'https://tax.ekodi.kr/', adminHandoff: true },

  { id: 'clients', group: 'space', icon: 'C', labels: { ko: '고객·운영공간', en: 'Customer & Operating Spaces' } },
  { id: 'organization', group: 'space', icon: '◌', labels: { ko: '조직·협업', en: 'Organizations' } },
  { id: 'workspace', group: 'space', icon: '▧', labels: { ko: '공간·자료', en: 'Spaces & Files' } },

  { id: 'common-services', group: 'services', icon: '▦', labels: { ko: '공통서비스', en: 'Common Services' } },
  { id: 'life-ai', group: 'services', icon: 'Q', labels: { ko: '인생AI', en: 'Life AI' } },
  { id: 'personal-finance', group: 'services', icon: '₩', managementArea: 'professional-services', labels: { ko: '개인재무', en: 'Personal Finance' } },
  { id: 'community', group: 'services', icon: '◎', labels: { ko: '커뮤니티', en: 'Community' } },
  { id: 'books', group: 'services', icon: 'B', labels: { ko: '출판·도서', en: 'Books & Publishing' } },
  { id: 'social', group: 'services', icon: 'S', labels: { ko: '소셜', en: 'Social' } },
  { id: 'devotional', group: 'services', icon: 'V', labels: { ko: '매일묵상', en: 'Daily Devotional' } },
  { id: 'marketing-ai', group: 'services', icon: 'M', labels: { ko: '마케팅AI', en: 'Marketing AI' } },
  { id: 'ai-membership', group: 'services', icon: '◈', labels: { ko: 'AI 회원운영', en: 'AI Membership' } },
  { id: 'supply-network', group: 'services', icon: 'N', managementArea: 'professional-services', labels: { ko: '판매·공급망', en: 'Sales & Supply Network' } },
  { id: 'insurance', group: 'services', icon: 'I', labels: { ko: '보험', en: 'Insurance' } },

  { id: 'public-site-controls', group: 'system', icon: '▤', labels: { ko: '채널·임시페이지', en: 'Channels & Maintenance' } },
  { id: 'language-status', group: 'system', icon: '文', labels: { ko: '다국어 지원 현황', en: 'Language Readiness' } },
  { id: 'architecture', group: 'system', icon: '◇', labels: { ko: '시스템 구조', en: 'System Structure' } },
  { id: 'security', group: 'system', icon: 'S', labels: { ko: '보안·Identity', en: 'Security & Identity' } },
  { id: 'admins', group: 'system', icon: '♙', labels: { ko: '관리자·권한', en: 'Administrators & Access' }, superAdminOnly: true },
  { id: 'ai-module-spec', group: 'system', icon: 'API', labels: { ko: 'AI·API 연동규격', en: 'AI & API Contracts' } },
  { id: 'storage', group: 'system', icon: '▣', labels: { ko: '저장소', en: 'Storage' } },
  { id: 'capabilities', group: 'system', icon: '⚡', labels: { ko: 'Capability Center', en: 'Capability Center' } },
  { id: 'aiops', group: 'system', icon: 'AI', labels: { ko: 'AI·Agent', en: 'AI & Agents' } },
  { id: 'openai', group: 'system', icon: 'O', labels: { ko: 'OpenAI', en: 'OpenAI' }, providerWorkspace: true },
  { id: 'devices', group: 'system', icon: 'D', labels: { ko: '실행 인프라', en: 'Execution Infrastructure' }, governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'health', group: 'system', icon: '◉', labels: { ko: '상태·관측', en: 'Health & Observability' } },
  { id: 'api-cost', group: 'system', icon: '₩', labels: { ko: 'API·비용', en: 'API & Cost' } },
  { id: 'services', group: 'system', icon: '▦', labels: { ko: '서비스·지표', en: 'Services & Metrics' }, internal: true },
  { id: 'deployments', group: 'system', icon: '↑', labels: { ko: '배포', en: 'Deployments' }, internal: true },
  { id: 'policies', group: 'system', icon: '§', labels: { ko: '정책', en: 'Policies' }, internal: true },
]);

const BY_ID = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
const GROUP_BY_ID = new Map(ADMIN_MENU_GROUPS.map(group => [group.id, group]));

export function normalizeAdminLocale(value) { return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ko'; }
export function getAdminMenuItem(id) { return BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuLabel(id, locale = 'ko') { const item = getAdminMenuItem(id); const language = normalizeAdminLocale(locale); return item?.labels?.[language] || item?.labels?.ko || String(id || ''); }
export function getAdminMenuGroup(id) { return GROUP_BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuGroupLabel(id, locale = 'ko') { const group = getAdminMenuGroup(id); const language = normalizeAdminLocale(locale); return group?.labels?.[language] || group?.labels?.ko || String(id || ''); }
export function getAdminMenuGroupForSection(section) { return getAdminMenuItem(section)?.group || 'home'; }
export function getAdminMenuGroupDefault(id) { const group = getAdminMenuGroup(id); if (!group) return 'campus'; const explicit = ADMIN_MENU_REGISTRY.find(item => item.id === group.defaultSection && item.group === group.id && !item.internal && !item.superAdminOnly); if (explicit) return explicit.id; const firstVisibleChild = ADMIN_MENU_REGISTRY.find(item => item.group === group.id && !item.internal && !item.superAdminOnly); return firstVisibleChild?.id || 'campus'; }
export function adminMenuGroups() { return ADMIN_MENU_GROUPS.map(group => group.id); }
export function adminMenuOrder() { return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id); }

if (typeof document !== 'undefined') {
  import('./admin-design-engine.js').catch(error => console.warn('[EKODI Admin] design engine bootstrap failed', error));
  import('./devotional-admin.js').catch(error => console.warn('[EKODI Admin] devotional bootstrap failed', error));
}
