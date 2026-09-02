import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';
import { shellServiceForHost, shellServiceForRootPath } from '../ekodi-shell-injector.js';
import { EKODI_USER_FOOTER, renderEkodiUserFooter } from '../config/user-footer.js';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [registry,dna,shell,messageUI,injectorSource,userUiStyle,siteShellSource,shellWorkerSource,clientFooterSource,userLanguageSource,designInheritanceSource,ccmMrSource] = await Promise.all([
  readJson('config/ecosystem-services.json'),
  readJson('config/user-ui-dna.json'),
  readJson('config/user-ui-shell.json'),
  readJson('config/message-ui.json'),
  readText('ekodi-shell-injector.js'),
  readText('shell/user-ui-shell.css'),
  readText('site-shell-worker.js'),
  readText('ekodi-shell-worker.js'),
  readText('shell/user-ui-footer.js'),
  readText('shell/user-language.js'),
  readText('shell/service-design-inheritance.js'),
  readText('shell/ccm-mr-player.js'),
]);

const errors = [];
const services = dna.services ?? {};
const aliases = dna.aliases ?? {};
const userSurfaces = new Set(['public','workspace']);
const renderedFooter = renderEkodiUserFooter();

if (!Array.isArray(dna.shared?.mustKeep) || dna.shared.mustKeep.length < 4) {
  errors.push('UI DNA shared.mustKeep must define the common EKODI family traits.');
}
if (!Array.isArray(dna.shared?.mustVary) || dna.shared.mustVary.length < 5) {
  errors.push('UI DNA shared.mustVary must define the visual dimensions that services vary.');
}

for (const service of registry.services ?? []) {
  if (service.homepage !== true) continue;
  if (!services[service.id] && !aliases[service.id]) {
    errors.push(`Public service "${service.id}" has no UI DNA family or alias.`);
  }
}

const uniqueDimensions = ['family','mood','palette','geometry'];
const ownersByDimension = new Map(uniqueDimensions.map(key=>[key,new Map()]));
for (const [id, profile] of Object.entries(services)) {
  const required = ['family', 'mood', 'palette', 'type', 'geometry', 'density'];
  for (const key of required) {
    if (!profile?.[key]) errors.push(`UI DNA service "${id}" is missing "${key}".`);
  }
  for (const key of uniqueDimensions) {
    const value=String(profile?.[key]||'').trim().toLowerCase();
    if(!value)continue;
    const owners=ownersByDimension.get(key);
    const prior=owners.get(value);
    if(prior)errors.push(`UI DNA ${key} "${profile[key]}" is duplicated by "${prior}" and "${id}". Distinct user sites must not be visual clones.`);
    owners.set(value,id);
  }
}

for (const [id, alias] of Object.entries(aliases)) {
  if (!alias?.target || !services[alias.target]) {
    errors.push(`UI DNA alias "${id}" points to missing target "${alias?.target ?? ''}".`);
  }
}

if (shell?.name !== 'EKODI User UI Shell') errors.push('User UI Shell policy must use the canonical name.');
if (shell?.parentPolicy !== 'config/user-ui-dna.json') errors.push('User UI Shell must explicitly inherit the User UI DNA policy.');
if (shell?.adminExcluded !== true) errors.push('Admin UI must remain outside the User UI Shell contract.');
if (!Array.isArray(shell?.scope) || !['public', 'workspace'].every(surface => shell.scope.includes(surface))) {
  errors.push('User UI Shell must cover public and workspace user surfaces.');
}
if (shell?.principles?.singleSource !== true || shell?.principles?.noDuplicatedHeaderOrFooter !== true) {
  errors.push('User UI Shell must enforce single-source chrome without duplicate headers or footers.');
}
for (const principle of ['subserviceInheritance','fallbackHeaderWhenMissing','legacyCommonFooterSuppressed','rootInternalPathsExcluded','languageChoiceEverywhere','globalUtilitiesInHeader']) {
  if (shell?.principles?.[principle] !== true) errors.push(`User UI Shell principle must remain enabled: ${principle}.`);
}
if (shell?.header?.strategy !== 'adopt-existing-first' || shell?.header?.owner !== 'shared-shell') {
  errors.push('User header must be shared-shell owned and adopt existing service headers first.');
}
if (shell?.header?.fallback !== 'shared-shell-header-when-missing') {
  errors.push('User header must provide the shared fallback header when a page has no service header.');
}
for (const meaning of ['EKODI identity', 'current service context', 'account or My EKODI path', 'language choice']) {
  if (!shell?.header?.requiredMeaning?.includes(meaning)) errors.push(`User header is missing required meaning: ${meaning}`);
}
for (const selector of ['header','.site-header','.topbar','.app-header','.main-header','[data-ekodi-fixed-header]']) {
  if (!shell?.header?.recognizedExistingHeaders?.includes(selector)) errors.push(`User header adoption selector is missing: ${selector}`);
}
if (shell?.footer?.strategy !== 'shell-supplied' || shell?.footer?.owner !== 'shared-shell') {
  errors.push('User footer must be supplied by the shared Shell.');
}
if (shell?.footer?.contentSource !== 'config/user-footer.js') {
  errors.push('User footer text and links must have one central source: config/user-footer.js.');
}
if (shell?.footer?.alignment !== 'center' || !String(shell?.footer?.layout||'').includes('centered')) {
  errors.push('User footer must remain center-aligned across desktop and mobile.');
}
if (!String(shell?.footer?.themePolicy||'').includes('inherit each service')) {
  errors.push('User footer theme policy must preserve each service visual family.');
}
const footerLinks = new Map((EKODI_USER_FOOTER.legalLinks||[]).map(item=>[item.label,item.href]));
if (footerLinks.get('개인정보처리방침') !== 'https://ekodi.kr/privacy' || footerLinks.get('이용약관') !== 'https://ekodi.kr/terms') {
  errors.push('Central user footer legal links must use the canonical EKODI public policies.');
}
if (footerLinks.get('문의') !== 'mailto:ekodibiz@gmail.com' || EKODI_USER_FOOTER.contact?.email !== 'ekodibiz@gmail.com') {
  errors.push('Central user footer contact must use the canonical operator email.');
}
if (EKODI_USER_FOOTER.operator?.businessRegistrationNumber !== '213-13-01959') {
  errors.push('Central user footer operator registration number must match the public EKODI operator record.');
}
if (Number(EKODI_USER_FOOTER.version) < 3 || !renderedFooter.includes('user-shell-v2') || !renderedFooter.includes('ekodi-user-ui-footer__copy')) {
  errors.push('Central user footer renderer must expose the locale-aware centered v3 structure.');
}
for(const marker of ['data-ekodi-i18n="privacy"','data-ekodi-i18n="terms"','data-ekodi-i18n="contact"']){
  if(!renderedFooter.includes(marker))errors.push(`Central user footer lost locale marker: ${marker}`);
}
if (!renderedFooter.includes(EKODI_USER_FOOTER.precedenceNotice)) {
  errors.push('Central user footer must show the separate-policy precedence notice.');
}
if (shell?.footer?.serviceExtension !== 'append-only' || shell?.footer?.separatePolicyPrecedence !== true) {
  errors.push('Service-specific footer information must extend, not replace, the shared platform footer.');
}
if (!shell?.inheritance?.rootPolicyPages?.includes('/privacy') || !shell?.inheritance?.rootPolicyPages?.includes('/terms')) {
  errors.push('Privacy and terms pages must remain inside the common User UI Shell contract.');
}
if (!shell?.inheritance?.excludedRootPrefixes?.includes('/admin')) {
  errors.push('Admin root paths must stay outside the User UI Shell.');
}

const expectedLocales=['ko-KR','en','zh-CN','ja'];
if(shell?.language?.owner!=='shared-shell'||shell?.language?.runtime!=='shell/user-language.js'||shell?.language?.adminExcluded!==true){
  errors.push('Shared user language selector must be owned by the User UI Shell and exclude admin surfaces.');
}
if(!expectedLocales.every(locale=>shell?.language?.supported?.includes(locale))){
  errors.push('Shared user language selector must support Korean, English, Simplified Chinese and Japanese.');
}
for(const marker of ['ekodi_locale','data-ekodi-language-control','ekodi:locale-change','document.documentElement.lang','ko-KR','zh-CN','ekodi-user-language-style','appearance:none!important']){
  if(!userLanguageSource.includes(marker))errors.push(`Shared user language runtime lost required marker: ${marker}`);
}
if(shell?.ambientAudio?.owner!=='shared-shell'||shell?.ambientAudio?.runtime!=='shell/ccm-mr-player.js'||shell?.ambientAudio?.contentOverlapForbidden!==true||shell?.ambientAudio?.adminExcluded!==true){
  errors.push('Shared ambient audio control must be Shell-owned, avoid content overlap and exclude admin surfaces.');
}
for(const marker of ['placeButton','data-ekodi-floating','[data-ekodi-language-control]','ekodi:user-header-ready']){
  if(!ccmMrSource.includes(marker))errors.push(`Shared CCM MR control lost header-placement marker: ${marker}`);
}

for (const marker of ['fallbackHeader(serviceId)','data-ekodi-user-header-fallback','renderEkodiUserFooter','manifestServiceForHost','shellServiceForRootPath','data-ekodi-user-ui-style']) {
  if (!injectorSource.includes(marker)) errors.push(`Shared user UI injector lost required marker: ${marker}`);
}
for (const marker of ['[data-ekodi-legal-footer]:not(.ekodi-user-ui-footer)','.ekodi-user-ui-footer','.ekodi-user-ui-header','.ekodi-user-ui-footer__copy','--ekodi-user-footer-background','text-align: center','.ekodi-user-language','justify-content: center']) {
  if (!userUiStyle.includes(marker)) errors.push(`Shared CSP-safe user UI stylesheet lost required marker: ${marker}`);
}
for (const marker of ['EKODI_USER_FOOTER','USER_FOOTER_BOOTSTRAP','/user-footer.json','x-ekodi-user-ui-footer','userLanguageUrl','x-ekodi-user-language']) {
  if (!shellWorkerSource.includes(marker)) errors.push(`Shared Shell worker lost central user chrome marker: ${marker}`);
}
for (const marker of ['__EKODI_USER_FOOTER_CONFIG__','user-footer.json','VERSION=4','ekodi-user-ui-footer__copy','data-ekodi-i18n','data-ekodi-legacy-common-footer-hidden','suppressLegacyCommonFooters']) {
  if (!clientFooterSource.includes(marker)) errors.push(`Shared client footer lost central-config marker: ${marker}`);
}
for (const duplicatedText of ['213-13-01959','백련동1길 17-4','© 2026 EKODI · EKODIBIZ']) {
  if (clientFooterSource.includes(duplicatedText)) errors.push(`Shared client footer duplicated central content: ${duplicatedText}`);
  if (injectorSource.includes(duplicatedText)) errors.push(`Shared injector duplicated central content: ${duplicatedText}`);
}
for (const marker of ['rootUserService','rootInternalPath','shellServiceForRootPath','injectEkodiShell(response,serviceId)']) {
  if (!siteShellSource.replace(/\s+/g,'').includes(marker.replace(/\s+/g,''))) errors.push(`Shared site shell routing lost required inheritance marker: ${marker}`);
}
for(const id of Object.keys(services)){
  if(id==='mission')continue;
  if(!designInheritanceSource.includes(`${id}:`))errors.push(`Runtime design inheritance is missing UI DNA service "${id}".`);
}

for (const service of EKODI_SERVICE_MANIFEST.services ?? []) {
  if (!userSurfaces.has(String(service.defaultSurface || '').toLowerCase())) continue;
  let url;
  try { url = new URL(service.url); } catch { errors.push(`Service "${service.id}" has an invalid URL for User UI validation.`); continue; }
  if (url.hostname === 'ekodi.kr') {
    const probe = `${url.pathname.replace(/\/+$/,'')}/__ui-contract-probe`;
    if (shellServiceForRootPath(probe) !== service.id) errors.push(`Root-path service "${service.id}" does not inherit its User UI Shell on subpaths.`);
    continue;
  }
  if (shellServiceForHost(url.hostname) !== service.id) {
    errors.push(`User service host "${url.hostname}" (${service.id}) is not covered by the shared User UI Shell.`);
  }
}
if (shellServiceForHost('admin.ekodi.kr') !== '') errors.push('Admin host must never be classified as a User UI Shell host.');

const requiredMessageTypes = ['success', 'info', 'warning', 'error', 'permission', 'security', 'system', 'waiting'];
if (messageUI?.name !== 'EKODI Message UI') errors.push('Message UI policy must be named "EKODI Message UI".');
if (!Array.isArray(messageUI?.scope) || !['user', 'admin'].every(scope => messageUI.scope.includes(scope))) {
  errors.push('Message UI policy must cover both user and admin surfaces.');
}
if (messageUI?.principles?.composition !== 'illustration + short title + optional one-line description') {
  errors.push('Message UI must preserve the shared illustration + concise copy composition.');
}
if (messageUI?.principles?.hideTechnicalDetailsByDefault !== true) {
  errors.push('Message UI must hide technical details by default.');
}
for (const type of requiredMessageTypes) {
  const profile = messageUI?.types?.[type];
  if (!profile?.label || !profile?.defaultTitle || !profile?.defaultDescription) {
    errors.push(`Message UI type "${type}" is incomplete.`);
  }
}
if (!messageUI?.technicalDetailPolicy?.neverExpose?.includes('token') || !messageUI?.technicalDetailPolicy?.neverExpose?.includes('secret')) {
  errors.push('Message UI technical detail policy must explicitly block secrets and tokens.');
}

if (errors.length) {
  console.error('EKODI user-site UI DNA validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`EKODI UI DNA OK: ${Object.keys(services).length} distinct families, ${Object.keys(aliases).length} alias(es), ${EKODI_SERVICE_MANIFEST.services.filter(service=>userSurfaces.has(String(service.defaultSurface||'').toLowerCase())).length} user-service hosts/root services inherit one centered Header/Footer + language contract, footer=v${EKODI_USER_FOOTER.version}, locales=${expectedLocales.join(',')}, admin excluded, service-owned visual mood and CSP-safe chrome valid.`);
