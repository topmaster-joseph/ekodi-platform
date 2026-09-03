import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = /(staging|release|build|development|legacy)/i;
const wranglers = fs.readdirSync(root)
  .filter(name => /^wrangler\..+\.toml$/.test(name) && !ignored.test(name));

function sourceHasAdmin(file, seen = new Set()) {
  const full = path.resolve(root, file);
  if (seen.has(full) || !fs.existsSync(full)) return false;
  seen.add(full);
  const source = fs.readFileSync(full, 'utf8');
  if (source.includes("'/admin'") || source.includes('"/admin"')) return true;
  const imports = [...source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)]
    .map(match => match[1])
    .map(spec => path.relative(root, path.resolve(path.dirname(full), spec)));
  return imports.some(next => sourceHasAdmin(next, seen));
}

const failures = [];
const audited = [];
for (const wrangler of wranglers) {
  const text = fs.readFileSync(path.join(root, wrangler), 'utf8');
  const main = text.match(/^main\s*=\s*"([^"]+)"/m)?.[1];
  const patterns = [...text.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map(match => match[1]);
  const hosts = patterns.map(value => value.split('/')[0].replace(/^\*\./, ''))
    .filter(host => host.endsWith('.ekodi.kr') && host !== 'ekodi.kr');
  if (!main || !hosts.length) continue;
  const ok = sourceHasAdmin(main);
  audited.push(...hosts.map(host => ({ host, wrangler, main, ok })));
  if (!ok) failures.push(`${wrangler} -> ${main}: ${hosts.join(', ')}`);
}

for (const [label, file] of [
  ['cafe.ekodi.kr', 'sites/ekodi-cafe/_redirects'],
  ['mall.ekodi.kr', 'sites/ekodi-mall/_redirects'],
]) {
  const full = path.join(root, file);
  const ok = fs.existsSync(full) && /\/admin\/?\s+https:\/\/admin\.ekodi\.kr\//.test(fs.readFileSync(full, 'utf8'));
  audited.push({ host: label, wrangler: file, main: file, ok });
  if (!ok) failures.push(`${label}: missing Pages /admin redirect in ${file}`);
}

if (failures.length) {
  console.error('EKODI admin subdomain route contract failed:\n' + failures.map(v => `- ${v}`).join('\n'));
  process.exit(1);
}
console.log(`EKODI admin subdomain route contract OK: ${audited.length} routed host checks`);
