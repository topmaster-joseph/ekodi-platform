import './platform-maturity-admin.js';
import './admin-service-handoffs.js';
import './admin-context-shell-recovery.js';

export const ADMIN_MENU_GROUPS = Object.freeze([
  { id: 'summary', icon: '◉', defaultSection: 'platform-overview', labels: { ko: '통합현황', en: 'Integrated Overview' } },
  { id: 'services', icon: '◇', defaultSection: 'engine-all', labels: { ko: '서비스', en: 'Services' } },
  { id: 'sites', icon: '▦', defaultSection: 'sites-all', labels: { ko: '사이트', en: 'Sites' } },
  { id: 'people', icon: '♙', defaultSection: 'users-access', labels: { ko: '사용자·권한', en: 'Users & Access' } },
  { id: 'content', icon: '▤', defaultSection: 'work', labels: { ko: '콘텐츠·운영', en: 'Content & Operations' } },
  { id: 'status', icon: '↑', defaultSection: 'health', labels: { ko: '상태·배포', en: 'Status & Releases' } },
  { id: 'settings-records', icon: '⚙', defaultSection: 'public-site-controls', labels: { ko: '설정·기록', en: 'Settings & Records' } },
]);

export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'platform-overview', group: 'summary', icon: '◉', delegateSection: 'health', labels: { ko: '통합현황', en: 'Integrated Overview' } },
  { id: 'command-home', group: 'summary', icon: '⌘', labels: { ko: '에코디와 대화하기', en: 'Talk with EKODI' }, internal: true },

  { id: 'engine-all', group: 'services', icon: '▦', delegateSection: 'common-services', engineCategory: 'all', labels: { ko: '전체 엔진', en: 'All Engines' } },
  { id: 'engine-core', group: 'services', icon: '◆', delegateSection: 'common-services', engineCategory: 'core', labels: { ko: '핵심 엔진', en: 'Core Engines' } },
  { id: 'engine-common', group: 'services', icon: '◇', delegateSection: 'common-services', engineCategory: 'common', labels: { ko: '공통 엔진', en: 'Common Engines' } },
  { id: 'engine-operations', group: 'services', icon: '⚙', delegateSection: 'common-services', engineCategory: 'operations', labels: { ko: '운영 엔진', en: 'Operations Engines' } },
  { id: 'engine-professional', group: 'services', icon: 'P', delegateSection: 'common-services', engineCategory: 'professional', labels: { ko: '전문 엔진', en: 'Professional Engines' } },
  { id: 'engine-ai', group: 'services', icon: 'AI', delegateSection: 'common-services', engineCategory: 'ai', labels: { ko: 'AI 엔진', en: 'AI Engines' } },
  { id: 'engine-integration', group: 'services', icon: '↔', delegateSection: 'common-services', engineCategory: 'integration', labels: { ko: '연동 엔진', en: 'Integration Engines' } },
  { id: 'engine-preview', group: 'services', icon: '…', delegateSection: 'common-services', engineCategory: 'preview', labels: { ko: '체험·준비 중', en: 'Preview & Preparing' } },

  { id: 'sites-all', group: 'sites', icon: '▦', delegateSection: 'campus', siteRelation: 'all', labels: { ko: '전체 사이트', en: 'All Sites' } },
  { id: 'sites-internal', group: 'sites', icon: 'I', delegateSection: 'campus', siteRelation: 'internal', labels: { ko: '내부 사이트', en: 'Internal Sites' } },
  { id: 'sites-user', group: 'sites', icon: 'U', delegateSection: 'campus', siteRelation: 'user', labels: { ko: '사용자 사이트', en: 'User Sites' } },
  { id: 'sites-customer-partner', group: 'sites', icon: 'C', delegateSection: 'campus', siteRelation: 'customer-partner', labels: { ko: '고객·협력 사이트', en: 'Customer & Partner Sites' } },
  { id: 'sites-independent', group: 'sites', icon: 'D', delegateSection: 'campus', siteRelation: 'independent', labels: { ko: '독립 사이트', en: 'Independent Sites' } },
  { id: 'sites-preparing', group: 'sites', icon: '…', delegateSection: 'campus', siteRelation: 'preparing', labels: { ko: '준비·비공개 사이트', en: 'Preparing & Private Sites' } },

  { id: 'users-access', group: 'people', icon: 'U', delegateSection: 'clients', labels: { ko: '전체 사용자·사이트별 관리자', en: 'Users & Site Administrators' } },
  { id: 'security', group: 'people', icon: 'S', labels: { ko: '접근·인증 기록', en: 'Access & Identity Records' } },
  { id: 'admins', group: 'people', icon: '♙', labels: { ko: '전체 사용자·관리자', en: 'Users & Administrators' }, superAdminOnly: true },
  { id: 'ai-membership', group: 'people', icon: '◈', labels: { ko: '역할·등급·가입 승인', en: 'Roles, Grades & Approvals' } },

  { id: 'work', group: 'content', icon: 'W', labels: { ko: '운영 중인 작업', en: 'Active Work' } },
  { id: 'communication', group: 'content', icon: '✉', labels: { ko: '일정·알림·소통', en: 'Schedules, Alerts & Communication' } },
  { id: 'community', group: 'content', icon: '◌', labels: { ko: '행사·신청·예약', en: 'Events, Applications & Reservations' } },
  { id: 'books', group: 'content', icon: 'B', labels: { ko: '전체 게시물·미디어', en: 'Posts & Media' } },
  { id: 'devotional', group: 'content', icon: 'V', labels: { ko: '다국어 게시·묵상', en: 'Multilingual Publishing & Devotional' } },
  { id: 'social', group: 'content', icon: '↗', labels: { ko: '방송·채널·자동게시', en: 'Broadcast, Channels & Autopost' } },
  { id: 'finance', group: 'content', icon: '₩', labels: { ko: '결제·회계 운영', en: 'Finance Operations' } },
  { id: 'tax', group: 'content', icon: 'T', labels: { ko: '세금·증빙', en: 'Tax & Evidence' }, href: 'https://ekodi.kr/tax', adminHandoff: true },

  { id: 'health', group: 'status', icon: '◉', labels: { ko: '플랫폼·사이트·엔진 상태', en: 'Platform, Site & Engine Health' } },
  { id: 'deployments', group: 'status', icon: '↑', labels: { ko: '배포 현황·작업 대기열', en: 'Deployments & Queue' } },
  { id: 'aiops', group: 'status', icon: 'AI', labels: { ko: '장애·오류·경고', en: 'Incidents, Errors & Warnings' }, governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'devices', group: 'status', icon: 'D', labels: { ko: '실행 인프라', en: 'Execution Infrastructure' }, governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'api-cost', group: 'status', icon: '₩', labels: { ko: '사용량·비용', en: 'Usage & Cost' } },
  { id: 'architecture', group: 'status', icon: '◇', labels: { ko: '시스템 구조', en: 'System Structure' } },
  { id: 'maturity', group: 'status', icon: 'M5', labels: { ko: '플랫폼 성숙도', en: 'Platform Maturity' }, superAdminOnly: true },
  { id: 'services', group: 'status', icon: '▦', labels: { ko: '서비스·지표', en: 'Services & Metrics' }, internal: true },
  { id: 'policies', group: 'settings-records', icon: '§', labels: { ko: '정책 내부경로', en: 'Policy Internal Route' }, internal: true },

  { id: 'public-site-controls', group: 'settings-records', icon: '▤', labels: { ko: '플랫폼 공통설정', en: 'Platform Settings' } },
  { id: 'language-status', group: 'settings-records', icon: '文', labels: { ko: '다국어 게시 설정', en: 'Language Publishing Settings' } },
  { id: 'ai-module-spec', group: 'settings-records', icon: 'API', labels: { ko: '외부 연동·API', en: 'External Integrations & API' } },
  { id: 'storage', group: 'settings-records', icon: '▣', labels: { ko: '보관함·저장소', en: 'Archive & Storage' } },
  { id: 'ai-settings', group: 'settings-records', icon: '⚙', labels: { ko: '자동화 정책', en: 'Automation Policies' }, governance: { track:'agent', changeClass:'yellow', controlPlane:true, globalPolicyMutation:'super_admin' } },
  { id: 'audit-records', group: 'settings-records', icon: '§', delegateSection: 'aiops', labels: { ko: '운영규칙·변경·감사기록', en: 'Operating Rules, Changes & Audit' } },

  { id: 'campus', group: 'sites', icon: '⌂', labels: { ko: '사이트 관리 원장', en: 'Site Management Registry' }, internal: true },
  { id: 'clients', group: 'sites', icon: 'C', labels: { ko: '사용자·사이트 권한', en: 'Users & Site Access' }, internal: true },
  { id: 'site-chrome', group: 'sites', icon: 'HF', labels: { ko: '사이트 헤더·푸터', en: 'Site Header & Footer' }, superAdminOnly: true, internal: true },
  { id: 'cmpmyi', group: 'sites', icon: '3', labels: { ko: '통합 매장 운영', en: 'Multi-store Operations' }, href: 'https://ekodi.kr/cmpmyi/admin', superAdminOnly: true, internal: true },
  { id: 'organization', group: 'sites', icon: '◌', labels: { ko: '조직·협업', en: 'Organizations' }, internal: true },
  { id: 'workspace', group: 'sites', icon: '▧', labels: { ko: '공간·자료', en: 'Workspaces & Files' }, internal: true },

  { id: 'common-services', group: 'services', icon: '▦', labels: { ko: '서비스 엔진 원장', en: 'Service Engine Registry' }, internal: true },
  { id: 'confirmations', group: 'services', icon: '✓', managementArea: 'common-services', labels: { ko: '지급·수령 확인', en: 'Payment & Receipt Confirmation' }, internal: true },
  { id: 'life-ai', group: 'services', icon: 'Q', labels: { ko: '인생AI', en: 'Life AI' }, internal: true },
  { id: 'personal-finance', group: 'services', icon: '₩', managementArea: 'professional-services', labels: { ko: '개인재무', en: 'Personal Finance' }, internal: true },
  { id: 'invest', group: 'services', icon: 'I', managementArea: 'professional-services', labels: { ko: '투자 AI', en: 'Invest AI' }, internal: true },
  { id: 'marketing-ai', group: 'services', icon: 'M', labels: { ko: '마케팅AI', en: 'Marketing AI' }, internal: true },
  { id: 'supply-network', group: 'services', icon: 'N', managementArea: 'professional-services', labels: { ko: '판매·공급망', en: 'Sales & Supply Network' }, internal: true },
  { id: 'insurance', group: 'services', icon: 'I', labels: { ko: '보험', en: 'Insurance' }, internal: true },
  { id: 'capabilities', group: 'services', icon: '⚡', labels: { ko: 'Capability Center', en: 'Capability Center' }, internal: true },
  { id: 'openai', group: 'services', icon: 'O', labels: { ko: 'OpenAI 작업공간', en: 'OpenAI' }, providerWorkspace: true, internal: true },
]);

export const ADMIN_MENU_CATEGORY_LABELS = Object.freeze({
  overview: { ko: '개요', en: 'Overview' },
  catalog: { ko: '서비스', en: 'Service Catalog' },
  sites: { ko: '사이트', en: 'Sites' },
  access: { ko: '사용자·권한', en: 'Users & Access' },
  content: { ko: '콘텐츠·운영', en: 'Content & Operations' },
  status: { ko: '상태·배포', en: 'Status & Releases' },
  settings: { ko: '설정·기록', en: 'Settings & Records' },
  other: { ko: '기타', en: 'Other' },
});
const ADMIN_MENU_CATEGORY_ORDER = Object.freeze({
  summary: ['overview','other'],
  services: ['catalog','other'],
  sites: ['sites','other'],
  people: ['access','other'],
  content: ['content','other'],
  status: ['status','other'],
  'settings-records': ['settings','other'],
});
const ADMIN_MENU_SECTION_CATEGORY = Object.freeze({
  'platform-overview':'overview','command-home':'overview',
  'engine-all':'catalog','engine-core':'catalog','engine-common':'catalog','engine-operations':'catalog','engine-professional':'catalog','engine-ai':'catalog','engine-integration':'catalog','engine-preview':'catalog',
  'sites-all':'sites','sites-internal':'sites','sites-user':'sites','sites-customer-partner':'sites','sites-independent':'sites','sites-preparing':'sites',campus:'sites',clients:'sites','site-chrome':'sites',cmpmyi:'sites',organization:'sites',workspace:'sites',
  'users-access':'access',security:'access',admins:'access','ai-membership':'access',
  work:'content',communication:'content',community:'content',books:'content',devotional:'content',social:'content',finance:'content',tax:'content',
  health:'status',deployments:'status',aiops:'status',devices:'status','api-cost':'status',architecture:'status',maturity:'status',services:'status',
  'public-site-controls':'settings','language-status':'settings','ai-module-spec':'settings',storage:'settings','ai-settings':'settings','audit-records':'settings',policies:'settings',
  'common-services':'catalog',confirmations:'catalog','life-ai':'catalog','personal-finance':'catalog',invest:'catalog','marketing-ai':'catalog','supply-network':'catalog',insurance:'catalog',capabilities:'catalog',openai:'catalog',
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
export function getAdminMenuGroupForSection(section) { return getAdminMenuItem(section)?.group || 'home'; }
export function getAdminMenuGroupDefault(id) { const group = getAdminMenuGroup(id); if (!group) return 'campus'; const explicit = ADMIN_MENU_REGISTRY.find(item => item.id === group.defaultSection && item.group === group.id && !item.internal && !item.superAdminOnly); if (explicit) return explicit.id; const firstVisibleChild = ADMIN_MENU_REGISTRY.find(item => item.group === group.id && !item.internal && !item.superAdminOnly); return firstVisibleChild?.id || 'campus'; }
export function adminMenuGroups() { return ADMIN_MENU_GROUPS.map(group => group.id); }
export function adminMenuOrder() { return ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.id); }

if (typeof document !== 'undefined') {
  import('./admin-design-engine.js').catch(error => console.warn('[EKODI Admin] design engine bootstrap failed', error));
  import('./ai-operations-center-admin.js').catch(error => console.warn('[EKODI Admin] AI operations center bootstrap failed', error));
  import('./devotional-admin.js').catch(error => console.warn('[EKODI Admin] devotional bootstrap failed', error));
}