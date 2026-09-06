export const ADMIN_MENU_GROUPS = Object.freeze([
  { id: 'structure', icon: '◇', defaultSection: 'campus', labels: { ko: '구조·채널', en: 'Structure & Channels' } },
  { id: 'core', icon: '◎', defaultSection: 'security', labels: { ko: '핵심·Identity', en: 'Core & Identity' } },
  { id: 'common', icon: '▦', defaultSection: 'common-services', labels: { ko: '공통서비스', en: 'Common Services' } },
  { id: 'vertical', icon: '◆', defaultSection: 'life-ai', labels: { ko: '전문서비스', en: 'Vertical Services' } },
  { id: 'tenants', icon: '▣', defaultSection: 'clients', labels: { ko: '운영공간', en: 'Operating Spaces' } },
  { id: 'operations-center', icon: '✦', defaultSection: 'capabilities', labels: { ko: '운영센터', en: 'Operations Center' } },
]);

export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'campus', group: 'structure', icon: '⌂', labels: { ko: '사이트 구조', en: 'Site Structure' } },
  { id: 'public-site-controls', group: 'structure', icon: '▤', labels: { ko: '채널·임시페이지', en: 'Channels & Maintenance' } },
  { id: 'architecture', group: 'structure', icon: '◇', labels: { ko: '시스템 구조', en: 'System Structure' } },
  { id: 'security', group: 'core', icon: 'S', labels: { ko: '보안·Identity', en: 'Security & Identity' } },
  { id: 'admins', group: 'core', icon: '♙', labels: { ko: '관리자·권한', en: 'Administrators & Access' }, superAdminOnly: true },
  { id: 'ai-module-spec', group: 'core', icon: 'API', labels: { ko: 'AI·API 연동규격', en: 'AI & API Contracts' } },
  { id: 'storage', group: 'core', icon: '▣', labels: { ko: '저장소', en: 'Storage' } },
  { id: 'common-services', group: 'common', icon: '▦', labels: { ko: '공통서비스', en: 'Common Services' } },
  { id: 'communication', group: 'common', icon: '✉', labels: { ko: '메일·라이브', en: 'Mail & Live' } },
  { id: 'workspace', group: 'common', icon: '▧', labels: { ko: '공간·자료', en: 'Spaces & Files' } },
  { id: 'finance', group: 'common', icon: '₩', labels: { ko: '결제·회계', en: 'Finance & Accounting' } },
  { id: 'life-ai', group: 'vertical', icon: 'Q', labels: { ko: '인생AI', en: 'Life AI' } },
  { id: 'personal-finance', group: 'vertical', icon: '₩', managementArea: 'professional-services', labels: { ko: '개인재무', en: 'Personal Finance' } },
  { id: 'community', group: 'vertical', icon: '◎', labels: { ko: '커뮤니티', en: 'Community' } },
  { id: 'books', group: 'vertical', icon: 'B', labels: { ko: '출판·도서', en: 'Books & Publishing' } },
  { id: 'social', group: 'vertical', icon: 'S', labels: { ko: '소셜', en: 'Social' } },
  { id: 'devotional', group: 'vertical', icon: 'V', labels: { ko: '매일묵상', en: 'Daily Devotional' } },
  { id: 'marketing-ai', group: 'vertical', icon: 'M', labels: { ko: '마케팅AI', en: 'Marketing AI' } },
  { id: 'ai-membership', group: 'vertical', icon: '◈', labels: { ko: 'AI 회원운영', en: 'AI Membership' } },
  { id: 'tax', group: 'vertical', icon: 'T', labels: { ko: '세금·증빙', en: 'Tax & Evidence' }, href: 'https://tax.ekodi.kr/', adminHandoff: true },
  { id: 'affiliates', group: 'vertical', icon: 'A', labels: { ko: '제휴마케팅', en: 'Affiliate Marketing' } },
  { id: 'work', group: 'tenants', icon: 'W', labels: { ko: '업무공간', en: 'Workspaces' } },
  { id: 'organization', group: 'tenants', icon: '◌', labels: { ko: '조직·협업', en: 'Organizations' } },
  { id: 'clients', group: 'tenants', icon: 'C', labels: { ko: '고객·운영공간', en: 'Customer & Operating Spaces' } },
  { id: 'cheonggye-members', group: 'tenants', icon: '名', labels: { ko: '청계면상인회 정회원', en: 'Cheonggye Members' } },
  { id: 'capabilities', group: 'operations-center', icon: '⚡', labels: { ko: 'Capability Center', en: 'Capability Center' } },
  { id: 'aiops', group: 'operations-center', icon: 'AI', labels: { ko: 'AI·Agent', en: 'AI & Agents' } },
  { id: 'openai', group: 'operations-center', icon: 'O', labels: { ko: 'OpenAI', en: 'OpenAI' }, providerWorkspace: true },
  { id: 'devices', group: 'operations-center', icon: 'D', labels: { ko: '실행 인프라', en: 'Execution Infrastructure' }, governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'health', group: 'operations-center', icon: '◉', labels: { ko: '상태·관측', en: 'Health & Observability' } },
  { id: 'api-cost', group: 'operations-center', icon: '₩', labels: { ko: 'API·비용', en: 'API & Cost' } },
  { id: 'services', group: 'operations-center', icon: '▦', labels: { ko: '서비스·지표', en: 'Services & Metrics' }, internal: true },
  { id: 'deployments', group: 'operations-center', icon: '↑', labels: { ko: '배포', en: 'Deployments' }, internal: true },
  { id: 'policies', group: 'operations-center', icon: '§', labels: { ko: '정책', en: 'Policies' }, internal: true },
]);

const BY_ID = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
const GROUP_BY_ID = new Map(ADMIN_MENU_GROUPS.map(group => [group.id, group]));

export function normalizeAdminLocale(value) { return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ko'; }
export function getAdminMenuItem(id) { return BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuLabel(id, locale = 'ko') { const item = getAdminMenuItem(id); const language = normalizeAdminLocale(locale); return item?.labels?.[language] || item?.labels?.ko || String(id || ''); }
export function getAdminMenuGroup(id) { return GROUP_BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuGroupLabel(id, locale = 'ko') { const group = getAdminMenuGroup(id); const language = normalizeAdminLocale(locale); return group?.labels?.[language] || group?.labels?.ko || String(id || ''); }
export function getAdminMenuGroupForSection(section) { return getAdminMenuItem(section)?.group || 'structure'; }
export function getAdminMenuGroupDefault(id) { const group = getAdminMenuGroup(id); if (!group) return 'campus'; const explicit = ADMIN_MENU_REGISTRY.find(item => item.id === group.defaultSection && item.group === group.id && !item.internal && !item.superAdminOnly); if (explicit) return explicit.id; const firstVisibleChild = ADMIN_MENU_REGISTRY.find(item => item.group === group.id && !item.internal && !item.superAdminOnly); return firstVisibleChild?.id || 'campus'; }
export function adminMenuGroups() { return ADMIN_MENU_GROUPS.map(group => group.id); }
export function adminMenuOrder() { return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id); }

if (typeof document !== 'undefined') {
  import('./devotional-admin.js').catch(error => console.warn('[EKODI Admin] devotional bootstrap failed', error));
}
