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

function mustRegex(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`admin thin-shell pattern missing: ${label}`);
  return source.replace(pattern, replacement);
}

// build.mjs historically concatenates Device Control into the compact shell. Keep the
// standalone assets, but remove their exact source from the first-login JS/CSS bundle.
let compactJs = await text(`${dist}compact-control-center.js`);
let compactCss = await text(`${dist}compact-control-center.css`);
const deviceJs = (await text(`${root}device-control-admin.js`)).trim();
const deviceCss = (await text(`${root}device-control-admin.css`)).trim();

compactJs = mustReplace(compactJs, deviceJs, '', 'device JS bundled in compact shell');
compactCss = mustReplace(compactCss, deviceCss, '', 'device CSS bundled in compact shell');

// The legacy compact module also creates Campus during every login. Strip only the Campus
// data + constructor block from the served compact asset; campus-actions.js receives a
// tiny shell prelude below and is fetched only when Campus is opened.
compactJs = mustRegex(
  compactJs,
  /\n  const CAMPUS_SERVICES = \[[\s\S]*?\n  \];\n/,
  '\n',
  'Campus service constants',
);
compactJs = mustRegex(
  compactJs,
  /\n  function highlightService\([\s\S]*?\n  function policyCard\(/,
  '\n  function policyCard(',
  'Campus constructor functions',
);
compactJs = mustReplace(compactJs, '    installCampus();\n', '', 'installCampus startup call');
compactJs = mustReplace(compactJs, "    setText('#pageTitle', 'Campus');", "    setText('#pageTitle', 'Operations');", 'default Campus title');
compactJs = mustReplace(
  compactJs,
  "      setTimeout(() => document.querySelector('[data-section=\"campus\"]')?.click(), 0);",
  "      setTimeout(() => document.querySelector('[data-section=\"overview\"]')?.click(), 0);",
  'default Campus click',
);

await writeFile(`${dist}compact-control-center.js`, compactJs);
await writeFile(`${dist}compact-control-center.css`, compactCss);

// Inject the minimal Campus shell into the standalone Campus asset. The existing Campus
// renderer then upgrades it with the full grouped site view. Nothing here runs until the
// demand loader fetches campus-actions.js.
const campusSource = await text(`${dist}campus-actions.js`);
const campusPrelude = `(() => {\n  'use strict';\n  const nav = document.querySelector('.sidebar nav');\n  const content = document.querySelector('.content');\n  if (!nav || !content || document.querySelector('#campusPanel')) return;\n\n  const button = document.createElement('button');\n  button.type = 'button';\n  button.className = 'nav campus-nav';\n  button.dataset.section = 'campus';\n  button.append(document.createTextNode('⌂ '));\n  const label = document.createElement('span');\n  label.textContent = 'Campus';\n  button.append(label);\n  nav.prepend(button);\n\n  const section = document.createElement('section');\n  section.id = 'campusPanel';\n  section.className = 'section campus-panel hidden-panel';\n  section.dataset.panel = 'campus';\n  section.innerHTML = '<div class="campus-toolbar"><div><p class="kicker">EKODI SITES</p><h2>EKODI Digital Campus</h2><p>필요할 때만 전체 사이트 지도를 불러옵니다.</p></div><div class="campus-toolbar-actions"><a class="primary" href="https://ekodi.kr" target="_blank" rel="noopener">Live Site ↗</a></div></div><div class="finance-table-wrap campus-table-wrap"></div>';\n  content.prepend(section);\n\n  button.addEventListener('click', () => {\n    document.querySelectorAll('[data-panel]').forEach(panel => {\n      const targets = String(panel.dataset.panel || '').split(/\\s+/);\n      panel.classList.toggle('hidden-panel', !targets.includes('campus'));\n    });\n    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.remove('active'));\n    button.classList.add('active');\n    const title = document.querySelector('#pageTitle');\n    if (title) title.textContent = 'Campus';\n    document.querySelector('.sidebar')?.classList.remove('open');\n    if (location.hash !== '#campus') history.replaceState(null, '', '#campus');\n  });\n\n  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ section:'campus' } }));\n})();\n`;
await writeFile(`${dist}campus-actions.js`, `${campusPrelude}${campusSource}`);

// Keep the generated HTML metadata aligned with the actual first-login contract. The data
// attribute is diagnostic only, but stale entries invite regressions and misleading probes.
let html = await text(`${dist}control-center.html`);
html = html.replaceAll('20260819-true-lazy-1', '20260819-thin-shell-2');
html = html.replaceAll(
  'compact-control-center.js control-center-features.js campus-actions.js admin-menu-layout.js admin-demand-loader.js',
  'compact-control-center.js admin-menu-layout.js admin-demand-loader.js',
);
await writeFile(`${dist}control-center.html`, html);

// Fail the build if any heavyweight startup code leaked back into the compact bundle.
const finalCompactJs = await text(`${dist}compact-control-center.js`);
const finalCompactCss = await text(`${dist}compact-control-center.css`);
const finalCampus = await text(`${dist}campus-actions.js`);
if (finalCompactJs.includes('WINDOWS_AGENT_URL') || finalCompactJs.includes('ekodiDevicePanel')) {
  throw new Error('Device Control leaked into compact-control-center.js');
}
if (finalCompactCss.includes('.ekodi-device-panel') || finalCompactCss.includes('.ekodi-device-card')) {
  throw new Error('Device Control CSS leaked into compact-control-center.css');
}
if (finalCompactJs.includes('CAMPUS_SERVICES') || finalCompactJs.includes('function installCampus(')) {
  throw new Error('Campus constructor leaked into compact-control-center.js');
}
if (!finalCampus.includes("section.id = 'campusPanel'") || !finalCampus.includes("button.dataset.section = 'campus'")) {
  throw new Error('On-demand Campus shell was not installed into campus-actions.js');
}

console.log('Admin thin-shell postbuild: Campus and Device Control are fully demand-loaded.');
