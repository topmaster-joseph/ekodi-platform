import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const path = `${dist}control-center.html`;
let html = await readFile(path, 'utf8');

function mustReplace(search, replacement, label) {
  if (!html.includes(search)) throw new Error(`admin performance marker missing: ${label}`);
  html = html.replace(search, replacement);
}

// Login/return parses only the base visual CSS and the small central-auth handoff.
html = html
  .replace(/\s*<link rel="stylesheet" href="control-center-ops\.css">/g, '')
  .replace(/\s*<link rel="stylesheet" href="control-center-finance\.css">/g, '')
  .replace(/\s*<script src="control-center\.js"><\/script>/g, '')
  .replace('<script src="admin-central-handoff.js"></script>', '<script src="admin-central-handoff.js" defer></script>')
  .replaceAll('20260819-thin-shell-2', '20260819-e2e-perf-1');

mustReplace('<section class="metrics" data-panel="overview services"', '<section class="metrics hidden-panel" data-panel="services"', 'services metrics panel');
mustReplace('<section class="section operations-section" data-panel="overview services"', '<section class="section operations-section hidden-panel" data-panel="services"', 'services operations panel');
mustReplace('<section class="section" data-panel="overview finance"', '<section class="section hidden-panel" data-panel="finance"', 'finance panel');
for (const section of ['communication', 'workspace', 'organization']) {
  html = html.replace(`<section class="section" data-panel="${section}"`, `<section class="section hidden-panel" data-panel="${section}"`);
}
await writeFile(path, html);

const financePath = `${dist}finance-monitor.js`;
let finance = await readFile(financePath, 'utf8');
const financeTail = /financeRefresh\.addEventListener\('click',[\s\S]*?setInterval\(\(\) => \{[\s\S]*?\}, 120000\);/;
if (!financeTail.test(finance)) throw new Error('finance polling tail marker missing');
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

// The advanced feature catalog is loaded only after one of its lightweight menu placeholders
// is clicked. On the normal fast path, Finance already belongs to admin-demand-loader, so the
// historical catalog must not attach a second Finance loader when it eventually wakes up.
const featurePath = `${dist}control-center-features.js`;
let featureCatalog = await readFile(featurePath, 'utf8');
const financeFeatureListener = "financeButton?.addEventListener('click', () => { loadFinance().catch(error => console.warn('[EKODI finance feature]', error)); });";
if (!featureCatalog.includes(financeFeatureListener)) throw new Error('advanced catalog Finance listener marker missing');
featureCatalog = featureCatalog.replace(financeFeatureListener, `if (!window.EKODIAdminDemand) ${financeFeatureListener}`);
await writeFile(featurePath, featureCatalog);

const cssPath = `${dist}control-center.css`;
let css = await readFile(cssPath, 'utf8');
const perfCss = `\n/* admin performance guards */\n.section,.architecture{content-visibility:auto;contain-intrinsic-size:280px}\n@media(max-width:760px){.topbar{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background:#091321f2}.section,.architecture{contain-intrinsic-size:360px}}\n@media(prefers-reduced-motion:reduce){[data-panel],.sidebar{transition:none!important;scroll-behavior:auto!important}}\n`;
if (!css.includes('admin performance guards')) css += perfCss;
await writeFile(cssPath, css);

const files = {
  handoff: await readFile(`${dist}admin-central-handoff.js`, 'utf8'),
  shell: await readFile(`${dist}admin-authenticated-shell.js`, 'utf8'),
  compact: await readFile(`${dist}compact-control-center.js`, 'utf8'),
  menu: await readFile(`${dist}admin-menu-layout.js`, 'utf8'),
  demand: await readFile(`${dist}admin-demand-loader.js`, 'utf8'),
};
const bytes = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, Buffer.byteLength(value)]));
const postAuthBytes = bytes.shell + bytes.compact + bytes.menu + bytes.demand;
const firstPathBytes = bytes.handoff + postAuthBytes;

if (html.includes('control-center.js"></script>')) throw new Error('Legacy control-center.js leaked into admin first path');
if (html.includes('control-center-ops.css') || html.includes('control-center-finance.css')) throw new Error('Operational CSS leaked into admin first path');
if (bytes.handoff > 9000) throw new Error(`Admin handoff budget exceeded: ${bytes.handoff} bytes`);
if (bytes.compact > 12000) throw new Error(`Compact shell budget exceeded: ${bytes.compact} bytes`);
if (bytes.menu > 10000) throw new Error(`Menu layout budget exceeded: ${bytes.menu} bytes`);
if (bytes.demand > 14000) throw new Error(`Demand loader budget exceeded: ${bytes.demand} bytes`);
if (firstPathBytes > 52000) throw new Error(`Admin first-path JavaScript budget exceeded: ${firstPathBytes} bytes`);

for (const [name, source] of Object.entries(files)) {
  if (source.includes('setInterval(')) throw new Error(`${name} contains startup polling`);
  if (/observer\.observe\(document\.(?:documentElement|body)/.test(source)) throw new Error(`${name} contains document-wide MutationObserver`);
}
const finalFinance = await readFile(financePath, 'utf8');
if (finalFinance.includes('setInterval(')) throw new Error('Finance monitor still contains perpetual polling');
const finalFeatureCatalog = await readFile(featurePath, 'utf8');
if (!finalFeatureCatalog.includes('if (!window.EKODIAdminDemand) financeButton?.addEventListener')) throw new Error('Advanced catalog could duplicate Finance lazy loading');

console.log(`Admin performance postbuild: handoff=${bytes.handoff}B post-auth=${postAuthBytes}B first-path=${firstPathBytes}B; legacy runtime/operational CSS deferred, persistent polling removed.`);
