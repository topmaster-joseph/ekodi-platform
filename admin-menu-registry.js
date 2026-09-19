import './platform-maturity-admin.js';
import './admin-service-handoffs.js';
import './admin-context-shell-recovery.js';

export const ADMIN_MENU_GROUPS = Object.freeze([
  { id: 'core', icon: '◈', defaultSection: 'command-home', labels: { ko: '핵심코어', en: 'Core' } },
  { id: 'common', icon: '▦', defaultSection: 'common-services', labels: { ko: '공통서비스', en: 'Shared Services' } },
  { id: 'professional', icon: '◆', defaultSection: 'marketing-ai', labels: { ko: '전문서비스', en: 'Professional Services' } },
  { id: 'status', icon: '◉', defaultSection: 'health', labels: { ko: '상태서비스', en: 'Status & Operations' } },
  { id: 'manager', icon: '♙', defaultSection: 'clients', labels: { ko: '중간관리자', en: 'Manager' } },
  { id: 'submanager', icon: '▣', defaultSection: 'campus', labels: { ko: '하위관리자', en: 'Sub-admins' } },
  { id: 'other', icon: '⋯', defaultSection: 'ai-module-spec', labels: { ko: '기타', en: 'Other' } },
]);

export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'command-home', group: 'core', icon: '⌘', labels: { ko: '에코디와 대화하기', en: 'Talk with EKODI' } },
  { id: 'campus', group: 'submanager', icon: '⌂', labels: { ko: '관리 홈·사이트', en: 'Admin Home & Sites' } },

  { id: 'work', group: 'common', icon: 'W', labels: { ko: '업무', en: 'Work' } },
  { id: 'communication', group: 'common', icon: '✉', labels: { ko: '소통', en: 'Communication' } },
  { id: 'finance', group: 'common', icon: '₩', labels: { ko: '결제·회계', en: 'Finance & Accounting' } },
  { id: 'tax', group: 'common', icon: 'T', labels: { ko: '세금·증빙', en: 'Tax & Evidence' }, href: 'https://ekodi.kr/tax', adminHandoff: true },

  { id: 'clients', group: 'manager', icon: 'C', labels: { ko: '고객·운영공간', en: 'Customer & Operating Workspaces' } },
  { id: 'site-chrome', group: 'manager', icon: 'HF', labels: { ko: '사이트 헤더·푸터', en: 'Site Header & Footer' }, superAdminOnly: true },
  { id: 'cmpmyi', group: 'submanager', icon: '3', labels: { ko: '통합 매장 운영', en: 'Multi-store Operations' }, href: 'https://ekodi.kr/cmpmyi/admin', superAdminOnly: true },
  { id: 'organization', group: 'manager', icon: '◌', labels: { ko: '조직·협업', en: 'Organizations' } },
  { id: 'workspace', group: 'manager', icon: '▧', labels: { ko: '공간·자료', en: 'Workspaces & Files' } },

  { id: 'common-services', group: 'common', icon: '▦', labels: { ko: '공통서비스', en: 'Common Services' } },
  { id: 'life-ai', group: 'professional', icon: 'Q', labels: { ko: '인생AI', en: 'Life AI' } },
  { id: 'personal-finance', group: 'professional', icon: '₩', managementArea: 'professional-services', labels: { ko: '개인재무', en: 'Personal Finance' } },
  { id: 'invest', group: 'professional', icon: 'I', managementArea: 'professional-services', labels: { ko: '투자 AI', en: 'Invest AI' } },
  { id: 'community', group: 'common', icon: '◎', labels: { ko: '커뮤니티', en: 'Community' } },
  { id: 'books', group: 'common', icon: 'B', labels: { ko: '출판·도서', en: 'Books & Publishing' } },
  { id: 'social', group: 'common', icon: 'S', labels: { ko: '채널·계정 연결', en: 'Channel Connections' } },
  { id: 'devotional', group: 'common', icon: 'V', labels: { ko: '매일묵상', en: 'Daily Devotional' } },
  { id: 'marketing-ai', group: 'professional', icon: 'M', labels: { ko: '마케팅AI', en: 'Marketing AI' } },
  { id: 'ai-membership', group: 'professional', icon: '◈', labels: { ko: 'AI 회원운영', en: 'AI Membership' } },
  { id: 'supply-network', group: 'professional', icon: 'N', managementArea: 'professional-services', labels: { ko: '판매·공급망', en: 'Sales & Supply Network' } },
  { id: 'insurance', group: 'professional', icon: 'I', labels: { ko: '보험', en: 'Insurance' } },

  { id: 'public-site-controls', group: 'status', icon: '▤', labels: { ko: '공개·점검 전환', en: 'Public & Maintenance Mode' } },
  { id: 'language-status', group: 'status', icon: '文', labels: { ko: '다국어 지원 현황', en: 'Language Readiness' } },
  { id: 'architecture', group: 'core', icon: '◇', labels: { ko: '시스템 구조', en: 'System Structure' } },
  { id: 'maturity', group: 'status', icon: 'M5', labels: { ko: '플랫폼 성숙도', en: 'Platform Maturity' }, superAdminOnly: true },
  { id: 'security', group: 'core', icon: 'S', labels: { ko: '보안·Identity', en: 'Security & Identity' } },
  { id: 'admins', group: 'manager', icon: '♙', labels: { ko: '관리자·권한', en: 'Administrators & Access' }, superAdminOnly: true },
  { id: 'ai-module-spec', group: 'other', icon: 'API', labels: { ko: 'AI·API 연동규격', en: 'AI & API Contracts' } },
  { id: 'storage', group: 'core', icon: '▣', labels: { ko: '저장소', en: 'Storage' } },
  { id: 'capabilities', group: 'core', icon: '⚡', labels: { ko: 'Capability Center', en: 'Capability Center' } },
  { id: 'aiops', group: 'core', icon: 'AI', labels: { ko: 'AI 운영센터', en: 'AI & Agents' }, governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'ai-settings', group: 'core', icon: '⚙', labels: { ko: '에코디 AI 관리', en: 'EKODI AI Management' }, governance: { track:'agent', changeClass:'yellow', controlPlane:true, globalPolicyMutation:'super_admin' } },
  { id: 'openai', group: 'other', icon: 'O', labels: { ko: 'OpenAI 작업공간', en: 'OpenAI' }, providerWorkspace: true },
  { id: 'devices', group: 'core', icon: 'D', labels: { ko: '실행 인프라', en: 'Execution Infrastructure' }, governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'health', group: 'status', icon: '◉', labels: { ko: '상태·관측', en: 'Health & Observability' } },
  { id: 'api-cost', group: 'status', icon: '₩', labels: { ko: 'API·비용', en: 'API & Cost' } },
  { id: 'services', group: 'status', icon: '▦', labels: { ko: '서비스·지표', en: 'Services & Metrics' }, internal: true },
  { id: 'deployments', group: 'status', icon: '↑', labels: { ko: '배포', en: 'Deployments' }, internal: true },
  { id: 'policies', group: 'other', icon: '§', labels: { ko: '정책', en: 'Policies' }, internal: true },
]);

export const ADMIN_MENU_CATEGORY_LABELS = Object.freeze({
  overview: { ko: '개요', en: 'Overview' }, workflow: { ko: '업무·소통', en: 'Work & Communication' },
  finance: { ko: '재무·증빙', en: 'Finance & Evidence' }, customer: { ko: '고객·매장', en: 'Customers & Stores' },
  organization: { ko: '조직·자료', en: 'Organization & Files' }, common: { ko: '공통·생활', en: 'Common & Life' },
  content: { ko: '콘텐츠·커뮤니티', en: 'Content & Community' }, business: { ko: '비즈니스·전문', en: 'Business & Professional' },
  environment: { ko: '공개·환경', en: 'Public & Environment' }, security: { ko: '보안·권한', en: 'Security & Access' },
  ai: { ko: 'AI·자동화', en: 'AI & Automation' }, platform: { ko: '인프라·상태', en: 'Platform & Health' }, other: { ko: '기타', en: 'Other' },
});
const ADMIN_MENU_CATEGORY_ORDER = Object.freeze({
  core: ['overview','security','ai','platform','other'],
  common: ['workflow','finance','common','content','other'],
  professional: ['business','common','other'],
  status: ['environment','platform','other'],
  manager: ['customer','organization','security','other'],
  submanager: ['overview','customer','organization','other'],
  other: ['ai','other'],
});
const ADMIN_MENU_SECTION_CATEGORY = Object.freeze({
  'command-home':'overview', campus:'overview', work:'workflow', communication:'workflow', finance:'finance', tax:'finance',
  clients:'customer', cmpmyi:'customer', organization:'organization', workspace:'organization',
  'common-services':'common', 'life-ai':'common', community:'content', books:'content', social:'content', devotional:'content',
  'personal-finance':'business', invest:'business', 'marketing-ai':'business', 'ai-membership':'business', 'supply-network':'business', insurance:'business',
  'public-site-controls':'environment', 'language-status':'environment', security:'security', admins:'security',
  'ai-module-spec':'ai', capabilities:'ai', aiops:'ai', 'ai-settings':'ai', openai:'ai', architecture:'platform', maturity:'platform', storage:'platform', devices:'platform', health:'platform', 'api-cost':'platform',
  services:'other', deployments:'other', policies:'other',
});

const BY_ID = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
const GROUP_BY_ID = new Map(ADMIN_MENU_GROUPS.map(group => [group.id, group]));

export function normalizeAdminLocale(value) { return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ko'; }
export function getAdminMenuItem(id) { return BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuLabel(id, locale = 'ko') { const item = getAdminMenuItem(id); const language = normalizeAdminLocale(locale); return item?.labels?.[language] || item?.labels?.ko || String(id || ''); }
export function getAdminMenuGroup(id) { return GROUP_BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuGroupLabel(id, locale = 'ko') { const group = getAdminMenuGroup(id); const language = normalizeAdminLocale(locale); return group?.labels?.[language] || group?.labels?.ko || String(id || ''); }
export function getAdminMenuCategory(section) { return ADMIN_MENU_SECTION_CATEGORY[String(section || '').trim()] || 'other'; }
export function getAdminMenuCategoryLabel(category, locale = 'ko') { const language = normalizeAdminLocale(locale); const labels = ADMIN_MENU_CATEGORY_LABELS[category] || ADMIN_MENU_CATEGORY_LABELS.other; return labels?.[language] || labels?.ko || category || 'other'; }
export function adminMenuCategoryOrder(group) { const order = ADMIN_MENU_CATEGORY_ORDER[String(group || '').trim()] || ['other']; return [...order]; }
export function getAdminMenuGroupForSection(section) { return getAdminMenuItem(section)?.group || 'core'; }
export function getAdminMenuGroupDefault(id) { const group = getAdminMenuGroup(id); if (!group) return 'command-home'; const explicit = ADMIN_MENU_REGISTRY.find(item => item.id === group.defaultSection && item.group === group.id && !item.internal && !item.superAdminOnly); if (explicit) return explicit.id; const firstVisibleChild = ADMIN_MENU_REGISTRY.find(item => item.group === group.id && !item.internal && !item.superAdminOnly); return firstVisibleChild?.id || 'command-home'; }
export function adminMenuGroups() { return ADMIN_MENU_GROUPS.map(group => group.id); }
export function adminMenuOrder() { return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id); }

if (typeof document !== 'undefined') {
  import('./admin-design-engine.js').catch(error => console.warn('[EKODI Admin] design engine bootstrap failed', error));
  import('./ai-operations-center-admin.js').catch(error => console.warn('[EKODI Admin] AI operations center bootstrap failed', error));
  import('./devotional-admin.js').catch(error => console.warn('[EKODI Admin] devotional bootstrap failed', error));
}