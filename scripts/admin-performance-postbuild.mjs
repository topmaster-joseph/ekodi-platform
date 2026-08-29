import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const path = `${dist}control-center.html`;
let html = await readFile(path, 'utf8');

// Diagnostics never belong to the normal startup graph. They are published as a standalone
// asset and fetched only when an administrator explicitly adds ?perf=1.
await copyFile(`${root}admin-perf-diagnostics.js`, `${dist}admin-perf-diagnostics.js`);

// The left navigation is a shared ES-module surface. Publish its registry, renderer and
// locale/access runtime together so every admin page can import the same menu contract.
const sharedAdminMenuModules = ['admin-menu-registry.js', 'admin-sidebar.js', 'admin-menu-runtime.js'];
await Promise.all(sharedAdminMenuModules.map(asset => copyFile(`${root}${asset}`, `${dist}${asset}`)));

// Keep the first-path demand router below its hard byte budget. Source remains readable;
// only the generated runtime receives safe internal identifier compaction.
const demandLoaderPath = `${dist}admin-demand-loader.js`;
let demandLoaderSource = await readFile(demandLoaderPath, 'utf8');
for (const [from,to] of [
  ['secondaryScheduled','sec'],
  ['insertPlaceholder','insert'],
  ['activateFeature','activate'],
  ['bindBaseEnhancements','bindBase'],
  ['requestedFeature','requested'],
  ['demandGenerated','dg'],
  ['__ekodiDemandHandler','_dh'],
  ['scheduleSecondary','schedule'],
  ['authenticated','authed'],
  ['assetUrl','urlFor'],
  ['loadScript','loadJs'],
  ['loadStyle','loadCss'],
  ['inputPending','inputBusy'],
  ['onBackground','background'],
  ['FEATURES','F'],
  ['loadedScripts','jsCache'],
  ['loadedStyles','cssCache'],
  ['stylesLoaded','cssReady'],
]) demandLoaderSource = demandLoaderSource.replaceAll(from, to);
await writeFile(demandLoaderPath, demandLoaderSource.split('\n').map(line => line.trimStart()).filter(Boolean).join('\n') + '\n');

// Login/return parses only the base visual CSS and the small central-auth handoff.
html = html
  .replace(/\s*<link rel="stylesheet" href="control-center-ops\.css">/g, '')
  .replace(/\s*<link rel="stylesheet" href="control-center-finance\.css">/g, '')
  .replace(/\s*<script src="control-center\.js"><\/script>/g, '')
  .replace('<script src="admin-central-handoff.js"></script>', '<script src="admin-central-handoff.js" defer></script>');

// The retired overview/services bootstrap DOM no longer exists. Keep surviving workspaces hidden until selected.
for (const section of ['finance', 'communication', 'workspace', 'organization']) {
  html = html.replace(`<section class="section" data-panel="${section}"`, `<section class="section hidden-panel" data-panel="${section}"`);
}

// Finance polling exists only while Finance is visible and the tab is active.
const financePath = `${dist}finance-monitor.js`;
let finance = await readFile(financePath, 'utf8');
const financeTail = /financeRefresh\.addEventListener\('click',[\s\S]*?setInterval\(\(\) => \{[\s\S]*?\}, 120000\);/;
if (financeTail.test(finance)) {
finance = finance.replace(financeTail, `let financeRefreshTimer = 0;
function cancelFinanceRefresh() {
  if (financeRefreshTimer) clearTimeout(financeRefreshTimer);
  financeRefreshTimer = 0;
}
function scheduleFinanceRefresh() {
  cancelFinanceRefresh();
  const visible = financeSectionButton?.classList.contains('active') && document.visibilityState !== 'hidden' && financeToken();
  if (!visible) return;
  financeRefreshTimer = window.setTimeout(async () => {
    await loadFinance(false);
    scheduleFinanceRefresh();
  }, 120000);
}
financeRefresh.addEventListener('click', () => loadFinance(true));
financeSectionButton.addEventListener('click', () => {
  document.querySelector('#pageTitle').textContent = '결제 · 회계';
  loadFinance(false).finally(scheduleFinanceRefresh);
});
document.addEventListener('visibilitychange', scheduleFinanceRefresh);
window.addEventListener('hashchange', scheduleFinanceRefresh);
if ((location.hash === '#finance' || financeSectionButton.classList.contains('active')) && financeToken()) {
  queueMicrotask(() => loadFinance(false).finally(scheduleFinanceRefresh));
}`);
await writeFile(financePath, finance);
}
if (finance.includes('setInterval(')) throw new Error('Finance monitor still contains perpetual polling');

// Mobile browsers pay heavily for backdrop blur and off-screen panel painting.
const cssPath = `${dist}control-center.css`;
let css = await readFile(cssPath, 'utf8');
const perfCss = `\n/* admin performance guards */\n.section,.architecture{content-visibility:auto;contain-intrinsic-size:280px}\n@media(max-width:760px){.topbar{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background:#091321f2}.section,.architecture{contain-intrinsic-size:360px}}\n@media(prefers-reduced-motion:reduce){[data-panel],.sidebar{transition:none!important;scroll-behavior:auto!important}}\n`;
if (!css.includes('admin performance guards')) css += perfCss;
await writeFile(cssPath, css);

// Mobile Admin is its own flow: the compact header belongs to the document and scrolls away.
const compactCssPath = `${dist}compact-control-center.css`;
let compactCss = await readFile(compactCssPath, 'utf8');
const mobileCss = `\n/* admin mobile flow */\n@media(max-width:760px){body.compact-control-center .app>main{padding-top:0!important}body.compact-control-center .topbar{position:static!important;inset:auto!important;width:auto!important;height:auto!important;min-height:56px!important;padding:8px 12px!important;box-sizing:border-box!important}body.compact-control-center .topbar .kicker{display:none!important}body.compact-control-center .topbar h1{font-size:16px!important;margin:0!important}body.compact-control-center .content{padding:12px 12px 32px!important}}\n`;
if (!compactCss.includes('admin mobile flow')) compactCss += mobileCss;
await writeFile(compactCssPath, compactCss);

// Compact the generated compact runtime without changing JavaScript semantics.
const compactJsPath = `${dist}compact-control-center.js`;
const compactJsSource = (await readFile(compactJsPath, 'utf8')).replace(/^[ \t]+/gm, '');
await writeFile(compactJsPath, compactJsSource);

// Fingerprint the complete admin runtime. HTML is no-store, while every referenced versioned
// asset can then be cached immutably without ever mixing two releases in one browser session.
const versionInputs = [
  'admin-central-handoff.js','admin-authenticated-shell.js','admin-demand-loader.js','admin-menu-layout.js',
  ...sharedAdminMenuModules,
  'compact-control-center.js','compact-control-center.css','control-center.css','finance-monitor.js',
  'campus-actions.js','campus-actions.css','device-control-admin.js','device-control-admin.css',
  'ai-ops-admin.js','ai-ops-admin.css','ai-module-spec-admin.js','ai-module-spec-admin.css','life-ai-admin.js','life-ai-admin.css','mission-control-admin.js','mission-control-admin.css',
  'release-control-admin.js','release-control-admin.css','admin-lazy-features.js',
  'system-health-admin.js','system-health-admin.css','api-cost-admin.js','api-cost-admin.css','work-admin.js','work-admin.css',
  'marketing-ai-admin.js','marketing-ai-admin.css','author-billing-admin.js','author-billing-admin.css',
  'admin-perf-diagnostics.js',
];
const hash = createHash('sha256');
for (const asset of versionInputs) hash.update(await readFile(`${dist}${asset}`));
const assetVersion = hash.digest('hex').slice(0, 16);
for (const asset of ['admin-central-handoff.js','admin-authenticated-shell.js','admin-demand-loader.js']) {
  const assetPath = `${dist}${asset}`;
  const source = await readFile(assetPath, 'utf8');
  if (!source.includes('__EKODI_ADMIN_ASSET_VERSION__')) throw new Error(`${asset} asset-version placeholder missing`);
  await writeFile(assetPath, source.replaceAll('__EKODI_ADMIN_ASSET_VERSION__', assetVersion));
}

// Compact generated first-path JS without changing source contracts.
const handoffPath = `${dist}admin-central-handoff.js`;
let compactHandoff = await readFile(handoffPath, 'utf8');
compactHandoff = compactHandoff.replace(/^\/\/ Minimal admin entry runtime:[^\r\n]*(?:\r?\n)/, '');
for (const [from,to] of [
  ['CENTRAL_ADMIN_AUTH_URL','AUTH_URL'],
  ['ensureCentralLoginFallback','ensureLogin'],
  ['normalizeEntryRoute','normalizeEntry'],
  ['syncLoginLink','syncLogin'],
  ['routeFromLocation','routeNow'],
  ['cleanRouteUrl','cleanUrl'],
  ['centralAdminAuthUrl','authUrl'],
  ['updateSessionState','updateState'],
  ['loadPerfDiagnostics','loadPerf'],
  ['validateSession','validate'],
]) compactHandoff = compactHandoff.replaceAll(from, to);
await writeFile(handoffPath, compactHandoff);

const shellPath = `${dist}admin-authenticated-shell.js`;
let compactShell = await readFile(shellPath, 'utf8');
for (const [from,to] of [
  ['postAuthStyles','styles'],
  ['criticalPostAuthScripts','scripts'],
  ['canonicalizeLegacyEntry','legacyEntry'],
  ['applyOfficialAdminSurface','applySurface'],
  ['keepLoginInteractive','keepLogin'],
  ['installSharedAdminLayout','installLayout'],
  ['deactivateMallFreeOps','closeMall'],
  ['installMallFreeOpsIsolation','installMall'],
  ['startAuthenticatedShell','startShell'],
  ['onStateChange','onState'],
]) compactShell = compactShell.replaceAll(from, to);
await writeFile(shellPath, compactShell);

// ES-module imports are versioned too. This prevents a browser from combining a new layout
// with a five-minute-old menu registry after a deployment.
const moduleImportVersions = new Map([
  ['admin-menu-layout.js', ['admin-menu-registry.js', 'admin-sidebar.js', 'admin-menu-runtime.js']],
  ['admin-sidebar.js', ['admin-menu-registry.js']],
  ['admin-menu-runtime.js', ['admin-menu-registry.js']],
]);
for (const [asset, imports] of moduleImportVersions) {
  const assetPath = `${dist}${asset}`;
  let source = await readFile(assetPath, 'utf8');
  for (const imported of imports) source = source.replaceAll(`./${imported}`, `./${imported}?v=${assetVersion}`);
  await writeFile(assetPath, source);
}

html = html
  .replace(/href="control-center\.css(?:\?v=[^"]+)?"/, `href="control-center.css?v=${assetVersion}"`)
  .replace(/src="admin-central-handoff\.js(?:\?v=[^"]+)?"/, `src="admin-central-handoff.js?v=${assetVersion}"`)
  .replace(/src="admin-authenticated-shell\.js(?:\?v=[^"]+)?"/, `src="admin-authenticated-shell.js?v=${assetVersion}"`)
  .replaceAll('20260819-thin-shell-2', assetVersion)
  .replaceAll('20260819-e2e-perf-1', assetVersion);
await writeFile(path, html);

// Final budgets run after every postbuild layer so later CSS/JS cannot sneak past the guard.
const menuBudgetPath = `${dist}admin-menu-layout.js`;
const compactMenuForBudget = (await readFile(menuBudgetPath, 'utf8')).replace(/\r\n/g, '\n').replace(/^[ \t]+/gm, '');
await writeFile(menuBudgetPath, compactMenuForBudget);
const files = {
  handoff: await readFile(`${dist}admin-central-handoff.js`, 'utf8'),
  shell: await readFile(`${dist}admin-authenticated-shell.js`, 'utf8'),
  compact: await readFile(`${dist}compact-control-center.js`, 'utf8'),
  menu: await readFile(`${dist}admin-menu-layout.js`, 'utf8'),
  demand: await readFile(`${dist}admin-demand-loader.js`, 'utf8'),
};
const bytes = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, Buffer.byteLength(value)]));
const baseCssBytes = Buffer.byteLength(await readFile(`${dist}control-center.css`, 'utf8'));
const compactCssBytes = Buffer.byteLength(await readFile(`${dist}compact-control-center.css`, 'utf8'));
const postAuthBytes = bytes.shell + bytes.compact + bytes.menu + bytes.demand;
const firstPathBytes = bytes.handoff + postAuthBytes;
const firstCssBytes = baseCssBytes + compactCssBytes;

if (html.includes('control-center.js"></script>')) throw new Error('Legacy control-center.js leaked into admin first path');
if (html.includes('control-center-ops.css') || html.includes('control-center-finance.css')) throw new Error('Operational CSS leaked into admin first path');
if (!html.includes(`control-center.css?v=${assetVersion}`) || !html.includes(`admin-central-handoff.js?v=${assetVersion}`)) throw new Error('Versioned first-path assets missing');
if (bytes.handoff > 9000) throw new Error(`Admin handoff budget exceeded: ${bytes.handoff} bytes`);
if (bytes.compact > 5000) throw new Error(`Compact shell budget exceeded: ${bytes.compact} bytes`);
if (bytes.menu > 10000) throw new Error(`Menu layout budget exceeded: ${bytes.menu} bytes`);
if (bytes.demand > 14000) throw new Error(`Demand loader budget exceeded: ${bytes.demand} bytes`);
if (firstPathBytes > 43000) throw new Error(`Admin first-path JavaScript budget exceeded: ${firstPathBytes} bytes`);
if (baseCssBytes > 16000) throw new Error(`Admin base CSS budget exceeded: ${baseCssBytes} bytes`);
if (compactCssBytes > 26000) throw new Error(`Admin compact CSS budget exceeded: ${compactCssBytes} bytes`);
if (firstCssBytes > 40000) throw new Error(`Admin first-path CSS budget exceeded: ${firstCssBytes} bytes`);

for (const [name, source] of Object.entries(files)) {
  if (source.includes('setInterval(')) throw new Error(`${name} contains startup polling`);
  if (/observer\.observe\(document\.(?:documentElement|body)/.test(source)) throw new Error(`${name} contains document-wide MutationObserver`);
}
const finalFinance = await readFile(financePath, 'utf8');
if (finalFinance.includes('setInterval(')) throw new Error('Finance monitor still contains perpetual polling');
if ((await readFile(`${dist}compact-control-center.css`, 'utf8')).includes('admin-readable-command.css')) throw new Error('AI command CSS leaked into startup compact CSS');
if (!(await readFile(`${dist}ai-ops-admin.css`, 'utf8')).includes('admin-readable-command.css')) throw new Error('AI command CSS missing from on-demand AI Ops');

console.log(`Admin performance postbuild: version=${assetVersion} handoff=${bytes.handoff}B post-auth=${postAuthBytes}B first-path=${firstPathBytes}B CSS=${firstCssBytes}B; immutable versioning ready, shared menu modules published, retired runtime removed and polling guarded.`);
