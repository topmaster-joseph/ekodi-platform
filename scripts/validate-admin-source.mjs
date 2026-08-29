import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const retiredFiles = [
  'admin.html',
  'control-center.js',
  'control-center-features.js',
  'control-center-ops.css',
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

if (violations.length) {
  console.error('❌ Retired admin source policy failed');
  for (const violation of violations) console.error(` - ${violation}`);
  process.exit(1);
}
console.log('✅ Retired admin source policy passed: deleted implementation stays deleted and old entry paths are explicit 404s.');
