import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const path = `${dist}control-center.html`;
let html = await readFile(path, 'utf8');

function mustReplace(search, replacement, label) {
  if (!html.includes(search)) throw new Error(`admin performance marker missing: ${label}`);
  html = html.replace(search, replacement);
}

// Login/return must parse only the base visual CSS and the small central-auth handoff.
// Operational CSS and the historical all-in-one control-center runtime stay available as
// standalone assets but are no longer part of the first navigation path.
html = html
  .replace(/\s*<link rel="stylesheet" href="control-center-ops\.css">/g, '')
  .replace(/\s*<link rel="stylesheet" href="control-center-finance\.css">/g, '')
  .replace(/\s*<script src="control-center\.js"><\/script>/g, '')
  .replace('<script src="admin-central-handoff.js"></script>', '<script src="admin-central-handoff.js" defer></script>')
  .replaceAll('20260819-thin-shell-2', '20260819-e2e-perf-1');

// Only the overview hero/architecture participate in first authenticated layout. Existing
// operational DOM remains in the document for compatibility, but it starts display:none and
// its CSS/data modules are fetched only when that workspace is opened.
mustReplace('<section class="metrics" data-panel="overview services"', '<section class="metrics hidden-panel" data-panel="services"', 'services metrics panel');
mustReplace('<section class="section operations-section" data-panel="overview services"', '<section class="section operations-section hidden-panel" data-panel="services"', 'services operations panel');
mustReplace('<section class="section" data-panel="overview finance"', '<section class="section hidden-panel" data-panel="finance"', 'finance panel');
for (const section of ['communication', 'workspace', 'organization']) {
  html = html.replace(`<section class="section" data-panel="${section}"`, `<section class="section hidden-panel" data-panel="${section}"`);
}

await writeFile(path, html);

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
if (bytes.demand > 12000) throw new Error(`Demand loader budget exceeded: ${bytes.demand} bytes`);
if (firstPathBytes > 50000) throw new Error(`Admin first-path JavaScript budget exceeded: ${firstPathBytes} bytes`);

for (const [name, source] of Object.entries(files)) {
  if (source.includes('setInterval(')) throw new Error(`${name} contains startup polling`);
  if (/observer\.observe\(document\.(?:documentElement|body)/.test(source)) throw new Error(`${name} contains document-wide MutationObserver`);
}

console.log(`Admin performance postbuild: handoff=${bytes.handoff}B post-auth=${postAuthBytes}B first-path=${firstPathBytes}B; operational CSS/runtime deferred.`);
