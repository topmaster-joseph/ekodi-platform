// Physical purge: remove retired admin implementation from source, build graph and production.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const write = (path, value) => writeFileSync(path, value);
const must = (condition, message) => { if (!condition) throw new Error(message); };
const replaceIfPresent = (value, search, replacement) => value.includes(search) ? value.replace(search, replacement) : value;

function purgeControlCenterHtml() {
  let html = read('control-center.html');
  html = html.replace(/\s*<link rel="stylesheet" href="control-center-ops\.css">\s*/g, '\n');
  html = html.replace(/\s*<link rel="stylesheet" href="control-center-finance\.css">\s*/g, '\n');
  html = html.replace(/\s*<a class="legacy-link"[\s\S]*?<\/a>\s*/g, '\n');
  html = html.replace(/\s*<a class="brand side-brand"[\s\S]*?<\/a>\s*<small class="side-caption">[\s\S]*?<\/small>\s*/g, '\n');
  html = html.replace(/<nav>[\s\S]*?<\/nav>/, '<nav aria-label="관리자 메뉴"></nav>');
  html = html.replace(/\s*<span id="scopeBadge">ALL<\/span>/g, '');
  html = html.replace(/\s*<section class="hero" data-panel="overview">[\s\S]*?<\/section>\s*/g, '\n');
  html = html.replace(/\s*<section class="metrics" data-panel="overview services"[\s\S]*?<\/section>\s*/g, '\n');
  html = html.replace(/\s*<section class="section operations-section" data-panel="overview services"[\s\S]*?<\/section>\s*/g, '\n');
  html = html.replaceAll('data-panel="overview finance"', 'data-panel="finance"');
  html = html.replaceAll('href="/legacy#domains"', 'href="#ai-ops"');
  html = html.replaceAll('href="/legacy#activity"', 'href="#ai-ops"');
  html = html.replaceAll('href="/legacy"', 'href="#ai-ops"');
  html = html.replace('<div><p class="kicker">EKODI DIGITAL CAMPUS</p><h1 id="pageTitle">통합 운영</h1></div>', '<div><h1 id="pageTitle">사이트 관리</h1></div>');
  must(!html.includes('data-panel="overview"'), 'retired overview panel survived');
  must(!html.includes('data-section="overview"'), 'retired overview navigation survived');
  must(!html.includes('legacy-link'), 'retired legacy login link survived');
  must(!html.includes('control-center-ops.css'), 'retired operations stylesheet reference survived');
  write('control-center.html', html);
}

function migrateMenuToRegistryOnly() {
  let menu = read('admin-menu-layout.js');
  menu = replaceIfPresent(menu, '{ mountAdminSidebar }', '{ mountAdminSidebar, renderAdminSidebar }');
  if (!menu.includes('renderAdminSidebar(nav);')) {
    menu = replaceIfPresent(menu, "if (!sidebar || !nav || !content) return;\n", "if (!sidebar || !nav || !content) return;\nrenderAdminSidebar(nav);\n");
  }
  menu = menu.replace("const INTERNAL_ONLY_HREFS = new Set(['/legacy#domains', '/legacy#activity']);", 'const INTERNAL_ONLY_HREFS = new Set();');
  must(menu.includes('renderAdminSidebar(nav);'), 'registry-owned admin sidebar seed missing');
  write('admin-menu-layout.js', menu);
}

function purgeAuthenticatedShellCompatibility() {
  let shell = read('admin-authenticated-shell.js');
  shell = shell.replace(/function repairLegacyLinks\(\)\{[\s\S]*?\}\nfunction announceReady/, 'function announceReady');
  shell = shell.replaceAll(';repairLegacyLinks()', '');
  must(!shell.includes('repairLegacyLinks'), 'legacy-link repair runtime survived');
  must(!shell.includes('.hero[data-panel~="overview"]'), 'legacy overview hero selector survived');
  write('admin-authenticated-shell.js', shell);
}

function purgeThinPostbuildLegacyGenerator() {
  let thin = read('scripts/admin-thin-postbuild.mjs');
  if (thin.includes('const NAV_MAP = Object.freeze') || thin.includes('EKODI Platform Operations')) {
    const start = thin.indexOf('const minimalCompactJs = `');
    const marker = 'new Function(minimalCompactJs);';
    const end = thin.indexOf(marker, start);
    must(start >= 0 && end > start, 'minimal compact runtime block not found');
    const replacement = [
      'const minimalCompactJs = `(() => {\\n',
      "  'use strict';\\n",
      "  function normalizeShell() {\\n",
      "    document.body.classList.add('compact-control-center');\\n",
      "    const logout = document.querySelector('#logoutButton');\\n",
      "    if (logout && logout.textContent !== 'Logout') logout.textContent = 'Logout';\\n",
      "  }\\n",
      "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeShell, { once:true });\\n",
      "  else normalizeShell();\\n",
      "})();\\n${assistBootstrapJs}\\n`;\n",
      'new Function(minimalCompactJs);',
    ].join('');
    thin = thin.slice(0, start) + replacement + thin.slice(end + marker.length);
  }
  thin = thin.replace(/html = html\.replaceAll\(\n  'compact-control-center\.js control-center-features\.js campus-actions\.js admin-menu-layout\.js admin-demand-loader\.js',\n  'compact-control-center\.js admin-menu-layout\.js admin-demand-loader\.js',\n\);\n/g, '');
  must(!thin.includes('EKODI Platform Operations'), 'retired operations title generator survived');
  must(!thin.includes('OPERATIONS OVERVIEW'), 'retired operations kicker generator survived');
  must(!thin.includes('const NAV_MAP = Object.freeze'), 'retired navigation normalizer survived');
  must(!thin.includes('control-center-features.js'), 'retired feature runtime reference survived postbuild');
  write('scripts/admin-thin-postbuild.mjs', thin);
}

function purgePerformanceDependencies() {
  let source = read('scripts/admin-performance-postbuild.mjs');
  source = source.replace("function mustReplace(search, replacement, label) {\n  if (!html.includes(search)) throw new Error(`admin performance marker missing: ${label}`);\n  html = html.replace(search, replacement);\n}\n\n", '');
  const old = `// Only the overview hero participates in first authenticated layout. Operational DOM remains\n// for compatibility but is display:none until its workspace is explicitly selected.\nmustReplace('<section class="metrics" data-panel="overview services"', '<section class="metrics hidden-panel" data-panel="services"', 'services metrics panel');\nmustReplace('<section class="section operations-section" data-panel="overview services"', '<section class="section operations-section hidden-panel" data-panel="services"', 'services operations panel');\nmustReplace('<section class="section" data-panel="overview finance"', '<section class="section hidden-panel" data-panel="finance"', 'finance panel');\nfor (const section of ['communication', 'workspace', 'organization']) {\n  html = html.replace(\`<section class="section" data-panel="\${section}"\`, \`<section class="section hidden-panel" data-panel="\${section}"\`);\n}\n`;
  const replacement = `// The retired overview/services bootstrap DOM no longer exists. Keep surviving workspaces hidden until selected.\nfor (const section of ['finance', 'communication', 'workspace', 'organization']) {\n  html = html.replace(\`<section class="section" data-panel="\${section}"\`, \`<section class="section hidden-panel" data-panel="\${section}"\`);\n}\n`;
  source = source.replace(old, replacement);
  source = source.replace("  ['repairLegacyLinks','repairLinks'],\n", '');
  source = source.replace('immutable versioning ready, shared menu modules published, legacy runtime/polling deferred.', 'immutable versioning ready, shared menu modules published, retired runtime removed and polling guarded.');
  must(!source.includes('mustReplace('), 'retired overview mustReplace dependency survived');
  must(!source.includes('overview services'), 'retired overview/services dependency survived');
  must(!source.includes('overview finance'), 'retired overview/finance dependency survived');
  write('scripts/admin-performance-postbuild.mjs', source);
}

function purgeBuildInputs() {
  let build = read('scripts/build.mjs');
  for (const dead of ["'admin.html',", "'control-center-ops.css',", "'control-center.js',", "'control-center-features.js',", "'compact-control-center.js',"]) build = build.replaceAll(dead, '');

  const legacyStartMarker = 'const [compactCss, compactJs, deviceControlCss, deviceControlJs, hybridExecutionAdminJs] = await Promise.all([';
  if (build.includes(legacyStartMarker)) {
    const start = build.indexOf(legacyStartMarker);
    const endMarker = "await writeFile(`${output}compact-control-center.js`, `${compactJs}\\n${deviceControlJs}\\n${hybridExecutionAdminJs}\\n`);";
    const end = build.indexOf(endMarker, start);
    must(end > start, 'legacy compact build block not found');
    const replacement = [
      'const [compactCss, deviceControlCss] = await Promise.all([',
      "\n  readFile(`${output}compact-control-center.css`, 'utf8'),",
      "\n  readFile(`${root}device-control-admin.css`, 'utf8'),",
      '\n]);',
      "\nawait writeFile(`${output}compact-control-center.css`, `${compactCss}\\n${deviceControlCss}\\n`);",
    ].join('');
    build = build.slice(0, start) + replacement + build.slice(end + endMarker.length);
  }

  build = build.replaceAll('compact-control-center.js control-center-features.js campus-actions.js admin-menu-layout.js admin-demand-loader.js', 'compact-control-center.js admin-menu-layout.js admin-demand-loader.js');
  for (const dead of ['admin.html','control-center-ops.css','control-center.js','control-center-features.js']) must(!build.includes(`'${dead}'`), `dead build asset survived: ${dead}`);
  write('scripts/build.mjs', build);
}

function purgeCheckInputs() {
  let pkg = read('package.json');
  pkg = pkg.replaceAll('node --check control-center.js && ', '');
  pkg = pkg.replaceAll('node --check control-center-features.js && ', '');
  pkg = pkg.replaceAll('node --check compact-control-center.js && ', '');
  write('package.json', pkg);
}

function purgeDisplayNameLegacyRequirements() {
  let source = read('scripts/normalize-platform-ai-names.mjs');
  source = source.replace("  'admin.html',\n", '');
  source = source.replace("  'control-center-features.js',\n", '');
  source = source.replace("  'admin.html': ['<strong>에코디서점</strong><small>books.ekodi.kr</small>', '<strong>마케팅 AI</strong>']\n", '');
  must(!source.includes("'admin.html': ["), 'retired admin.html canonical requirement survived');
  write('scripts/normalize-platform-ai-names.mjs', source);
}

function purgeWorkerRoutes() {
  let worker = read('site-worker.js');
  for (const dead of ["  '/control-center-ops.css',\n", "  '/control-center.js',\n", "  '/control-center-features.js',\n"]) worker = worker.replaceAll(dead, '');
  must(!worker.includes("'/control-center.js'"), 'retired control-center runtime remains routable');
  must(!worker.includes("'/control-center-features.js'"), 'retired feature runtime remains routable');
  must(!worker.includes("'/control-center-ops.css'"), 'retired operations CSS remains routable');
  write('site-worker.js', worker);
}

function deleteDeadSources() {
  for (const path of ['admin.html','control-center.js','control-center-features.js','control-center-ops.css','compact-control-center.js']) {
    if (existsSync(path)) rmSync(path);
  }
}

purgeControlCenterHtml();
migrateMenuToRegistryOnly();
purgeAuthenticatedShellCompatibility();
purgeThinPostbuildLegacyGenerator();
purgePerformanceDependencies();
purgeBuildInputs();
purgeCheckInputs();
purgeDisplayNameLegacyRequirements();
purgeWorkerRoutes();
deleteDeadSources();

for (const path of ['admin.html','control-center.js','control-center-features.js','control-center-ops.css','compact-control-center.js']) {
  must(!existsSync(path), `retired source still exists: ${path}`);
}

console.log('Retired admin implementation purged: old overview markup/generator, legacy repair path, duplicate runtime inputs and dead source files removed.');
