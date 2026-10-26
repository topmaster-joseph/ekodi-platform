import './platform-maturity-admin.js';
import './domain-control-admin.js';
import './admin-menu-templates.js';
import './admin-service-handoffs.js';
import './admin-context-shell-recovery.js';

// ADMIN-IA-V3 + ADMIN-LAYOUT-3L-001: platform-only super admin.
// 1차 group and 2차 menu are on the left; the active menu's 3차 detail routes are a
// button strip at the top of the workspace; settings render below it. Every detail
// route is an existing section id, so content wiring and deep links stay intact.
export const ADMIN_LAYOUT_MODEL = 'left-group-menu-top-detail-v1';
export const ADMIN_MENU_GROUPS = Object.freeze([
  { id: 'home', icon: '⌂', defaultSection: 'platform-overview', labels: { ko: '홈', en: 'Home' } },
  { id: 'sites', icon: '▦', defaultSection: 'sites-all', labels: { ko: '사이트관리', en: 'Site Management' } },
  { id: 'ai', icon: 'AI', defaultSection: 'aiops', labels: { ko: 'AI 운영', en: 'AI Operations' } },
  { id: 'services', icon: '◇', defaultSection: 'engine-all', labels: { ko: '서비스·엔진', en: 'Services & Engines' } },
  { id: 'finance', icon: '₩', defaultSection: 'finance', labels: { ko: '재무', en: 'Finance' } },
  { id: 'ops', icon: '◎', defaultSection: 'deployments', labels: { ko: '운영·안정성', en: 'Operations & Reliability' } },
  { id: 'settings', icon: '⚙', defaultSection: 'public-site-controls', labels: { ko: '설정·연동', en: 'Settings & Integrations' } },
  { id: 'accounts', icon: '§', defaultSection: 'users-access', labels: { ko: '계정·보안', en: 'Accounts & Security' } },
]);

export const ADMIN_MENUS = Object.freeze([
  { id: 'dashboard', group: 'home', labels: { ko: '플랫폼 현황', en: 'Platform Overview' }, sections: ['platform-overview'] },
  // 사이트관리 2차 = site classification. Its 3차 strip lists the sites of that class
  // (campus-actions.js) and the selected site's own admin menus render below as
  // hand-off links to that site's canonical /{site}/admin root (ADMIN-SITE-HIERARCHY).
  { id: 'site-class-all', group: 'sites', siteClass: true, labels: { ko: '전체 사이트', en: 'All Sites' }, sections: ['sites-all'] },
  { id: 'site-class-core', group: 'sites', siteClass: true, labels: { ko: '핵심·접근', en: 'Core & Access' }, sections: ['sites-core'] },
  { id: 'site-class-community', group: 'sites', siteClass: true, labels: { ko: '교회·공동체', en: 'Church & Community' }, sections: ['sites-community'] },
  { id: 'site-class-business', group: 'sites', siteClass: true, labels: { ko: '사업·상거래', en: 'Business & Commerce' }, sections: ['sites-business'] },
  { id: 'site-class-clients', group: 'sites', siteClass: true, labels: { ko: '고객·협력', en: 'Clients & Partners' }, sections: ['sites-clients'] },
  { id: 'site-class-knowledge', group: 'sites', siteClass: true, labels: { ko: '지식·콘텐츠', en: 'Knowledge & Content' }, sections: ['sites-knowledge'] },
  { id: 'site-class-communication', group: 'sites', siteClass: true, labels: { ko: '소통·클라우드', en: 'Communication & Cloud' }, sections: ['sites-communication'] },
  { id: 'site-class-worklife', group: 'sites', siteClass: true, labels: { ko: '업무·생활', en: 'Work & Life' }, sections: ['sites-worklife'] },
  { id: 'site-class-other', group: 'sites', siteClass: true, labels: { ko: '기타', en: 'Other' }, sections: ['sites-other'] },
  { id: 'site-class-preparing', group: 'sites', siteClass: true, labels: { ko: '준비·비공개', en: 'Preparing & Private' }, sections: ['sites-preparing'] },
  { id: 'menu-templates', group: 'sites', labels: { ko: '관리자 메뉴 템플릿', en: 'Admin Menu Templates' }, sections: ['menu-templates'] },
  { id: 'control', group: 'ai', labels: { ko: 'AI 운영센터', en: 'AI Operations Center' }, sections: ['aiops'] },
  { id: 'automation-policy', group: 'ai', labels: { ko: 'AI 정책·사용 등급', en: 'AI Policies & Usage Tiers' }, sections: ['ai-settings', 'ai-membership'] },
  { id: 'engines', group: 'services', labels: { ko: '서비스 엔진', en: 'Service Engines' }, sections: ['engine-all', 'engine-core', 'engine-common', 'engine-operations', 'engine-professional', 'engine-ai', 'engine-integration', 'engine-preview'] },
  { id: 'platform-content', group: 'services', labels: { ko: '플랫폼 콘텐츠 서비스', en: 'Platform Content Services' }, sections: ['books', 'devotional', 'social', 'work'] },
  { id: 'revenue', group: 'finance', labels: { ko: '결제·정산', en: 'Payments & Settlement' }, sections: ['finance'] },
  { id: 'usage', group: 'finance', labels: { ko: '사용량·비용', en: 'Usage & Cost' }, sections: ['api-cost'] },
  { id: 'infrastructure-costs', group: 'finance', labels: { ko: '비용·인프라 관리', en: 'Infrastructure & Billing' }, sections: ['infra-costs'] },
  { id: 'health', group: 'ops', labels: { ko: '운영상태', en: 'Operational Health' }, sections: ['site-health'] },
  { id: 'domain-watch', group: 'ops', labels: { ko: '도메인', en: 'Domains' }, sections: ['domain-control'] },
  { id: 'releases', group: 'ops', labels: { ko: '배포·장애', en: 'Releases & Incidents' }, sections: ['deployments'] },
  { id: 'system', group: 'ops', labels: { ko: '시스템 구조', en: 'System Structure' }, sections: ['architecture', 'maturity'] },
  { id: 'infra', group: 'ops', labels: { ko: '실행 인프라', en: 'Execution Infrastructure' }, sections: ['devices', 'pos-agent'] },
  { id: 'design', group: 'settings', labels: { ko: '디자인·언어', en: 'Design & Language' }, sections: ['public-site-controls', 'language-status'] },
  { id: 'integrations', group: 'settings', labels: { ko: '연동·저장소', en: 'Integrations & Storage' }, sections: ['ai-module-spec', 'storage'] },
  { id: 'identity', group: 'accounts', labels: { ko: '계정·권한', en: 'Accounts & Access' }, sections: ['users-access', 'admins'] },
  { id: 'security', group: 'accounts', labels: { ko: '보안·감사', en: 'Security & Audit' }, sections: ['security', 'audit-records'] },
]);

export const ADMIN_MENU_REGISTRY = Object.freeze([
  { id: 'platform-overview', group: 'home', icon: '◉', delegateSection: 'health', labels: { ko: '플랫폼 전체현황', en: 'Platform Overview' } },
  { id: 'command-home', group: 'home', icon: '⌘', labels: { ko: '에코디와 대화하기', en: 'Talk with EKODI' }, internal: true },

  { id: 'engine-all', group: 'services', icon: '▦', delegateSection: 'common-services', engineCategory: 'all', labels: { ko: '전체 서비스·엔진', en: 'All Services & Engines' } },
  { id: 'engine-core', group: 'services', icon: '◆', delegateSection: 'common-services', engineCategory: 'core', labels: { ko: '핵심 엔진', en: 'Core Engines' } },
  { id: 'engine-common', group: 'services', icon: '◇', delegateSection: 'common-services', engineCategory: 'common', labels: { ko: '공통 엔진', en: 'Common Engines' } },
  { id: 'engine-operations', group: 'services', icon: '⚙', delegateSection: 'common-services', engineCategory: 'operations', labels: { ko: '운영 엔진', en: 'Operations Engines' } },
  { id: 'engine-professional', group: 'services', icon: 'P', delegateSection: 'common-services', engineCategory: 'professional', labels: { ko: '전문 엔진', en: 'Professional Engines' } },
  { id: 'engine-ai', group: 'services', icon: 'AI', delegateSection: 'common-services', engineCategory: 'ai', labels: { ko: 'AI 엔진', en: 'AI Engines' } },
  { id: 'engine-integration', group: 'services', icon: '↔', delegateSection: 'common-services', engineCategory: 'integration', labels: { ko: '연동 엔진', en: 'Integration Engines' } },
  { id: 'engine-preview', group: 'services', icon: '…', delegateSection: 'common-services', engineCategory: 'preview', labels: { ko: '체험·준비 중', en: 'Preview & Preparing' } },
  { id: 'service-modules', group: 'services', icon: '✓', delegateSection: 'common-services', engineCategory: 'service-modules', labels: { ko: '공통·전문 모듈 점검', en: 'Common & Professional Modules' }, internal: true },

  { id: 'sites-all', group: 'sites', icon: '▦', delegateSection: 'campus', siteGroup: 'all', labels: { ko: '전체 사이트', en: 'All Sites' } },
  { id: 'sites-core', group: 'sites', icon: '◆', delegateSection: 'campus', siteGroup: 'core', labels: { ko: '핵심·접근', en: 'Core & Access Sites' } },
  { id: 'sites-business', group: 'sites', icon: 'B', delegateSection: 'campus', siteGroup: 'business', labels: { ko: '사업·상거래', en: 'Business & Commerce' } },
  { id: 'sites-community', group: 'sites', icon: '◌', delegateSection: 'campus', siteGroup: 'community', labels: { ko: '교회·공동체', en: 'Church & Community' } },
  { id: 'sites-clients', group: 'sites', icon: 'C', delegateSection: 'campus', siteGroup: 'clients', labels: { ko: '고객·협력', en: 'Clients & Brands' } },
  { id: 'sites-knowledge', group: 'sites', icon: 'K', delegateSection: 'campus', siteGroup: 'knowledge', labels: { ko: '지식·콘텐츠', en: 'Knowledge & Content' } },
  { id: 'sites-communication', group: 'sites', icon: '✉', delegateSection: 'campus', siteGroup: 'communication', labels: { ko: '소통·클라우드', en: 'Communication & Cloud' } },
  { id: 'sites-worklife', group: 'sites', icon: 'W', delegateSection: 'campus', siteGroup: 'worklife', labels: { ko: '업무·생활', en: 'Work & Life' } },
  { id: 'sites-other', group: 'sites', icon: '…', delegateSection: 'campus', siteGroup: 'other', labels: { ko: '기타', en: 'Other' } },
  { id: 'menu-templates', group: 'sites', icon: '☰', labels: { ko: '관리자 메뉴 템플릿', en: 'Admin Menu Templates' }, superAdminOnly: true },
  { id: 'sites-preparing', group: 'sites', icon: '◔', delegateSection: 'campus', siteRelation: 'preparing', labels: { ko: '준비·비공개', en: 'Preparing & Private' } },

  { id: 'sites-internal', group: 'sites', icon: 'I', delegateSection: 'campus', siteRelation: 'internal', labels: { ko: '내부 사이트', en: 'Internal Sites' }, internal: true },
  { id: 'sites-user', group: 'sites', icon: 'U', delegateSection: 'campus', siteRelation: 'user', labels: { ko: '사용자 사이트', en: 'User Sites' }, internal: true },
  { id: 'sites-customer-partner', group: 'sites', icon: 'C', delegateSection: 'campus', siteRelation: 'customer-partner', labels: { ko: '고객·협력 사이트', en: 'Customer & Partner Sites' }, internal: true },
  { id: 'sites-independent', group: 'sites', icon: 'D', delegateSection: 'campus', siteRelation: 'independent', labels: { ko: '독립 사이트', en: 'Independent Sites' }, internal: true },

  { id: 'users-access', group: 'accounts', icon: 'U', delegateSection: 'clients', labels: { ko: '전체 사용자·접근', en: 'All Users & Access' }, risk: 'high' },
  { id: 'security', group: 'accounts', icon: 'S', labels: { ko: '보안·인증 기록', en: 'Security & Identity Records' }, risk: 'high' },
  { id: 'admins', group: 'accounts', icon: '♙', labels: { ko: '관리자 계정·권한', en: 'Administrator Accounts & Access' }, risk: 'high', superAdminOnly: true },
  { id: 'ai-membership', group: 'ai', icon: '◈', labels: { ko: '사용자 AI 등급·한도', en: 'User AI Tiers & Limits' }, risk: 'high' },

  { id: 'work', group: 'services', icon: 'W', labels: { ko: '구인구직·채용', en: 'Jobs & Recruiting' }, href: 'https://ekodi.kr/work/admin', adminHandoff: true },
  { id: 'communication', group: 'sites', icon: '✉', labels: { ko: '일정·알림·메시지', en: 'Schedules, Alerts & Messages' }, internal: true, ownedBy: 'site-admin' },
  { id: 'community', group: 'sites', icon: '◌', labels: { ko: '행사·신청·예약', en: 'Events, Applications & Reservations' }, internal: true, ownedBy: 'site-admin' },
  { id: 'books', group: 'services', icon: 'B', labels: { ko: 'EKODI Books 출판', en: 'EKODI Books Publishing' } },
  { id: 'devotional', group: 'services', icon: 'V', labels: { ko: '묵상 자동게시', en: 'Devotional Autopost' } },
  { id: 'social', group: 'services', icon: '↗', labels: { ko: '방송·채널·자동게시', en: 'Broadcast, Channels & Autopost' } },
  { id: 'finance', group: 'finance', icon: '₩', labels: { ko: '결제·회계 운영', en: 'Finance Operations' }, risk: 'high' },
  { id: 'tax', group: 'finance', icon: 'T', labels: { ko: '세금·증빙', en: 'Tax & Evidence' }, href: 'https://ekodi.kr/tax', adminHandoff: true, internal: true },

  // Merged duplicate: 홈 › 플랫폼 현황 (platform-overview) shows this same panel.
  { id: 'health', group: 'ops', icon: '◉', labels: { ko: '전체 운영상태', en: 'Overall Operational Health' }, internal: true, mergedInto: 'platform-overview' },
  { id: 'site-health', group: 'ops', icon: '✓', labels: { ko: '사이트 자동점검', en: 'Site Health Checks' }, superAdminOnly: true },
  { id: 'deployments', group: 'ops', icon: '↑', labels: { ko: '배포·변경 이력', en: 'Deployments & Change History' }, risk: 'high' },
  { id: 'aiops', group: 'ai', icon: 'AI', labels: { ko: 'AI 운영센터', en: 'AI Operations Center' }, risk: 'high', governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'devices', group: 'ops', icon: 'D', labels: { ko: '실행 인프라', en: 'Execution Infrastructure' }, risk: 'high', governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'pos-agent', group: 'ops', icon: 'POS', labels: { ko: 'POS Agent 설치·관리', en: 'POS Agent Install & Management' }, risk: 'high', superAdminOnly: true, governance: { track: 'agent', changeClass: 'yellow', authorityContext: 'Person + Workspace + Role + Capability', controlPlane: true, globalPolicyMutation: 'super_admin' } },
  { id: 'api-cost', group: 'finance', icon: '₩', labels: { ko: '사용량·비용', en: 'Usage & Cost' } },
  { id: 'infra-costs', group: 'finance', icon: '▤', labels: { ko: '비용·인프라 관리', en: 'Infrastructure & Billing' }, superAdminOnly: true, risk: 'high' },
  { id: 'architecture', group: 'ops', icon: '◇', labels: { ko: '시스템 구조', en: 'System Structure' } },
  { id: 'maturity', group: 'ops', icon: 'M5', labels: { ko: '플랫폼 성숙도', en: 'Platform Maturity' }, superAdminOnly: true },
  { id: 'domain-control', group: 'ops', icon: '◎', labels: { ko: '도메인 관제', en: 'Domain Monitoring' }, superAdminOnly: true },
  { id: 'services', group: 'ops', icon: '▦', labels: { ko: '서비스·지표', en: 'Services & Metrics' }, internal: true },
  { id: 'policies', group: 'accounts', icon: '§', labels: { ko: '정책 내부경로', en: 'Policy Internal Route' }, internal: true },

  { id: 'public-site-controls', group: 'settings', icon: '▤', labels: { ko: '공통 UI·사이트 설정', en: 'Shared UI & Site Settings' }, risk: 'high' },
  { id: 'language-status', group: 'settings', icon: '文', labels: { ko: '언어·번역 설정', en: 'Language & Translation Settings' } },
  { id: 'ai-module-spec', group: 'settings', icon: 'API', labels: { ko: '외부 연동·API', en: 'External Integrations & API' }, risk: 'high' },
  { id: 'storage', group: 'settings', icon: '▣', labels: { ko: '보관함·저장소', en: 'Archive & Storage' }, risk: 'high' },
  { id: 'ai-settings', group: 'ai', icon: '⚙', labels: { ko: 'AI·자동화 정책', en: 'AI & Automation Policies' }, risk: 'high', governance: { track:'agent', changeClass:'yellow', controlPlane:true, globalPolicyMutation:'super_admin' } },
  { id: 'audit-records', group: 'accounts', icon: '§', delegateSection: 'aiops', labels: { ko: '운영규칙·변경·감사기록', en: 'Operating Rules, Changes & Audit' }, risk: 'high' },

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
  status: { ko: '상태·점검', en: 'Status & Checks' },
  releases: { ko: '배포·장애', en: 'Releases & Incidents' },
  devices: { ko: '기기·실행', en: 'Devices & Execution' },
  finance: { ko: '결제·비용', en: 'Payments & Costs' },
  security: { ko: '보안·감사', en: 'Security & Audit' },
  settings: { ko: '설정·기록', en: 'Settings & Records' },
  other: { ko: '기타', en: 'Other' },
});
const ADMIN_MENU_CATEGORY_ORDER = Object.freeze({
  home: ['overview','other'],
  sites: ['sites','access','content','other'],
  ai: ['releases','settings','other'],
  services: ['catalog','other'],
  finance: ['finance','other'],
  ops: ['status','releases','devices','other'],
  settings: ['settings','other'],
  accounts: ['access','security','other'],
});
const ADMIN_MENU_SECTION_CATEGORY = Object.freeze({
  'platform-overview':'overview','command-home':'overview',
  'engine-all':'catalog','engine-core':'catalog','engine-common':'catalog','engine-operations':'catalog','engine-professional':'catalog','engine-ai':'catalog','engine-integration':'catalog','engine-preview':'catalog','service-modules':'catalog',
  'sites-all':'sites','menu-templates':'sites','sites-core':'sites','sites-business':'sites','sites-community':'sites','sites-clients':'sites','sites-knowledge':'sites','sites-communication':'sites','sites-worklife':'sites','sites-other':'sites','sites-preparing':'sites','sites-internal':'sites','sites-user':'sites','sites-customer-partner':'sites','sites-independent':'sites',campus:'sites',clients:'sites','site-chrome':'sites',cmpmyi:'sites',organization:'sites',workspace:'sites',
  'users-access':'access',security:'security',admins:'access','ai-membership':'access',
  work:'content',communication:'content',community:'content',books:'content',devotional:'content',social:'content',finance:'finance',tax:'content',
  health:'status','site-health':'status',deployments:'releases',aiops:'releases',devices:'devices','pos-agent':'devices','api-cost':'finance','infra-costs':'finance',architecture:'status',maturity:'status','domain-control':'status',services:'status',
  'public-site-controls':'settings','language-status':'settings','ai-module-spec':'settings',storage:'settings','ai-settings':'settings','audit-records':'security',policies:'settings',
  'common-services':'catalog',confirmations:'catalog','life-ai':'catalog','personal-finance':'catalog',invest:'catalog','marketing-ai':'catalog','supply-network':'catalog',insurance:'catalog',capabilities:'catalog',openai:'catalog',
});

const BY_ID = new Map(ADMIN_MENU_REGISTRY.map(item => [item.id, item]));
const GROUP_BY_ID = new Map(ADMIN_MENU_GROUPS.map(group => [group.id, group]));

export function normalizeAdminLocale(value) { return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'ko'; }
// ADMIN-RISK-GUARD-001: high-risk settings (payments, accounts, security, AI policy,
// integrations, releases, devices) are saved only after an explicit confirmation and
// every save is recorded with a one-step undo where the previous state is known.
export function isAdminRiskSection(id) { return getAdminMenuItem(id)?.risk === 'high'; }
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
const MENU_BY_ID = new Map(ADMIN_MENUS.map(menu => [menu.id, menu]));
const MENU_BY_SECTION = new Map(ADMIN_MENUS.flatMap(menu => menu.sections.map(section => [section, menu])));
export function getAdminMenuForSection(section) { return MENU_BY_SECTION.get(String(section || '').trim()) || null; }
export function getAdminMenuById(id) { return MENU_BY_ID.get(String(id || '').trim()) || null; }
export function getAdminMenuMenuLabel(id, locale = 'ko') { const menu = getAdminMenuById(id); const language = normalizeAdminLocale(locale); return menu?.labels?.[language] || menu?.labels?.ko || String(id || ''); }
export function adminMenusForGroup(group) { return ADMIN_MENUS.filter(menu => menu.group === String(group || '').trim()); }
export function adminMenuTabs(section) { return [...(getAdminMenuForSection(section)?.sections || [])]; }
export function adminMenuOrder() {
  const ordered = ADMIN_MENUS.flatMap(menu => menu.sections).filter(id => { const item = BY_ID.get(id); return item && !item.internal; });
  const seen = new Set(ordered);
  const groupRank = new Map(ADMIN_MENU_GROUPS.map((group, index) => [group.id, index]));
  const rest = ADMIN_MENU_REGISTRY
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.internal && !seen.has(item.id))
    .sort((a, b) => (groupRank.get(a.item.group) ?? 999) - (groupRank.get(b.item.group) ?? 999) || a.index - b.index)
    .map(({ item }) => item.id);
  return [...ordered, ...rest];
}

if (typeof document !== 'undefined') {
  import('./admin-design-engine.js').catch(error => console.warn('[EKODI Admin] design engine bootstrap failed', error));
  import('./ai-operations-center-admin.js').catch(error => console.warn('[EKODI Admin] AI operations center bootstrap failed', error));
  import('./devotional-admin.js').catch(error => console.warn('[EKODI Admin] devotional bootstrap failed', error));
}