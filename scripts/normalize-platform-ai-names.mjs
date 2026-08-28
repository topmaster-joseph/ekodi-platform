import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selfPath = path.resolve(fileURLToPath(import.meta.url));

const replacements = new Map([
  ['에코디 비즈니스 OS', '비즈니스 OS'],
  ['EKODI Business OS', 'Business OS'],
  ['EKODI BUSINESS OS', 'BUSINESS OS'],
  ['<span><strong>EKODI</strong><small>BUSINESS OS</small></span>', '<span><strong>BUSINESS OS</strong></span>'],
  ['에코디 경영플랫폼', '경영플랫폼'],
  ['EKODI Management Platform', 'Management Platform'],
  ['EKODI MANAGEMENT PLATFORM', 'MANAGEMENT PLATFORM'],
  ['에코디 쇼핑플랫폼', '쇼핑플랫폼'],
  ['EKODI Shop Platform', 'Shop Platform'],
  ['EKODI SHOP PLATFORM', 'SHOP PLATFORM'],
  ['에코디커뮤니티', '커뮤니티'],
  ['에코디 커뮤니티', '커뮤니티'],
  ['EKODI COMMUNITY', 'COMMUNITY'],
  ['EKODI Community', 'Community'],
  ['<span><strong>EKODI</strong><small>COMMUNITY</small></span>', '<span><strong>COMMUNITY</strong></span>'],
  ['에코디출판', '출판'],
  ['에코디 출판', '출판'],
  ['EKODI Publishing', 'Publishing'],
  ['EKODI PUBLISHING', 'PUBLISHING'],
  ['에코디 마케팅 AI', '마케팅 AI'],
  ['EKODI Marketing AI', 'Marketing AI'],
  ['EKODI MARKETING AI', 'MARKETING AI'],
  ['에코디 지원사업 AI', '지원사업 AI'],
  ['EKODI Support Opportunity AI', 'Support Opportunity AI'],
  ['EKODI SUPPORT OPPORTUNITY AI', 'SUPPORT OPPORTUNITY AI'],
  ['에코디 크리에이터 AI', '크리에이터 AI'],
  ['EKODI Creator AI', 'Creator AI'],
  ['EKODI CREATOR AI', 'CREATOR AI'],
  ['에코디 에너지 AI', '에너지 AI'],
  ['EKODI Energy AI', 'Energy AI'],
  ['EKODI ENERGY AI', 'ENERGY AI'],
  ['<span>EKODI <b>ENERGY AI</b></span>', '<span><b>ENERGY AI</b></span>'],
  ['EKODI Life AI', 'Life AI'],
  ['EKODI LIFE AI', 'LIFE AI']
]);

const displayNames = [
  'Business OS',
  'Management Platform',
  'Shop Platform',
  'Community',
  'Publishing',
  'Marketing AI',
  'Support Opportunity AI',
  'Creator AI',
  'Energy AI',
  'Life AI'
];
const allowedExtensions = new Set(['.html', '.js', '.mjs', '.json', '.jsx', '.ts', '.tsx', '.yml', '.yaml']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', '.wrangler']);
const changed = [];
const remaining = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!entry.isFile() || absolute === selfPath || !allowedExtensions.has(path.extname(entry.name))) continue;

    let source = fs.readFileSync(absolute, 'utf8');
    const original = source;
    for (const [from, to] of replacements) source = source.split(from).join(to);
    if (source !== original) {
      fs.writeFileSync(absolute, source);
      changed.push(path.relative(root, absolute));
    }
  }
}

walk(root);

function scanFile(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  for (const banned of replacements.keys()) {
    if (source.includes(banned)) remaining.push(`${relative}: ${banned}`);
  }
  if (path.extname(relative) === '.html') {
    const renderedText = source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    for (const name of displayNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (new RegExp(`EKODI\\s+${escaped}`, 'i').test(renderedText)) {
        remaining.push(`${relative}: rendered EKODI ${name}`);
      }
    }
  }
}

for (const relative of changed) scanFile(relative);

if (remaining.length) {
  console.error('Prefix-free display-name enforcement failed:');
  for (const item of [...new Set(remaining)]) console.error(`- ${item}`);
  process.exit(1);
}

console.log(changed.length
  ? `Normalized platform/AI display names in ${changed.length} source file(s): ${changed.join(', ')}`
  : 'Platform/AI display names already follow the prefix-free policy.');
