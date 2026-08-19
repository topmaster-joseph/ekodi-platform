import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

async function text(path) {
  return readFile(path, 'utf8');
}

function mustReplace(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`admin thin-shell marker missing: ${label}`);
  return source.replace(search, replacement);
}

// Device Control is published only as a standalone demand asset. The compact stylesheet
// keeps its shell styles but loses every Device rule before the browser sees it.
let compactCss = await text(`${dist}compact-control-center.css`);
const deviceJs = (await text(`${root}device-control-admin.js`)).trim();
const deviceCss = (await text(`${root}device-control-admin.css`)).trim();
await writeFile(`${dist}device-control-admin.js`, `${deviceJs}\n`);
await writeFile(`${dist}device-control-admin.css`, `${deviceCss}\n`);
compactCss = mustReplace(compactCss, deviceCss, '', 'device CSS bundled in compact shell');
await writeFile(`${dist}compact-control-center.css`, compactCss);

// Rebuild the startup JavaScript from the actual first-login responsibility instead of
// carrying historical Campus/Policies/Device constructors and zero-delay routing timers.
// Dynamic workspaces announce themselves and this runtime only normalizes their labels.
const minimalCompactJs = `(() => {\n  'use strict';\n  const NAV_MAP = Object.freeze({\n    overview:'Operations', services:'Services', clients:'Clients', admins:'Admin Accounts',\n    books:'Books', finance:'Finance', affiliates:'Affiliates', communication:'Mail & Live',\n    workspace:'Cloud & Files', organization:'Organization', domains:'Domains', social:'Social',\n    community:'Community', campus:'Campus'\n  });\n  function setText(selector, value) {\n    const node = document.querySelector(selector);\n    if (node && node.textContent !== value) node.textContent = value;\n  }\n  function normalizeNavigation() {\n    const nav = document.querySelector('.sidebar nav');\n    if (!nav) return;\n    for (const item of nav.querySelectorAll('[data-section]')) {\n      const label = NAV_MAP[item.dataset.section];\n      const span = item.querySelector('span');\n      if (label && span && span.textContent !== label) span.textContent = label;\n    }\n    const domains = nav.querySelector('a[href="/legacy#domains"] span');\n    const activity = nav.querySelector('a[href="/legacy#activity"] span');\n    if (domains && domains.textContent !== 'Domains & DNS') domains.textContent = 'Domains & DNS';\n    if (activity && activity.textContent !== 'Activity Logs') activity.textContent = 'Activity Logs';\n  }\n  function normalizeVisibleShell() {\n    document.body.classList.add('compact-control-center');\n    normalizeNavigation();\n    setText('#logoutButton', 'Logout');\n    setText('#pageTitle', 'Operations');\n    const hero = document.querySelector('.hero[data-panel~="overview"]');\n    if (hero) {\n      const kicker = hero.querySelector('.kicker');\n      const heading = hero.querySelector('h2');\n      const copy = hero.querySelector('p:not(.kicker)');\n      if (kicker) kicker.textContent = 'OPERATIONS OVERVIEW';\n      if (heading) heading.textContent = 'EKODI Platform Operations';\n      if (copy) copy.textContent = 'Live service health, clients and core operations in one view.';\n      const actions = hero.querySelectorAll('.hero-actions a');\n      if (actions[0]) actions[0].textContent = 'EKODI Home ↗';\n      if (actions[1]) actions[1].textContent = 'Admin Tools ↗';\n    }\n  }\n  window.addEventListener('ekodi-feature-installed', normalizeNavigation);\n  window.addEventListener('ekodi-nav-changed', normalizeNavigation);\n  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeVisibleShell, { once:true });\n  else normalizeVisibleShell();\n})();\n`;
new Function(minimalCompactJs);
await writeFile(`${dist}compact-control-center.js`, minimalCompactJs);

// Inject a minimal Campus shell into the standalone Campus asset. The full Campus renderer
// upgrades it only after the Campus placeholder is explicitly opened.
const campusSource = await text(`${dist}campus-actions.js`);
const campusPrelude = `(() => {\n  'use strict';\n  const nav = document.querySelector('.sidebar nav');\n  const content = document.querySelector('.content');\n  if (!nav || !content || document.querySelector('#campusPanel')) return;\n\n  const button = document.createElement('button');\n  button.type = 'button';\n  button.className = 'nav campus-nav';\n  button.dataset.section = 'campus';\n  button.append(document.createTextNode('⌂ '));\n  const label = document.createElement('span');\n  label.textContent = 'Campus';\n  button.append(label);\n  nav.prepend(button);\n\n  const section = document.createElement('section');\n  section.id = 'campusPanel';\n  section.className = 'section campus-panel hidden-panel';\n  section.dataset.panel = 'campus';\n  section.innerHTML = '<div class="campus-toolbar"><div><p class="kicker">EKODI SITES</p><h2>EKODI Digital Campus</h2><p>필요할 때만 전체 사이트 지도를 불러옵니다.</p></div><div class="campus-toolbar-actions"><a class="primary" href="https://ekodi.kr" target="_blank" rel="noopener">Live Site ↗</a></div></div><div class="finance-table-wrap campus-table-wrap"></div>';\n  content.prepend(section);\n\n  button.addEventListener('click', () => {\n    document.querySelectorAll('[data-panel]').forEach(panel => {\n      const targets = String(panel.dataset.panel || '').split(/\\s+/);\n      panel.classList.toggle('hidden-panel', !targets.includes('campus'));\n    });\n    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.remove('active'));\n    button.classList.add('active');\n    const title = document.querySelector('#pageTitle');\n    if (title) title.textContent = 'Campus';\n    document.querySelector('.sidebar')?.classList.remove('open');\n    if (location.hash !== '#campus') history.replaceState(null, '', '#campus');\n  });\n\n  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ section:'campus' } }));\n})();\n`;
await writeFile(`${dist}campus-actions.js`, `${campusPrelude}${campusSource}`);

// Keep generated HTML metadata aligned with the three-file first-login contract.
let html = await text(`${dist}control-center.html`);
html = html.replaceAll('20260819-true-lazy-1', '20260819-thin-shell-2');
html = html.replaceAll(
  'compact-control-center.js control-center-features.js campus-actions.js admin-menu-layout.js admin-demand-loader.js',
  'compact-control-center.js admin-menu-layout.js admin-demand-loader.js',
);
await writeFile(`${dist}control-center.html`, html);

const finalCompactJs = await text(`${dist}compact-control-center.js`);
const finalCompactCss = await text(`${dist}compact-control-center.css`);
const finalCampus = await text(`${dist}campus-actions.js`);
const finalDeviceJs = await text(`${dist}device-control-admin.js`);
const finalDeviceCss = await text(`${dist}device-control-admin.css`);
for (const forbidden of ['WINDOWS_AGENT_URL', 'ekodiDevicePanel', 'CAMPUS_SERVICES', 'function installCampus(', 'function installPolicies(', 'setTimeout(']) {
  if (finalCompactJs.includes(forbidden)) throw new Error(`Startup compact JS contains historical runtime: ${forbidden}`);
}
if (finalCompactCss.includes('.ekodi-device-panel') || finalCompactCss.includes('.ekodi-device-card')) {
  throw new Error('Device Control CSS leaked into compact-control-center.css');
}
if (!finalCampus.includes("section.id = 'campusPanel'") || !finalCampus.includes("button.dataset.section = 'campus'")) {
  throw new Error('On-demand Campus shell was not installed into campus-actions.js');
}
if (!finalDeviceJs.includes('WINDOWS_AGENT_URL') || !finalDeviceJs.includes('installPanel()')) {
  throw new Error('Standalone Device Control JavaScript was not materialized');
}
if (!finalDeviceCss.includes('.ekodi-device-panel') || !finalDeviceCss.includes('.ekodi-device-card')) {
  throw new Error('Standalone Device Control CSS was not materialized');
}

console.log(`Admin thin-shell postbuild: startup compact runtime=${Buffer.byteLength(finalCompactJs)}B; Campus, Policies and Device constructors removed from first interaction.`);
