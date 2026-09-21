import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

const retiredArtifacts = [
  'service-admin-entry-worker.js',
  'wrangler.service-admin-entry.toml',
  'wrangler.service-admin-entry.staging.toml',
  'deploy/manifests/service-admin-entry.worker.json',
  '.github/workflows/deploy-service-admin-entry.yml',
  'test/service-admin-entry-gateway.test.mjs',
];
for (const file of retiredArtifacts) {
  if (fs.existsSync(path.join(root, file))) failures.push(`retired redirect-only admin artifact exists: ${file}`);
}

for (const name of fs.readdirSync(root)) {
  if (!/^wrangler\..+\.toml$/.test(name)) continue;
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  for (const match of text.matchAll(/pattern\s*=\s*"([^"]+)"/g)) {
    const route = match[1];
    const host = route.split('/')[0].replace(/^\*\./, '');
    if (host.endsWith('.ekodi.kr') && host !== 'ekodi.kr' && /\/admin\*?$/.test(route)) {
      failures.push(`${name}: public subdomain admin redirect route is forbidden: ${route}`);
    }
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === '_redirects') {
      const rel = path.relative(root, full);
      const text = fs.readFileSync(full, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        if (/^\s*\/admin\/?\s+https:\/\/(?:[A-Za-z0-9-]+\.)+ekodi\.kr(?:\/|\s|$)/i.test(line)) {
          failures.push(`${rel}: public subdomain admin redirect is forbidden: ${line.trim()}`);
        }
      }
    }
  }
}
for (const dir of ['sites']) {
  const full = path.join(root, dir);
  if (fs.existsSync(full)) walk(full);
}

if (failures.length) {
  console.error('EKODI zero-subdomain admin route contract failed:\n' + failures.map(v => `- ${v}`).join('\n'));
  process.exit(1);
}
console.log('EKODI zero-subdomain admin route contract OK: no public subdomain admin redirects or retired gateway artifacts.');
