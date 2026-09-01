import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const fail = [];

const visible = ADMIN_MENU_REGISTRY.filter(item => !item.internal);
const ids = visible.map(item => item.id);
const idSet = new Set(ids);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) fail.push(`Duplicate admin menu ids: ${[...new Set(duplicates)].join(', ')}`);

for (const item of visible) {
  if (!item.group) fail.push(`${item.id}: missing group`);
  if (!item.labels?.ko) fail.push(`${item.id}: missing Korean label`);
  if (!item.icon) fail.push(`${item.id}: missing icon`);
}

const layout = read('admin-menu-layout.js');
const demand = read('admin-demand-loader.js');
const authenticatedShell = read('admin-authenticated-shell.js');

function pairMapEntries(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*pairMap\\('([^']*)'\\)`));
  if (!match) return new Map();
  return new Map(match[1].trim().split(/\s+/).filter(Boolean).map(pair => pair.split(':')));
}

const hashMap = pairMapEntries(layout, 'HASH');
const canonMap = pairMapEntries(layout, 'CANON');
const demandKeyBlock = layout.match(/const\s+DEMAND_KEYS\s*=\s*new\s+Map\(\[([\s\S]*?)\]\);/);
const demandKeys = new Map();
if (demandKeyBlock) {
  const entryRegex = /\['([^']+)'\s*,\s*'([^']+)'\]/g;
  let match;
  while ((match = entryRegex.exec(demandKeyBlock[1]))) demandKeys.set(match[1], match[2]);
}

const featureBlock = demand.match(/const\s+FEATURES\s*=\s*\{([\s\S]*?)\n\s*\};/);
const featureKeys = new Set();
if (featureBlock) {
  const featureRegex = /(?:^|\n)\s*(?:'([^']+)'|([a-zA-Z0-9_-]+))\s*:/g;
  let match;
  while ((match = featureRegex.exec(featureBlock[1]))) featureKeys.add(match[1] || match[2]);
}

for (const [section, key] of demandKeys) {
  if (!idSet.has(section)) fail.push(`DEMAND_KEYS has unknown section: ${section}`);
  if (!featureKeys.has(key)) fail.push(`DEMAND_KEYS maps ${section} to missing feature: ${key}`);
}

for (const item of visible) {
  if (item.href) continue;
  const canonicalHash = canonMap.get(item.id);
  if (!canonicalHash) fail.push(`${item.id}: missing CANON hash in admin-menu-layout.js`);
  if (canonicalHash && hashMap.get(canonicalHash) !== item.id) fail.push(`${item.id}: CANON hash ${canonicalHash} is not mapped back in HASH`);
}

for (const [hash, section] of hashMap) {
  if (!idSet.has(section) && !['sites'].includes(section)) fail.push(`HASH ${hash} points to unknown section: ${section}`);
}

const shellAssets = [...authenticatedShell.matchAll(/'([^']+\.(?:js|css))'/g)].map(match => match[1]);
const demandAssets = [...demand.matchAll(/'([^']+\.(?:js|css))'/g)].map(match => match[1]);
for (const asset of new Set([...shellAssets, ...demandAssets])) {
  if (!existsSync(resolve(root, asset))) fail.push(`Missing admin asset referenced by loader: ${asset}`);
}

if (fail.length) {
  console.error('Admin menu link validation failed:');
  for (const line of fail) console.error(`- ${line}`);
  process.exit(1);
}

console.log(`Admin menu link validation passed for ${ids.length} visible menu items.`);
