import { readFile } from 'node:fs/promises';
import { ADMIN_MENU_GROUPS, ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readJson = async (path) => JSON.parse(await readText(path));

const [policy, userDna, userShell, theme, adminRuntime, adminCss, adminPrinciples] = await Promise.all([
  readJson('config/design-engine.json'),
  readJson('config/user-ui-dna.json'),
  readJson('config/user-ui-shell.json'),
  readJson('shell/theme.json'),
  readText('admin-design-engine.js'),
  readText('admin-design-engine.css'),
  readText('ADMIN_UI_PRINCIPLES.md'),
]);

const errors = [];
const expectedAxes = ['home', 'operations', 'space', 'services', 'system'];
const expectedLabels = ['홈', '운영', '공간', '서비스', '시스템'];
const actualAxes = ADMIN_MENU_GROUPS.map(group => group.id);
const actualLabels = ADMIN_MENU_GROUPS.map(group => group.labels?.ko);

if (policy?.name !== 'EKODI Design Engine') errors.push('design-engine policy must use the canonical EKODI Design Engine name.');
if (JSON.stringify(policy?.admin?.primaryAxes) !== JSON.stringify(expectedAxes)) errors.push('design-engine policy must define exactly five admin axes.');
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

if (policy?.admin?.desktopPrimarySidebarScroll !== false) errors.push('desktop primary sidebar scrolling must remain disabled.');
if (!adminRuntime.includes("nav.style.setProperty('overflow-y', 'hidden', 'important')")) errors.push('admin design runtime must override vertical sidebar scrolling.');
if (!adminRuntime.includes("nav.dataset.ekodiIndependentScroll = 'false'")) errors.push('admin design runtime must declare primary sidebar as non-independent scroll.');
if (!adminCss.includes('overflow-y:hidden!important')) errors.push('admin design CSS must keep the primary sidebar overflow hidden.');
if (!adminCss.includes('[data-ekodian-character]')) errors.push('admin design CSS must contain the EKODIAN character layer.');
if (!adminCss.includes('@media(prefers-reduced-motion:reduce)')) errors.push('admin character layer must respect reduced-motion preferences.');

for (const marker of ['EKODI Design Engine 계층', '캐릭터는 장식이 아니라 기능적 인터페이스다', '반복 수정을 시스템 결함으로 전환한다']) {
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
