import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const DEVICE_ASSETS = Object.freeze([
  { path: 'device-control-admin.css', mode: 'exact', markers: ['DEVICE-BOOTSTRAP-WIDE-CANONICAL-20261009', '.device-roster-toolbar'] },
  { path: 'device-control-admin.js', mode: 'source-prefix', markers: ['EKB-219', 'function groupRosterDevices'] },
  { path: 'ekodi-device-bootstrap.cmd', mode: 'exact', markers: ['ekodi-device-agent-bootstrap-', 'EKB-011'] },
]);

const digest = content => createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);

export function assertDeviceAsset(spec, expected, live) {
  if (!expected || typeof expected !== 'string') throw new Error(spec.path + ': expected build artifact missing');
  if (typeof live !== 'string') throw new Error(spec.path + ': live payload missing');
  for (const marker of spec.markers) {
    if (!expected.includes(marker)) throw new Error(spec.path + ': expected build is missing ' + marker);
    if (!live.includes(marker)) throw new Error(spec.path + ': live is missing ' + marker);
  }
  // Authenticated Admin may append runtime-only enhancements after the source.
  // It must never serve a stale/partial source, even if a few old markers match.
  const matches = spec.mode === 'source-prefix' ? live.startsWith(expected) : live === expected;
  if (!matches) throw new Error(spec.path + ': version drift expected=' + digest(expected) + ' live=' + digest(live));
  return { path:spec.path, sha256Prefix:digest(expected), bytes:Buffer.byteLength(live, 'utf8'), mode:spec.mode };
}

export function assertBootstrapRedirect(response) {
  if (response.status !== 307) throw new Error('bootstrap alias: expected HTTP 307, got ' + response.status);
  const location = response.headers.get('location') || '';
  if (location !== '/admin/status/devices') throw new Error('bootstrap alias: unsafe/unexpected Location ' + location);
  const route = response.headers.get('x-ekodi-route') || '';
  if (route !== 'desktop-bootstrap-canonical') throw new Error('bootstrap alias: wrong route owner ' + route);
  if (!/no-store/i.test(response.headers.get('cache-control') || '')) throw new Error('bootstrap alias: missing no-store');
}

async function verifyOnce({ origin, expected, fetchImpl, release }) {
  const nonce = encodeURIComponent(release);
  const probe = async (path, { redirect='follow' }={}) => {
    const response = await fetchImpl(origin + '/' + path + '?ekodi_release_verify=' + nonce, {
      redirect,
      headers: { 'cache-control':'no-cache', 'user-agent':'EKODI-Device-Admin-Release-Verifier/1.0' },
      signal: AbortSignal.timeout(18000)
    });
    return response;
  };
  const checked = [];
  for (const spec of DEVICE_ASSETS) {
    const response = await probe(spec.path);
    if (response.status !== 200) throw new Error(spec.path + ': HTTP ' + response.status);
    checked.push(assertDeviceAsset(spec, expected.get(spec.path), await response.text()));
  }
  // The Admin demand loader can request either the root or /admin asset mirror.
  for (const spec of DEVICE_ASSETS.filter(x => x.path !== 'ekodi-device-bootstrap.cmd')) {
    const response = await probe('admin/' + spec.path);
    if (response.status !== 200) throw new Error('admin/' + spec.path + ': HTTP ' + response.status);
    checked.push(assertDeviceAsset(spec, expected.get(spec.path), await response.text()));
  }
  const admin = await probe('admin/status/devices');
  if (admin.status !== 200 || admin.headers.get('x-ekodi-route') !== 'admin-shell')
    throw new Error('canonical device Admin shell unavailable, HTTP ' + admin.status);
  if (!/no-store/i.test(admin.headers.get('cache-control') || ''))
    throw new Error('canonical device Admin shell is not no-store');
  const bootstrap = await probe('admin/desktop/bootstrap/', { redirect:'manual' });
  assertBootstrapRedirect(bootstrap);
  return checked;
}

export async function verifyDeviceAdminLive({
  origin='https://ekodi.kr',
  expectedDir='dist',
  attempts=12,
  delayMs=5000,
  fetchImpl=fetch,
  log=console,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}={}) {
  origin = String(origin).replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin))
    throw new Error('Device Admin verifier requires HTTPS origin or explicit local test origin');
  attempts = Math.max(1, Math.min(24, Number(attempts)||1));
  delayMs = Math.max(0, Math.min(30000, Number(delayMs)||0));
  const expected = new Map();
  for (const spec of DEVICE_ASSETS) expected.set(spec.path, await readFile(expectedDir + '/' + spec.path, 'utf8'));
  const release = String(process.env.GITHUB_SHA || Date.now()).slice(0, 40);
  let lastError = null;
  for (let attempt=1; attempt<=attempts; attempt++) {
    try {
      const assets = await verifyOnce({origin,expected,fetchImpl,release});
      log.log(JSON.stringify({ok:true,kind:'device-admin-live-parity',origin,attempt,assets}));
      return { ok:true, attempt, assets };
    } catch(error) {
      lastError = error;
      log.error('Device Admin live parity not converged: attempt=' + attempt + '/' + attempts + ' reason=' + error.message);
      if(attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error('Device Admin live parity failed after '+attempts+' attempts: '+lastError?.message);
}

if (import.meta.main) {
  const args = Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{
    const [key,...value] = x.slice(2).split('=');
    return [key,value.join('=')];
  }));
  await verifyDeviceAdminLive({
    origin:args.origin || process.env.EKODI_PRODUCTION_ORIGIN || 'https://ekodi.kr',
    expectedDir:args.expectedDir || 'dist',
    attempts:args.attempts || 12,
    delayMs:args.delayMs || 5000
  });
}
