import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const retiredFiles = [
  'admin.html',
  'control-center.js',
  'control-center-features.js',
  'control-center-ops.css',
  'control-center.html',
  'control-center.css',
  'control-center-finance.css',
  'compact-control-center.css',
];
const forbiddenCompatibility = [
  '/legacy#domains',
  '/legacy#activity',
  'EKODI Platform Operations',
  'OPERATIONS OVERVIEW',
  "overview:'operations'",
  "legacy:'ai-ops'",
  "domains:'ai-ops'",
  "activity:'ai-ops'",
  "location.pathname.startsWith('/legacy')",
];
const allowedExtensions = new Set(['.js','.mjs','.html','.css','.json','.yml','.yaml','.md']);
const ignored = new Set(['.git','node_modules','dist','.wrangler']);
const violations = [];

for (const file of retiredFiles) {
  if (existsSync(join(root, file))) violations.push(`retired source still exists: ${file}`);
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes:true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) { walk(absolute); continue; }
    if (!entry.isFile() || !allowedExtensions.has(extname(entry.name))) continue;
    const rel = relative(root, absolute).replaceAll('\\','/');
    if (rel === 'scripts/validate-admin-source.mjs') continue;
    const source = readFileSync(absolute, 'utf8');
    for (const marker of forbiddenCompatibility) {
      if (source.includes(marker)) violations.push(`${rel}: retired admin compatibility marker: ${marker}`);
    }
  }
}
walk(root);

const worker = readFileSync(join(root, 'site-worker.js'), 'utf8');
for (const path of ['/admin.html','/control-center','/control-center/','/control-center.html','/legacy','/legacy/','/legacy.html','/control-center.js','/control-center-features.js','/control-center-ops.css']) {
  if (!worker.includes(`'${path}'`)) violations.push(`site-worker.js: retired path missing from explicit 404 contract: ${path}`);
}
if (!worker.includes('RETIRED_ADMIN_PATHS.has(url.pathname)')) violations.push('site-worker.js: retired admin 404 gate missing');

const adminPrinciples = readFileSync(join(root, 'ADMIN_UI_PRINCIPLES.md'), 'utf8');
for (const marker of ['공개 사이트의 고정 헤더용 body 상단 여백', '좌측 전역 사이드바는 데스크톱에서 뷰포트에 고정', '독립 세로 스크롤을 만들지 않는다']) {
  if (!adminPrinciples.includes(marker)) violations.push(`ADMIN_UI_PRINCIPLES.md: missing admin viewport contract marker: ${marker}`);
}
const adminDesignCss = readFileSync(join(root, 'admin-design-engine.css'), 'utf8');
const authenticatedShell = readFileSync(join(root, 'admin-authenticated-shell.js'), 'utf8');
for (const marker of ['padding-top:0!important', 'height:100dvh!important', 'overflow-y:hidden!important', 'overflow-y:auto!important']) {
  if (!adminDesignCss.includes(marker)) violations.push(`admin-design-engine.css: missing 8th-gen viewport contract marker: ${marker}`);
}
for (const marker of ["nav.dataset.ekodiIndependentScroll='false'", "main.dataset.ekodiScrollOwner='workspace'"]) {
  if (!authenticatedShell.includes(marker)) violations.push(`admin-authenticated-shell.js: missing 8th-gen scroll ownership marker: ${marker}`);
}
if (authenticatedShell.includes("nav.dataset.ekodiIndependentScroll = 'true'") || authenticatedShell.includes("nav.style.setProperty('overflow-y', 'auto'")) {
  violations.push('admin-authenticated-shell.js: legacy sidebar scroll ownership reintroduced');
}

if (violations.length) {
  console.error('❌ Retired admin source policy failed');
  for (const violation of violations) console.error(` - ${violation}`);
  process.exit(1);
}
console.log('✅ Retired admin source policy passed: deleted implementation stays deleted and old entry paths are explicit 404s.');

await import('./validate-design-engine.mjs');
