// SEARCH-REGISTER-001: register an EKODI domain with Google Search Console.
// Flow: service-account token -> Site Verification DNS_TXT token -> Cloudflare
// TXT upsert (idempotent, add-only) -> verify (backoff) -> add owner ->
// Search Console sites.add -> sitemaps.submit. Secrets are never printed.
import { createSign } from 'node:crypto';
import { pathToFileURL, domainToASCII } from 'node:url';

export const SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/siteverification',
  'https://www.googleapis.com/auth/webmasters',
]);
const DOMAIN_PATTERN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const XN_PATTERN = /^(?=.{3,253}$)(?:(?:xn--)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

// IDN (e.g. 서남권국립의대.kr) is normalized to ACE/punycode before any API or DNS call.
export function normalizeDomain(domain) {
  const raw = String(domain || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || /[\s/:@?#]/.test(raw)) return '';
  return domainToASCII(raw) || '';
}

export function validateDomain(domain, allowed) {
  const d = normalizeDomain(domain);
  if (!(DOMAIN_PATTERN.test(d) || XN_PATTERN.test(d))) throw new Error(`invalid domain: ${domain}`);
  if (!allowed.map(normalizeDomain).includes(d)) throw new Error(`domain not in EKODI allow-list: ${d}`);
  return d;
}

export function validateSitemapPath(path) {
  const p = String(path || '/sitemap.xml');
  if (!/^\/[A-Za-z0-9._\/-]{1,200}\.xml$/.test(p) || p.includes('..')) throw new Error(`invalid sitemap path: ${path}`);
  return p;
}

export function scDomainUrl(domain) {
  return `sc-domain:${domain}`;
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function buildServiceAccountAssertion(key, now = Math.floor(Date.now() / 1000)) {
  if (!key?.client_email || !key?.private_key) throw new Error('service account key is missing client_email/private_key');
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email, scope: SCOPES.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(key.private_key))}`;
}

export async function backoff(fn, { attempts = 8, baseMs = 5000, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try { return await fn(i); } catch (error) { last = error; if (i < attempts - 1) await sleep(Math.min(baseMs * 2 ** i, 60000)); }
  }
  throw last;
}

export function createClients({ fetchImpl = fetch, googleToken, cfToken }) {
  async function call(url, init, label) {
    const res = await fetchImpl(url, init);
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const message = data?.error?.message || data?.errors?.[0]?.message || `HTTP ${res.status}`;
      const err = new Error(`${label} failed: ${message}`); err.status = res.status; throw err;
    }
    return { status: res.status, data };
  }
  const g = (url, method = 'GET', body) => call(url, {
    method, headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }, `google ${method} ${new URL(url).pathname}`);
  const cf = (path, method = 'GET', body) => call(`https://api.cloudflare.com/client/v4${path}`, {
    method, headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }, `cloudflare ${method}`);
  return { g, cf };
}

export async function ensureTxtRecord(cf, { zoneId, name, content }) {
  const q = new URLSearchParams({ type: 'TXT', name, per_page: '100' });
  const existing = await cf(`/zones/${zoneId}/dns_records?${q}`);
  const rows = existing.data?.result || [];
  const wanted = `"${content}"`;
  const hit = rows.find(r => r.content === content || r.content === wanted);
  if (hit) return { action: 'exists', id: hit.id };
  const created = await cf(`/zones/${zoneId}/dns_records`, 'POST', {
    type: 'TXT', name, content: wanted, ttl: 300, comment: 'Managed by EKODI SEARCH-REGISTER-001',
  });
  return { action: 'created', id: created.data?.result?.id || null };
}

export async function registerDomain({ g, cf, domain, zoneId, sitemapPath, ownerEmail, sleep }) {
  const evidence = { domain, steps: [] };
  const step = (name, detail) => { evidence.steps.push({ name, ...detail }); if (process.env.GITHUB_ACTIONS) console.log(`::notice title=search-register ${name}::${JSON.stringify(detail).slice(0, 300)}`); };
  const site = { type: 'INET_DOMAIN', identifier: domain };

  const tok = await g('https://www.googleapis.com/siteVerification/v1/token', 'POST', { site, verificationMethod: 'DNS_TXT' });
  const token = String(tok.data?.token || '');
  if (!/^google-site-verification=[A-Za-z0-9_-]{8,128}$/.test(token)) throw new Error('unexpected verification token format');
  step('getToken', { status: tok.status });

  const txt = await ensureTxtRecord(cf, { zoneId, name: domain, content: token });
  step('dnsTxt', txt);

  const verified = await backoff(() => g('https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT', 'POST', { site }), { sleep });
  const resourceId = verified.data?.id;
  step('verify', { status: verified.status, owners: (verified.data?.owners || []).length });

  if (ownerEmail && resourceId && !(verified.data?.owners || []).includes(ownerEmail)) {
    const owners = [...new Set([...(verified.data?.owners || []), ownerEmail])];
    const upd = await g(`https://www.googleapis.com/siteVerification/v1/webResource/${encodeURIComponent(resourceId)}`, 'PUT', { site, owners });
    step('addOwner', { status: upd.status });
  }

  const scUrl = encodeURIComponent(scDomainUrl(domain));
  const add = await g(`https://www.googleapis.com/webmasters/v3/sites/${scUrl}`, 'PUT');
  step('searchConsoleAdd', { status: add.status });

  const feed = encodeURIComponent(`https://${domain}${sitemapPath}`);
  const sm = await g(`https://www.googleapis.com/webmasters/v3/sites/${scUrl}/sitemaps/${feed}`, 'PUT');
  step('sitemapSubmit', { status: sm.status });

  const check = await g(`https://www.googleapis.com/webmasters/v3/sites/${scUrl}/sitemaps/${feed}`);
  step('sitemapReadback', { status: check.status, isPending: check.data?.isPending ?? null });
  return evidence;
}

async function main() {
  const allowed = String(process.env.SEARCH_REGISTER_ALLOWED_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const domain = validateDomain(process.env.SEARCH_REGISTER_DOMAIN, allowed);
  const sitemapPath = validateSitemapPath(process.env.SEARCH_REGISTER_SITEMAP_PATH);
  const zoneId = String(process.env.SEARCH_REGISTER_ZONE_ID || '');
  if (!/^[a-f0-9]{32}$/.test(zoneId)) throw new Error('zone id unavailable');
  const key = JSON.parse(process.env.GOOGLE_SEARCH_SA_KEY_JSON || '{}');
  const assertion = buildServiceAccountAssertion(key);
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) throw new Error(`service account token exchange failed: HTTP ${tokenRes.status}`);
  const { g, cf } = createClients({ googleToken: tokenJson.access_token, cfToken: process.env.CLOUDFLARE_API_TOKEN });
  console.log('::notice title=search-register::service account token ok');
  const evidence = await registerDomain({ g, cf, domain, zoneId, sitemapPath, ownerEmail: process.env.SEARCH_REGISTER_OWNER_EMAIL || '' });
  console.log(JSON.stringify({ ok: true, ...evidence }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { const message = String(error?.message || error).replace(/[\r\n]+/g, ' ').slice(0, 600); console.error(JSON.stringify({ ok: false, error: message })); console.log(`::error title=search-register::${message}`); process.exit(1); });
}
