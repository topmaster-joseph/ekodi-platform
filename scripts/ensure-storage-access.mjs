const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const targetDomain = 'drive.ekodi.kr';
const callbackDomain = 'drive.ekodi.kr/api/control/storage/google/callback';
const appName = 'EKODI Storage';
const callbackAppName = 'EKODI Storage OAuth Callback';
const policyName = 'EKODI Cloudflare account members';
const callbackPolicyName = 'EKODI Storage OAuth callback bypass';

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

function normalizedTarget(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function appTargetsExact(app, target) {
  const expected = normalizedTarget(target);
  if (normalizedTarget(app?.domain) === expected) return true;
  if (Array.isArray(app?.self_hosted_domains) && app.self_hosted_domains.some(domain => normalizedTarget(domain) === expected)) return true;
  if (Array.isArray(app?.destinations)) {
    return app.destinations.some(destination => destination?.type === 'public' && normalizedTarget(destination?.uri) === expected);
  }
  return false;
}

function isAccountMemberRule(rule) {
  return rule?.cloudflare_account_member?.account_id === accountId;
}

function isEveryoneRule(rule) {
  return Boolean(rule && typeof rule === 'object' && rule.everyone && typeof rule.everyone === 'object');
}

async function listApps() {
  const result = await api(`/accounts/${accountId}/access/apps?per_page=100`);
  return Array.isArray(result) ? result : [];
}

async function ensureExactApp(target, name) {
  const exact = (await listApps()).find(item => appTargetsExact(item, target));
  if (exact?.id) {
    console.log(`Verified exact Access target: ${exact.name || exact.id} protects ${target}`);
    return exact;
  }
  const created = await api(`/accounts/${accountId}/access/apps`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      type: 'self_hosted',
      session_duration: '24h',
      app_launcher_visible: false,
      destinations: [{ type: 'public', uri: target }],
    }),
  });
  if (!created?.id || !appTargetsExact(created, target)) {
    throw new Error(`Cloudflare did not create the exact Access application for ${target}.`);
  }
  console.log(`Created dedicated Access app: ${created.name || created.id} (${target})`);
  return created;
}

async function appPolicies(app) {
  const result = await api(`/accounts/${accountId}/access/apps/${app.id}/policies?per_page=100`);
  return Array.isArray(result) ? result : [];
}

function precedenceBeforeFirstDeny(policies) {
  const used = new Set(policies.map(policy => Number(policy.precedence)).filter(Number.isFinite));
  const firstDeny = policies
    .filter(policy => policy.decision === 'deny' && Number.isFinite(Number(policy.precedence)))
    .map(policy => Number(policy.precedence))
    .sort((a, b) => a - b)[0];
  if (!Number.isFinite(firstDeny) || firstDeny <= 1) return undefined;
  for (let candidate = firstDeny - 1; candidate >= 1; candidate -= 1) {
    if (!used.has(candidate)) return candidate;
  }
  return undefined;
}

async function ensureAccountMemberPolicy(app) {
  const policies = await appPolicies(app);
  const existing = policies.find(policy =>
    policy.decision === 'allow'
    && Array.isArray(policy.include)
    && policy.include.some(isAccountMemberRule)
  );
  if (existing) {
    console.log(`Access policy already permits Cloudflare account members: ${existing.name || existing.id}`);
    return existing;
  }
  const body = {
    name: policyName,
    decision: 'allow',
    include: [{ cloudflare_account_member: { account_id: accountId } }],
    exclude: [],
    require: [],
  };
  const precedence = precedenceBeforeFirstDeny(policies);
  if (precedence !== undefined) body.precedence = precedence;
  const created = await api(`/accounts/${accountId}/access/apps/${app.id}/policies`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  console.log(`Created allow policy: ${created?.name || policyName}`);
  return created;
}

async function ensureCallbackBypass(app) {
  const policies = await appPolicies(app);
  const existing = policies.find(policy =>
    policy.decision === 'bypass'
    && Array.isArray(policy.include)
    && policy.include.some(isEveryoneRule)
  );
  if (existing) {
    console.log(`OAuth callback bypass already exists: ${existing.name || existing.id}`);
    return existing;
  }
  const created = await api(`/accounts/${accountId}/access/apps/${app.id}/policies`, {
    method: 'POST',
    body: JSON.stringify({
      name: callbackPolicyName,
      decision: 'bypass',
      include: [{ everyone: {} }],
      exclude: [],
      require: [],
    }),
  });
  console.log(`Created OAuth callback bypass: ${created?.name || callbackPolicyName}`);
  return created;
}

const storageApp = await ensureExactApp(targetDomain, appName);
if (!appTargetsExact(storageApp, targetDomain)) {
  throw new Error(`Access application must protect exactly ${targetDomain}; broad or wildcard fallback is forbidden.`);
}
await ensureAccountMemberPolicy(storageApp);

const callbackApp = await ensureExactApp(callbackDomain, callbackAppName);
if (!appTargetsExact(callbackApp, callbackDomain)) {
  throw new Error(`OAuth callback Access application must protect exactly ${callbackDomain}.`);
}
await ensureCallbackBypass(callbackApp);

console.log(`Storage Access boundary ready: ${targetDomain} is protected; only ${callbackDomain} is narrowly bypassed for signed OAuth callbacks.`);
