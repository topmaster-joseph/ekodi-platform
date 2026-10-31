// Read-only production probe: does every registered EKODI user service actually
// serve the shared Shell (which bundles shell/unified-user-auth.js) on its public
// page, without requiring login to view? Registration alone is not proof.
//
// Sequential, one GET per service, no retries. Stops on a Cloudflare quota signal.
// Emits GitHub annotations so results are readable from the check-run API.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';
import { isQuotaCircuitBreak } from './cloudflare-quota-guard-lib.mjs';

const quotaConfig = JSON.parse(await readFile(fileURLToPath(new URL('../config/cloudflare-production-quota-guard.json', import.meta.url)), 'utf8'));
const delayMs = Math.max(0, Number(process.env.EKODI_UNIFIED_AUTH_DELAY_MS || 400));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gha = Boolean(process.env.GITHUB_ACTIONS);
const esc = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

// Tenant/organization sites the operating policy names explicitly but that are not
// user services in the manifest. Audited the same way; reported, not enforced.
const extraSites = [
  { id: 'cgma (청계상인회)', url: 'https://ekodi.kr/cgma', state: 'tenant' },
  { id: 'seonammedi (서남권 국립의대)', url: 'https://ekodi.kr/seonammedi', state: 'tenant' },
  { id: 'singles (동행)', url: 'https://ekodi.kr/singles', state: 'tenant' },
];

const targets = [
  ...EKODI_SERVICE_MANIFEST.services
    .filter(s => s.state !== 'planned' && s.shellIntegration !== 'planned')
    .map(s => ({ id: s.id, url: s.url, state: s.state || 'registered', integration: s.shellIntegration || 'none', enforced: true })),
  ...extraSites.map(s => ({ ...s, integration: 'tenant-site', enforced: false })),
];

async function probe(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache', 'user-agent': 'EKODI-unified-auth-probe/1 (+read-only)' } });
    const text = await res.text();
    return { status: res.status, finalUrl: res.url || url, headers: res.headers, text };
  } catch (error) {
    return { status: 0, finalUrl: url, headers: new Headers(), text: '', error: String(error?.message || error) };
  }
}

function classify(r) {
  const h = r.headers;
  const shellHeader = h.get('x-ekodi-shell') || h.get('x-ekodi-user-ui') || h.get('x-ekodi-user-chrome') || '';
  const shellInHtml = /\/shell\/shell\.js/.test(r.text);
  const final = new URL(r.finalUrl);
  // Public pages must be viewable before login: a redirect to the auth hub,
  // Google, or Cloudflare Access on a plain GET means login is forced.
  const forcedLogin = final.pathname === '/auth' || final.pathname.startsWith('/auth/')
    || final.host === 'accounts.google.com' || final.host.endsWith('cloudflareaccess.com');
  return {
    shell: Boolean(shellHeader || shellInHtml),
    shellHeader: shellHeader || '-',
    publicView: r.status >= 200 && r.status < 400 && !forcedLogin,
    finalHost: final.host + final.pathname,
  };
}

// The Shell bundle itself must carry the unified user-auth component.
const bundle = await probe('https://ekodi.kr/shell/shell.js');
if (isQuotaCircuitBreak({ status: bundle.status, body: bundle.text, config: quotaConfig.circuitBreaker })) {
  console.error('CF-QUOTA-001: quota circuit open on shell bundle; stopping without fan-out.');
  process.exit(75);
}
const bundleAuth = bundle.headers.get('x-ekodi-unified-user-auth') || (/maxVisibleNameCharacters|shortName\(display\)/.test(bundle.text) ? 'v1(body)' : 'missing');

const rows = [];
for (const t of targets) {
  const r = await probe(t.url);
  if (isQuotaCircuitBreak({ status: r.status, body: r.text, config: quotaConfig.circuitBreaker })) {
    console.error(`CF-QUOTA-001: quota circuit open at ${t.url}; stopping after ${rows.length} services.`);
    break;
  }
  const c = classify(r);
  rows.push({ ...t, status: r.status, ...c, error: r.error || '' });
  await sleep(delayMs);
}

const ok = row => row.status >= 200 && row.status < 400 && row.shell && row.publicView;
const failing = rows.filter(r => r.enforced && !ok(r));
const tenantGaps = rows.filter(r => !r.enforced && !ok(r));

const lines = rows.map(r => `${ok(r) ? 'OK ' : 'GAP'} ${r.id} [${r.integration}/${r.state}] http=${r.status} shell=${r.shell ? r.shellHeader : 'none'} public=${r.publicView} -> ${r.finalHost}${r.error ? ' err=' + r.error : ''}`);
const summary = `shell.js unified-user-auth=${bundleAuth}; services probed=${rows.filter(r => r.enforced).length}, ok=${rows.filter(r => r.enforced && ok(r)).length}, gaps=${failing.length}; tenant sites gaps=${tenantGaps.length}/${extraSites.length}`;

console.log(summary);
for (const line of lines) console.log(line);
if (gha) {
  console.log(`::notice title=Unified auth live summary::${esc(summary)}`);
  // Few annotations, each carrying many rows: check-run annotations are capped per step.
  for (let i = 0; i < lines.length; i += 12) console.log(`::notice title=Unified auth rows ${i + 1}-${Math.min(i + 12, lines.length)}::${esc(lines.slice(i, i + 12).join('\n'))}`);
  for (const f of failing.slice(0, 8)) console.log(`::error title=Unified auth gap: ${f.id}::${esc(`${f.url} http=${f.status} shell=${f.shell} public=${f.publicView}`)}`);
}
if (String(process.env.EKODI_UNIFIED_AUTH_ENFORCE || '') === '1' && (failing.length || bundleAuth === 'missing')) process.exit(1);
