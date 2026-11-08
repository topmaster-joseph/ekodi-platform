import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {ROOT_PATH_SITE_IDS, trafficSiteIdForVisit} from '../traffic-intelligence.js';

// FOOTER-TRAFFIC-GUARANTEE (2026-11-09): the footer summary API answers only for
// registered sites (unknown prefixes return not_site so public payloads cannot
// invent site ids). Therefore every public ekodi.kr site prefix — existing or
// newly added — must be registered, or the footer would stay on "준비 중".
const NON_SITE_PREFIXES = new Set([
  '.well-known', '__ekodi', '_ekodi', 'admin', 'api', 'auth', 'control', 'compact-control-center',
  'deployment-probe', 'health', 'mail', 'mcp', 'my', 'privacy', 'terms', 'preview', 'shell',
  'webhooks', 'google-origin-bridge', 'verify', 'o2o', 'admin-menu-', 'index',
  'auth-center', 'oauth-consent', 'admin-shell', 'workspace-admin',
  'cg', // glob fragment of "/cg*" (cgma, cgmurrc are registered individually)
]);

function firstSegment(path) {
  const segment = String(path || '').replace(/^\/+/, '').split(/[/*?]/)[0].toLowerCase();
  return segment && !/[.${}]/.test(segment) ? segment : '';
}

async function publicPrefixes() {
  const prefixes = new Set();
  const site = await readFile('wrangler.site.toml', 'utf8');
  const workerFirst = site.match(/^run_worker_first\s*=\s*\[([^\]]*)\]/m)?.[1] || '';
  for (const match of workerFirst.matchAll(/"([^"]+)"/g)) if (!match[1].startsWith('!')) prefixes.add(firstSegment(match[1]));
  for (const name of await readdir('.')) {
    if (!/^wrangler\..*\.toml$/.test(name) || /(?:staging|development|build|dev)\b/.test(name)) continue;
    const toml = await readFile(name, 'utf8');
    for (const match of toml.matchAll(/pattern\s*=\s*"ekodi\.kr\/([^"]*)"/g)) prefixes.add(firstSegment(match[1]));
  }
  const build = await readFile('scripts/build.mjs', 'utf8');
  for (const match of build.matchAll(/\$\{output\}([^`'"]+)/g)) prefixes.add(firstSegment(match[1]));
  // Root assets such as history.html are also served extensionless (/history).
  const assets = build.match(/const assets = \[([\s\S]*?)\];/)?.[1] || '';
  for (const match of assets.matchAll(/'([a-z0-9-]+)\.html'/g)) prefixes.add(match[1]);
  prefixes.delete('');
  return [...prefixes].sort();
}

test('every public ekodi.kr site prefix is registered for footer visit statistics', async () => {
  const missing = (await publicPrefixes()).filter(prefix => !NON_SITE_PREFIXES.has(prefix) && !ROOT_PATH_SITE_IDS[prefix]);
  assert.deepEqual(missing, [], 'Register new public sites in ROOT_PATH_SITE_IDS (traffic-intelligence.js) and the Shell trafficKnownRoots list, or add a documented non-site prefix.');
});

test('registered prefixes resolve to their own site, never the root counter', () => {
  for (const prefix of ['pyeonggongmok', 'sosik', 'qtin', 'mokpo-presbytery', 'jubilee', 'open', 'business-coop', 'singles', 'proposal', 'cgmurrc', 'ekodipay']) {
    const site = trafficSiteIdForVisit('ekodi.kr', prefix);
    assert.notEqual(site, 'root', prefix);
  }
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'ekodipay'), 'pay');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'not-a-registered-site'), 'root');
});

test('Shell visit beacon and server registry list the same single-segment sites', async () => {
  const shell = await readFile('shell/shell.js', 'utf8');
  const list = shell.match(/const trafficKnownRoots=new Set\('([^']+)'\.split/)?.[1];
  assert.ok(list, 'Shell trafficKnownRoots list');
  const shellRoots = new Set(list.split(' '));
  const serverRoots = Object.keys(ROOT_PATH_SITE_IDS).filter(key => !key.includes('/'));
  assert.deepEqual(serverRoots.filter(key => !shellRoots.has(key)), [], 'Shell is missing server-registered roots');
  assert.deepEqual([...shellRoots].filter(key => !ROOT_PATH_SITE_IDS[key]), [], 'Shell sends roots the server does not know');
});

test('root-level files use the EKODI root summary instead of an unregistered prefix', async () => {
  const footer = await readFile('shell/user-ui-footer.js', 'utf8');
  assert.match(footer, /const sharedLegal=\['privacy','terms'\]\.includes\(root\)\|\|root\.includes\('\.'\);/);
});
