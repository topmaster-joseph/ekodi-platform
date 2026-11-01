// Read-only readiness check for retiring the wave-2 first-level subdomains.
// For each target in config/retire-public-subdomains-wave2.json it fetches the
// apex health path (must already serve the service with its expected markers)
// and the legacy subdomain (to report whether it is still live). Nothing is
// changed; the actual retirement stays a separate, gated release.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isQuotaCircuitBreak } from './cloudflare-quota-guard-lib.mjs';

const read = p => readFile(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8');
const wave = JSON.parse(await read('config/retire-public-subdomains-wave2.json'));
const quota = JSON.parse(await read('config/cloudflare-production-quota-guard.json'));
const gha = Boolean(process.env.GITHUB_ACTIONS);
const esc = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache', 'user-agent': 'EKODI wave2 readiness (read-only)' }, signal: AbortSignal.timeout(15000) });
    return { status: res.status, text: await res.text(), final: res.url };
  } catch (error) {
    return { status: 0, text: '', final: url, error: String(error?.cause?.code || error?.message || error) };
  }
}

const rows = [];
for (const t of wave.targets) {
  const apex = await get(t.apexHealth);
  if (isQuotaCircuitBreak({ status: apex.status, body: apex.text, config: quota.circuitBreaker })) {
    console.error('CF-QUOTA-001: quota circuit open; stopping.');
    break;
  }
  const missing = (t.apexExpect || []).filter(m => !apex.text.includes(m));
  const apexReady = apex.status === 200 && missing.length === 0;
  const legacyUrl = `https://${t.label}.${wave.rootDomain}/`;
  const legacy = await get(legacyUrl);
  rows.push({ label: t.label, apexReady, apexStatus: apex.status, missing, legacyStatus: legacy.status, legacyError: legacy.error || '', legacyFinal: legacy.final });
  await sleep(300);
}

const ready = rows.filter(r => r.apexReady);
const lines = rows.map(r => `${r.apexReady ? 'READY' : 'NOT  '} ${r.label}: apex=${r.apexStatus}${r.missing.length ? ' missing=' + r.missing.join('|') : ''} legacy=${r.legacyStatus || r.legacyError}${r.legacyFinal && !r.legacyFinal.startsWith(`https://${r.label}.`) ? ' -> ' + r.legacyFinal : ''}`);
const summary = `wave2 apex readiness: ${ready.length}/${rows.length} ready`;
console.log(summary);
for (const l of lines) console.log(l);
if (gha) {
  console.log(`::notice title=Subdomain wave 2 readiness::${esc(summary)}`);
  for (let i = 0; i < lines.length; i += 9) console.log(`::notice title=Wave 2 targets ${i + 1}-${Math.min(i + 9, lines.length)}::${esc(lines.slice(i, i + 9).join('\n'))}`);
}
