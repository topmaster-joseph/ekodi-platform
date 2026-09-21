import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apex = ['ekodi', 'kr'].join('.');
const escapedApex = apex.replaceAll('.', '\\.');
const publicHostPattern = new RegExp(`(?:\\*\\.|(?:[A-Za-z0-9_-]+\\.)+)${escapedApex}`, 'gi');
const self = path.relative(root, fileURLToPath(import.meta.url)).replaceAll('\\', '/');

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('EKODI subdomain-zero gate could not enumerate tracked files.');
    process.exit(1);
  }
  return result.stdout.split('\0').filter(Boolean);
}

function isInfrastructureDns(hostname) {
  const host = hostname.toLowerCase().replace(/^\*\./, '');
  return host === `_dmarc.${apex}`
    || host === `_acme-challenge.${apex}`
    || host.startsWith(`_acme-challenge.`) && host.endsWith(`.${apex}`)
    || host.includes(`._domainkey.${apex}`);
}

function looksBinary(buffer) {
  const limit = Math.min(buffer.length, 8192);
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

const failures = [];
const infrastructureReferences = [];
for (const relative of trackedFiles()) {
  const normalized = relative.replaceAll('\\', '/');
  if (normalized === self || normalized.startsWith('artifacts/')) continue;
  const full = path.join(root, relative);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
  const buffer = fs.readFileSync(full);
  if (looksBinary(buffer)) continue;
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const matches = lines[index].match(publicHostPattern) || [];
    for (const raw of matches) {
      const host = raw.toLowerCase();
      const entry = `${normalized}:${index + 1}: ${host}`;
      if (isInfrastructureDns(host)) infrastructureReferences.push(entry);
      else failures.push(entry);
    }
  }
}

if (failures.length) {
  console.error('EKODI SUBDOMAIN-ZERO gate failed. Public *.ekodi.kr references are forbidden; use ekodi.kr path routing only.');
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('EKODI SUBDOMAIN-ZERO gate OK: no public *.ekodi.kr reference exists in tracked source/config/docs.');
if (infrastructureReferences.length) {
  console.log(`Infrastructure DNS references allowed for mail/certificate validation: ${new Set(infrastructureReferences).size}`);
}
