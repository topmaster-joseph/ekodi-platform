const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const targetHost = 'drive.ekodi.kr';
const appName = 'EKODI Storage';
const policyName = 'EKODI Cloudflare account members';

if (!accountId || !token) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
}

const apiBase = 'https://api.cloudflare.com/client/v4';

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const errors = Array.isArray(payload.errors)
      ? payload.errors.map(error => `${error.code || 'unknown'}:${error.message || 'Cloudflare API error'}`).join(', ')
      : `HTTP ${response.status}`;
    throw new Error(`Cloudflare API request failed: ${errors}`);
  }
  return payload.result;
}

function domainHost(domain) {
  return String(domain || '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .replace(/:\d+$/, '')
    .toLowerCase();
}

function coversHost(domain, host) {
  const candidate = domainHost(domain);
  if (candidate === host) return true;
  if (candidate.startsWith('*.')) return host.endsWith(candidate.slice(1));
  return false;
}

function appCoversHost(app, host) {
  if (coversHost(app?.domain, host)) return true;
  if (Array.isArray(app?.self_hosted_domains) && app.self_hosted_domains.some(domain => coversHost(domain, host))) return true;
  if (Array.isArray(app?.destinations)) {
    return app.destinations.some(destination => destination?.type === 'public' && coversHost(destination?.uri, host));
  }
  return false;
}

function isAccountMemberRule(rule) {
  return rule?.cloudflare_account_member?.account_id === accountId;
}

const apps = await api(`/accounts/${accountId}/access/apps?per_page=100`);
const candidates = Array.isArray(apps) ? apps : [];
let app = candidates.find(item => appCoversHost(item, targetHost));

if (!app?.id) {
  app = await api(`/accounts/${accountId}/access/apps`, {
    method: 'POST',
    body: JSON.stringify({
      name: appName,
      type: 'self_hosted',
      session_duration: '24h',
      app_launcher_visible: false,
      destinations: [{ type: 'public', uri: targetHost }],
    }),
  });
  if (!app?.id || !appCoversHost(app, targetHost)) {
    throw new Error(`Cloudflare Access application was created without a verified ${targetHost} destination.`);
  }
  console.log(`Created dedicated Access app: ${app.name || app.id} (${targetHost})`);
} else {
  console.log(`Verified Access target: ${app.name || app.id} protects ${targetHost}`);
}

const policiesResult = await api(`/accounts/${accountId}/access/apps/${app.id}/policies?per_page=100`);
const policies = Array.isArray(policiesResult) ? policiesResult : [];
const existing = policies.find(policy =>
  policy.decision === 'allow'
  && Array.isArray(policy.include)
  && policy.include.some(isAccountMemberRule)
);

if (existing) {
  console.log(`Access policy already permits Cloudflare account members: ${existing.name || existing.id}`);
  process.exit(0);
}

const usedPrecedence = new Set(
  policies.map(policy => Number(policy.precedence)).filter(Number.isFinite),
);
const firstDeny = policies
  .filter(policy => policy.decision === 'deny' && Number.isFinite(Number(policy.precedence)))
  .map(policy => Number(policy.precedence))
  .sort((a, b) => a - b)[0];
let precedence;
if (Number.isFinite(firstDeny) && firstDeny > 1) {
  for (let candidate = firstDeny - 1; candidate >= 1; candidate -= 1) {
    if (!usedPrecedence.has(candidate)) {
      precedence = candidate;
      break;
    }
  }
}

const body = {
  name: policyName,
  decision: 'allow',
  include: [{ cloudflare_account_member: { account_id: accountId } }],
  exclude: [],
  require: [],
};
if (precedence !== undefined) body.precedence = precedence;

const created = await api(`/accounts/${accountId}/access/apps/${app.id}/policies`, {
  method: 'POST',
  body: JSON.stringify(body),
});

console.log(`Access app: ${app.name || app.id} (${targetHost})`);
console.log(`Created allow policy: ${created?.name || policyName}`);
console.log('Only members of this Cloudflare account are included; public Everyone access was not enabled.');
