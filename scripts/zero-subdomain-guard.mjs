import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const policyFile = path.join(root, 'config/domain-canonical-policy.json');
const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
const failures = [];

const fail = message => failures.push(message);
const normalizePath = value => value.length > 1 ? value.replace(/\/+$/, '') : value;

function requireApexUrl(label, value, expectedPath) {
  let url;
  try { url = new URL(value); }
  catch { fail(`${label} must be an absolute URL: ${value}`); return; }
  if (url.protocol !== 'https:') fail(`${label} must use https`);
  if (url.hostname !== policy.canonicalHost) fail(`${label} must use ${policy.canonicalHost}, not ${url.hostname}`);
  if (url.port || url.username || url.password || url.search || url.hash) fail(`${label} must be a clean canonical URL`);
  if (normalizePath(url.pathname) !== expectedPath) fail(`${label} must use ${expectedPath}, not ${url.pathname}`);
}

if (policy.canonicalHost !== 'ekodi.kr') fail('canonicalHost must remain ekodi.kr');
if (policy.publicAddressPolicy !== 'apex-path-only') fail('publicAddressPolicy must remain apex-path-only');
if (policy.subdomainPolicy !== 'forbidden') fail('subdomainPolicy must remain forbidden');
if (policy.legacySubdomainRedirects !== false) fail('legacy subdomain redirects must remain disabled');
if (policy.internalServiceRouting !== 'service-binding-or-private-worker') fail('internal services must use private routing, not public subdomains');

requireApexUrl('marketing.productPublic', policy.marketing?.productPublic, '/marketing');
requireApexUrl('marketing.platformAdmin', policy.marketing?.platformAdmin, '/admin/marketing');
requireApexUrl('marketing.tenants.ekodibiz.user', policy.marketing?.tenants?.ekodibiz?.user, '/ekodibiz/marketing');
requireApexUrl('marketing.tenants.ekodibiz.admin', policy.marketing?.tenants?.ekodibiz?.admin, '/ekodibiz/marketing/admin');

const userUrl = policy.marketing?.tenants?.ekodibiz?.user;
const adminUrl = policy.marketing?.tenants?.ekodibiz?.admin;
if (userUrl && adminUrl && adminUrl !== `${userUrl}/admin`) fail('tenant admin must remain the tenant user route plus /admin');

function gitDiff() {
  const base = String(process.env.ZERO_SUBDOMAIN_BASE_SHA || '').trim();
  try {
    if (base && !/^0+$/.test(base)) return execFileSync('git', ['diff', '--unified=0', `${base}...HEAD`], { cwd: root, encoding: 'utf8' });
    return execFileSync('git', ['diff', '--unified=0', 'HEAD~1', 'HEAD'], { cwd: root, encoding: 'utf8' });
  } catch (error) {
    fail(`unable to inspect git diff: ${error.message}`);
    return '';
  }
}

const ignoredFiles = new Set(['scripts/zero-subdomain-guard.mjs']);
const hostPattern = /(?<!@)\b(?:[a-z0-9-]+\.)+ekodi\.kr\b|\*\.ekodi\.kr\b/ig;
let currentFile = '';
for (const line of gitDiff().split('\n')) {
  if (line.startsWith('+++ b/')) { currentFile = line.slice(6); continue; }
  if (!line.startsWith('+') || line.startsWith('+++') || ignoredFiles.has(currentFile)) continue;
  const added = line.slice(1);
  const matches = [...added.matchAll(hostPattern)].map(match => match[0]);
  for (const host of matches) fail(`${currentFile}: new EKODI subdomain reference is forbidden: ${host}`);
}

if (failures.length) {
  console.error('❌ EKODI Zero-Subdomain Guard failed.');
  for (const message of failures) console.error(` - ${message}`);
  console.error('Use https://ekodi.kr/<path> for public/canonical routes and private service bindings for internal execution.');
  process.exit(1);
}

console.log('✅ EKODI Zero-Subdomain Guard passed: canonical marketing routes are apex-path-only and this change adds no EKODI subdomains.');
