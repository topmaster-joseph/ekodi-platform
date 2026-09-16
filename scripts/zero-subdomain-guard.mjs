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
  catch { fail(`${label} must be an absolute URL: ${value}`); return null; }
  if (url.protocol !== 'https:') fail(`${label} must use https`);
  if (url.hostname !== policy.canonicalHost) fail(`${label} must use ${policy.canonicalHost}, not ${url.hostname}`);
  if (url.port || url.username || url.password || url.search || url.hash) fail(`${label} must be a clean canonical URL`);
  if (normalizePath(url.pathname) !== expectedPath) fail(`${label} must use ${expectedPath}, not ${url.pathname}`);
  return url;
}

function requireValue(label, actual, expected) {
  if (actual !== expected) fail(`${label} must remain ${expected}`);
}

if (policy.version < 2) fail('domain canonical policy must use site-boundary contract version 2 or later');
requireValue('canonicalHost', policy.canonicalHost, 'ekodi.kr');
requireValue('publicAddressPolicy', policy.publicAddressPolicy, 'apex-path-only');
requireValue('subdomainPolicy', policy.subdomainPolicy, 'forbidden');
if (policy.legacySubdomainRedirects !== false) fail('legacy subdomain redirects must remain disabled');
requireValue('internalServiceRouting', policy.internalServiceRouting, 'service-binding-or-private-worker');

const boundary = policy.siteBoundaryPolicy || {};
if (boundary.registrationRequired !== true) fail('all independent sites must be registered in the canonical site registry');
if (boundary.independentSitesOwnTopLevelPath !== true) fail('independent sites must own a first-level ekodi.kr path');
if (boundary.nestedIndependentSites !== false) fail('independent sites must not be nested beneath another independent site');
requireValue('siteBoundaryPolicy.siteRootPattern', boundary.siteRootPattern, 'https://ekodi.kr/{site}');
requireValue('siteBoundaryPolicy.siteAdminPattern', boundary.siteAdminPattern, 'https://ekodi.kr/{site}/admin');
requireValue('siteBoundaryPolicy.serviceUserPattern', boundary.serviceUserPattern, 'https://ekodi.kr/{site}/{service}');
requireValue('siteBoundaryPolicy.serviceAdminPattern', boundary.serviceAdminPattern, 'https://ekodi.kr/{site}/{service}/admin');
requireValue('siteBoundaryPolicy.platformAdminRoot', boundary.platformAdminRoot, 'https://ekodi.kr/admin');
requireValue('siteBoundaryPolicy.platformServiceAdminPattern', boundary.platformServiceAdminPattern, 'https://ekodi.kr/admin/{service}');

const allowedKinds = new Set(boundary.appliesTo || []);
const reservedTopLevelPaths = new Set(boundary.reservedTopLevelPaths || []);
const sites = policy.sites || {};
const rootOwners = new Map();

for (const requiredSite of boundary.requiredIndependentSites || []) {
  if (!sites[requiredSite]) fail(`required independent site is missing from registry: ${requiredSite}`);
}

for (const [slug, site] of Object.entries(sites)) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail(`site slug must be lowercase URL-safe text: ${slug}`);
  if (reservedTopLevelPaths.has(slug)) fail(`site slug is reserved for the platform: ${slug}`);
  if (!allowedKinds.has(site.kind)) fail(`sites.${slug}.kind is not covered by siteBoundaryPolicy.appliesTo: ${site.kind}`);

  const expectedRootPath = `/${slug}`;
  const expectedAdminPath = `/${slug}/admin`;
  const rootUrl = requireApexUrl(`sites.${slug}.root`, site.root, expectedRootPath);
  requireApexUrl(`sites.${slug}.admin`, site.admin, expectedAdminPath);

  if (site.root && site.admin && site.admin !== `${site.root}/admin`) {
    fail(`sites.${slug}.admin must remain the site root plus /admin`);
  }

  if (rootUrl) {
    const segments = normalizePath(rootUrl.pathname).split('/').filter(Boolean);
    if (segments.length !== 1 || segments[0] !== slug) {
      fail(`sites.${slug}.root must own exactly one top-level path segment`);
    }
    const owner = rootOwners.get(site.root);
    if (owner) fail(`independent sites cannot share a root: ${owner} and ${slug}`);
    rootOwners.set(site.root, slug);
  }
}

requireApexUrl('marketing.productPublic', policy.marketing?.productPublic, '/marketing');
requireApexUrl('marketing.platformAdmin', policy.marketing?.platformAdmin, '/admin/marketing');

for (const [siteSlug, contract] of Object.entries(policy.marketing?.tenants || {})) {
  if (!sites[siteSlug]) fail(`marketing tenant must reference a registered independent site: ${siteSlug}`);
  const expectedUserPath = `/${siteSlug}/marketing`;
  const expectedAdminPath = `${expectedUserPath}/admin`;
  requireApexUrl(`marketing.tenants.${siteSlug}.user`, contract.user, expectedUserPath);
  requireApexUrl(`marketing.tenants.${siteSlug}.admin`, contract.admin, expectedAdminPath);
  if (contract.user && contract.admin && contract.admin !== `${contract.user}/admin`) {
    fail(`marketing.tenants.${siteSlug}.admin must remain the service route plus /admin`);
  }
}

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
  console.error('❌ EKODI Zero-Subdomain / Site-Boundary Guard failed.');
  for (const message of failures) console.error(` - ${message}`);
  console.error('Use https://ekodi.kr/<site>, /<site>/admin and private service bindings for internal execution.');
  process.exit(1);
}

console.log('✅ EKODI Zero-Subdomain / Site-Boundary Guard passed: independent sites own first-level paths, admins remain under each site, and this change adds no EKODI subdomains.');
