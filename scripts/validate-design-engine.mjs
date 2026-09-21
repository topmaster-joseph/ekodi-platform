import { readFile } from 'node:fs/promises';
import { ADMIN_MENU_GROUPS, ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readJson = async (path) => JSON.parse(await readText(path));

const [policy, userDna, userShell, theme, adminRuntime, adminCss, adminPrinciples, sidebar, authenticatedShell, build, siteWorker, postbuild, userAiEntry] = await Promise.all([
  readJson('config/design-engine.json'),
  readJson('config/user-ui-dna.json'),
  readJson('config/user-ui-shell.json'),
  readJson('shell/theme.json'),
  readText('admin-design-engine.js'),
  readText('admin-design-engine.css'),
  readText('ADMIN_UI_PRINCIPLES.md'),
  readText('admin-sidebar.js'),
  readText('admin-authenticated-shell.js'),
  readText('scripts/build.mjs'),
  readText('site-worker.js'),
  readText('scripts/admin-performance-postbuild.mjs'),
  readText('shell/user-ai-entry.js'),
]);

const errors = [];
const expectedAxes = ['summary', 'services', 'sites', 'people', 'content', 'status', 'settings-records'];
const expectedLabels = ['통합현황', '서비스', '사이트', '사용자·권한', '콘텐츠·운영', '상태·배포', '설정·기록'];
const actualAxes = ADMIN_MENU_GROUPS.map(group => group.id);
const actualLabels = ADMIN_MENU_GROUPS.map(group => group.labels?.ko);

if (policy?.name !== 'EKODI Design Engine') errors.push('design-engine policy must use the canonical EKODI Design Engine name.');
const constructionStandard = policy?.constructionStandard ?? {};
const requiredConstructionDimensions = ['ease','locality','readability','originality','intuitiveness'];
const requiredConstructionModes = ['communication-first','personalization'];
if (constructionStandard.scope !== 'all-ekodi-sites-subservices-and-admin-surfaces') errors.push('universal construction standard must cover all EKODI sites, subservices and admin surfaces.');
if (constructionStandard.inheritance !== 'mandatory-default') errors.push('universal construction standard must be inherited by default.');
for (const dimension of requiredConstructionDimensions) {
  if (!constructionStandard.dimensions?.includes(dimension)) errors.push(`universal construction standard is missing dimension "${dimension}".`);
}
for (const mode of requiredConstructionModes) {
  if (!constructionStandard.modes?.includes(mode)) errors.push(`universal construction standard is missing mode "${mode}".`);
}
if (!String(constructionStandard.completionGate || '').includes('not complete')) errors.push('universal construction standard must define a completion gate.');

if (JSON.stringify(policy?.admin?.primaryAxes) !== JSON.stringify(expectedAxes)) errors.push('design-engine policy must define exactly seven admin areas.');
if (JSON.stringify(actualAxes) !== JSON.stringify(expectedAxes)) errors.push(`admin registry axes drifted: ${actualAxes.join(', ')}`);
if (JSON.stringify(actualLabels) !== JSON.stringify(expectedLabels)) errors.push(`admin registry Korean labels drifted: ${actualLabels.join(', ')}`);

const validAxes = new Set(expectedAxes);
for (const item of ADMIN_MENU_REGISTRY) {
  if (!validAxes.has(item.group)) errors.push(`admin menu "${item.id}" uses noncanonical group "${item.group}".`);
}
for (const group of ADMIN_MENU_GROUPS) {
  const target = ADMIN_MENU_REGISTRY.find(item => item.id === group.defaultSection && item.group === group.id && !item.internal);
  if (!target) errors.push(`admin group "${group.id}" has invalid default section "${group.defaultSection}".`);
}

if (Number(policy?.version) < 5 || Number(policy?.admin?.generation) !== 8) errors.push('design policy v5+ and the 8th-generation admin contract are required.');
if (policy?.admin?.desktopPrimarySidebarScroll !== false) errors.push('desktop primary sidebar scrolling must remain disabled.');
if (policy?.admin?.scrollContract?.workspace !== 'single-vertical-scroll-owner') errors.push('workspace must be the single vertical scroll owner in policy.');
if (!Array.isArray(policy?.admin?.regions) || policy.admin.regions.length !== 4) errors.push('admin design policy must define exactly four shell regions.');
if (!Array.isArray(policy?.admin?.navigationLevels) || policy.admin.navigationLevels.length !== 3) errors.push('admin design policy must define exactly three navigation levels.');
if (!adminRuntime.includes("nav.style.setProperty('overflow-y', 'hidden', 'important')")) errors.push('admin design runtime must override vertical sidebar scrolling.');
if (!adminRuntime.includes("nav.dataset.ekodiIndependentScroll = 'false'")) errors.push('admin design runtime must declare primary sidebar as non-independent scroll.');
if (!adminRuntime.includes("workspace must own vertical scrolling")) errors.push('admin design runtime must audit the workspace scroll owner.');
if (!adminCss.includes('overflow-y:hidden!important')) errors.push('admin design CSS must keep the primary sidebar overflow hidden.');
if (!adminCss.includes('overflow-y:auto!important')) errors.push('admin design CSS must keep the workspace as vertical scroll owner.');
if (sidebar.includes('overflow-y:auto!important')) errors.push('shared admin sidebar source must not reintroduce independent vertical scrolling.');
if (!sidebar.includes('overflow-y:hidden!important')) errors.push('shared admin sidebar source must keep vertical overflow hidden.');
if (authenticatedShell.includes("nav.dataset.ekodiIndependentScroll = 'true'") || authenticatedShell.includes("nav.style.setProperty('overflow-y', 'auto'")) errors.push('authenticated shell must not reintroduce sidebar scrolling.');
if (!authenticatedShell.includes("nav.dataset.ekodiIndependentScroll='false'") || !authenticatedShell.includes("main.dataset.ekodiScrollOwner='workspace'")) errors.push('authenticated shell must declare the canonical scroll ownership contract.');
if (!authenticatedShell.includes("'admin-design-engine.css'")) errors.push('authenticated shell must preload the canonical design surface before first visible admin paint.');
for (const asset of ['admin-design-engine.js', 'admin-design-engine.css']) {
  if (!build.includes(`'${asset}'`)) errors.push(`production build must publish ${asset}.`);
  if (!siteWorker.includes(`'/${asset}'`)) errors.push(`site worker ADMIN_ASSETS must expose ${asset}.`);
  if (!postbuild.includes(`'${asset}'`)) errors.push(`admin asset fingerprint must include ${asset}.`);
}
if (!/\['admin-menu-registry\.js', \[[^\]]*'admin-design-engine\.js'[^\]]*'platform-maturity-admin\.js'[^\]]*\]\]/.test(postbuild)) errors.push('admin registry must version-pin both the Design Engine and Platform Maturity runtime imports.');
if (!adminCss.includes('[data-ekodian-character]')) errors.push('admin design CSS must contain the EKODIAN character layer.');
if (!adminCss.includes('@media(prefers-reduced-motion:reduce)')) errors.push('admin character layer must respect reduced-motion preferences.');

for (const marker of ['8세대 공통 쉘은 ChatGPT형 좌측 내비게이션 + 우측 작업공간 + 하단 대화창으로 구성한다', '용이성 · 지역성·현장성 · 가독성 · 독창성 · 직관성 · 소통형 · 맞춤형', 'EKODI Design Engine 계층', '내비게이션은 최대 세 단계까지만 허용한다', '서비스 개성은 Shell 교체가 아니라 Theme Token으로 표현한다', '공통 UI의 소유권을 코드 수준에서 분리한다']) {
  if (!adminPrinciples.includes(marker)) errors.push(`admin UI principles lost design-engine marker: ${marker}`);
}

const categories = policy?.evidence?.publicUser?.categories ?? [];
const placementTotal = categories.reduce((sum, category) => sum + Number(category.placements || 0), 0);
if (categories.length < 3) errors.push('public design evidence must include UX, navigation and visual-design award categories.');
if (placementTotal !== Number(policy?.evidence?.publicUser?.placementTotal)) errors.push('public award placement total does not match category totals.');
if (placementTotal < 30) errors.push('public design evidence sample is too small for the current baseline.');
const weightTotal = categories.reduce((sum, category) => sum + Number(category.weight || 0), 0);
if (Math.abs(weightTotal - 1) > 0.0001) errors.push(`public evidence weights must sum to 1; received ${weightTotal}.`);
for (const category of categories) {
  if (!String(category.source || '').startsWith('https://')) errors.push(`design evidence category "${category.id}" is missing an HTTPS source.`);
  if (!Array.isArray(category.adopt) || category.adopt.length < 3) errors.push(`design evidence category "${category.id}" needs reusable adoption rules.`);
}

if (userShell?.principles?.persistentChromeHeaderFooterOnly !== true) errors.push('user shell must keep persistent chrome to shared header and footer only.');
if (userShell?.header?.owner !== 'shared-shell' || userShell?.footer?.owner !== 'shared-shell') errors.push('user shared header/footer ownership drifted.');
if (userShell?.adminExcluded !== true) errors.push('user shell must remain excluded from admin surfaces.');
if (!Array.isArray(userDna?.shared?.mustVary) || userDna.shared.mustVary.length < 7) errors.push('user UI DNA must preserve service-specific visual variation.');
if (!theme?.services || Object.keys(theme.services).length < 10) errors.push('shell theme must keep service-specific identities instead of one universal skin.');

const universalSitePrinciples = policy?.user?.universalSitePrinciples ?? {};
const requiredExperienceDimensions = requiredConstructionDimensions;
for (const dimension of requiredExperienceDimensions) {
  const entry = universalSitePrinciples?.dimensions?.[dimension];
  if (!entry?.ko || !Array.isArray(entry?.rules) || entry.rules.length < 3) errors.push(`universal site experience principle "${dimension}" must have a Korean label and at least three enforceable rules.`);
}
if (universalSitePrinciples?.scope !== 'all-user-facing-sites-and-subservices') errors.push('universal site experience principles must apply to all user-facing sites and subservices.');
if (universalSitePrinciples?.inheritsConstructionStandard !== true) errors.push('user-facing sites must inherit the universal construction standard.');
if (universalSitePrinciples?.communicationFirst?.required !== true) errors.push('all user-facing sites must inherit communication-first UX.');
if (universalSitePrinciples?.communicationFirst?.assistant?.persistentFloating !== false || universalSitePrinciples?.communicationFirst?.assistant?.contentOverlapForbidden !== true) errors.push('communication-first assistant must remain user-initiated, non-floating and non-overlapping.');
if (universalSitePrinciples?.personalization?.mode !== 'progressive-consent-based' || universalSitePrinciples?.personalization?.anonymousBaseline !== 'fully-usable') errors.push('site personalization must be progressive, consent-based and fully usable anonymously.');
if (universalSitePrinciples?.personalization?.sensitiveInferenceForbidden !== true || universalSitePrinciples?.personalization?.authorizationUnaffected !== true || universalSitePrinciples?.personalization?.explainableAndReversible !== true) errors.push('site personalization must not infer sensitive traits, alter authorization, or become irreversible.');
if (userAiEntry.includes('.ekodi-user-ai-entry{position:fixed')) errors.push('shared User AI entry must not float over site content.');
if (!userAiEntry.includes("insertBefore(root,footer)")) errors.push('shared User AI entry must be inserted into document flow before the footer when available.');

const adminExperience = policy?.admin?.experienceStandard ?? {};
if (adminExperience.inheritsConstructionStandard !== true) errors.push('admin surfaces must inherit the universal construction standard.');
if (adminExperience.communicationFirst?.required !== true) errors.push('admin surfaces must inherit communication-first operation.');
if (adminExperience.personalization?.required !== true || adminExperience.personalization?.authorizationUnaffected !== true) errors.push('admin personalization must be required and must not alter authorization.');
for (const principle of ['ease','readability','intuitiveness','communication-first','personalization','locality','originality']) {
  if (!adminExperience.priorityOrder?.includes(principle)) errors.push(`admin experience standard is missing "${principle}".`);
}

const adminCharacter = policy?.admin?.character ?? {};
const userCharacter = policy?.user?.character ?? {};
if (adminCharacter.persistentFloating !== false || adminCharacter.contentOverlapForbidden !== true) errors.push('admin EKODIAN policy must forbid persistent floating overlap.');
if (userCharacter.persistentFloating !== false || userCharacter.contentOverlapForbidden !== true) errors.push('user EKODIAN policy must forbid persistent floating overlap.');
if (userCharacter.fallback !== 'fully-usable-without-character') errors.push('user surfaces must remain fully usable without the character layer.');

if (Number(policy?.defectPromotion?.repeatThreshold) !== 2) errors.push('repeated design defects must promote to a shared guardrail after two occurrences.');
for (const defect of ['top whitespace', 'sidebar scroll', 'mobile clipping', 'character overlap']) {
  if (!policy?.defectPromotion?.promoteToSharedGuardrail?.includes(defect)) errors.push(`shared defect promotion is missing "${defect}".`);
}

if (errors.length) {
  console.error('❌ EKODI Design Engine validation failed');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`✅ EKODI Design Engine validation passed: ${expectedAxes.length} admin axes, ${placementTotal} public award placements, shared character guardrails active.`);
