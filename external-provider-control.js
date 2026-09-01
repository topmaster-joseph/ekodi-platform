import { handleAdminSessionFastPath } from './admin-session-fastpath.js';

const BASE_PATH = '/api/control/providers';
const PROVIDER_IDS = ['cloudflare', 'github', 'supabase', 'google_drive'];

function splitList(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function adminEmails(env = {}) {
  return new Set([
    ...splitList(env.SECRET_MANAGER_ADMIN_EMAILS),
    ...splitList(env.ADMIN_EMAIL),
    ...splitList(env.ADMIN_GOOGLE_BOOTSTRAP_EMAILS),
  ].map(email => email.toLowerCase()));
}

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  });
  for (const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-max-age','vary']) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await handleAdminSessionFastPath(new Request(url.toString(), {
    method:'GET',
    headers:request.headers,
  }), env);
  if (!response?.ok) return { response };
  const session = await response.clone().json().catch(() => ({}));
  if (!session?.authenticated) return { response };
  if (!adminEmails(env).has(String(session.email || '').toLowerCase())) {
    return { response:json({ error:'최고관리자 권한이 필요합니다.', code:'PROVIDER_CONTROL_FORBIDDEN' }, 403, response.headers) };
  }
  return { response, session };
}

function environmentName(env = {}) {
  return String(env.EKODI_ENVIRONMENT || env.ENVIRONMENT || 'unknown').trim().toLowerCase() || 'unknown';
}

function policyFor(env = {}) {
  const environment = environmentName(env);
  const production = environment === 'production';
  const requestedWriteMode = String(env.EKODI_PROVIDER_WRITE_MODE || 'observe').toLowerCase();
  return {
    environment,
    mode: production ? 'observe' : (requestedWriteMode === 'execute' ? 'execute' : 'observe'),
    production,
    highImpactRequiresHuman:true,
    destructiveProductionActions:false,
    credentialValuesReturned:false,
    crossProviderCredentialReuse:false,
  };
}

function capabilitySet(supported = [], connected = false, policy = {}) {
  const enabled = [];
  if (connected) {
    for (const capability of supported) {
      if (['status','read','search'].includes(capability)) enabled.push(capability);
    }
  }
  return {
    supported,
    enabled,
    writeGate: policy.production ? 'human_approval_required' : 'not_exposed_by_status_endpoint',
  };
}

function baseProvider(id, label, authType, supported, configured, policy) {
  return {
    id,
    label,
    environment:policy.environment,
    authType,
    configured:Boolean(configured),
    status:configured ? 'checking' : 'unconfigured',
    connected:false,
    capabilities:capabilitySet(supported, false, policy),
    lastVerifiedAt:null,
    error:null,
  };
}

async function fetchWithTimeout(fetchImpl, url, init = {}, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal:controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkCloudflare(env, policy, fetchImpl) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_SECRET_MANAGER_TOKEN || env.CLOUDFLARE_API_TOKEN || '').trim();
  const provider = baseProvider(
    'cloudflare',
    'Cloudflare',
    'least_privilege_api_token',
    ['status','read','search','deploy','manage_secrets'],
    Boolean(accountId && token),
    policy,
  );
  provider.account = { label:String(env.CLOUDFLARE_ACCOUNT_LABEL || 'EKODI Cloudflare') };
  if (!provider.configured) return provider;
  try {
    const response = await fetchWithTimeout(fetchImpl,
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`,
      { method:'GET', headers:{ authorization:`Bearer ${token}`, accept:'application/json' } },
    );
    if (!response.ok) throw new Error(`cloudflare_http_${response.status}`);
    provider.status = 'connected';
    provider.connected = true;
    provider.capabilities = capabilitySet(provider.capabilities.supported, true, policy);
  } catch (error) {
    provider.status = 'degraded';
    provider.error = String(error?.message || 'cloudflare_unavailable').slice(0, 120);
  }
  provider.lastVerifiedAt = new Date().toISOString();
  return provider;
}

async function checkGitHub(env, policy, fetchImpl) {
  const token = String(env.GITHUB_CONTROL_TOKEN || '').trim();
  const owner = String(env.GITHUB_CONTROL_OWNER || 'topmaster-joseph').trim();
  const provider = baseProvider(
    'github',
    'GitHub',
    'fine_grained_token_or_github_app',
    ['status','read','search','edit','deploy'],
    Boolean(token),
    policy,
  );
  provider.account = { owner };
  provider.allowedRepositories = splitList(env.GITHUB_CONTROL_ALLOWED_REPOS);
  if (!provider.configured) return provider;
  try {
    const response = await fetchWithTimeout(fetchImpl, 'https://api.github.com/user', {
      method:'GET',
      headers:{
        authorization:`Bearer ${token}`,
        accept:'application/vnd.github+json',
        'user-agent':'EKODI-Admin-Access-Broker',
        'x-github-api-version':'2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`github_http_${response.status}`);
    provider.status = 'connected';
    provider.connected = true;
    provider.capabilities = capabilitySet(provider.capabilities.supported, true, policy);
  } catch (error) {
    provider.status = 'degraded';
    provider.error = String(error?.message || 'github_unavailable').slice(0, 120);
  }
  provider.lastVerifiedAt = new Date().toISOString();
  return provider;
}

async function checkSupabase(env, policy, fetchImpl) {
  const url = String(env.SUPABASE_CONTROL_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_CONTROL_KEY || '').trim();
  const provider = baseProvider(
    'supabase',
    'Supabase',
    'dedicated_project_api_key',
    ['status','read','search','edit'],
    Boolean(url && key),
    policy,
  );
  if (!provider.configured) {
    provider.connectionHint = 'SUPABASE_CONTROL_URL + SUPABASE_CONTROL_KEY';
    return provider;
  }
  try {
    const response = await fetchWithTimeout(fetchImpl, `${url}/rest/v1/`, {
      method:'GET',
      headers:{ apikey:key, authorization:`Bearer ${key}`, accept:'application/json' },
    });
    if (!response.ok) throw new Error(`supabase_http_${response.status}`);
    provider.status = 'connected';
    provider.connected = true;
    provider.capabilities = capabilitySet(provider.capabilities.supported, true, policy);
  } catch (error) {
    provider.status = 'degraded';
    provider.error = String(error?.message || 'supabase_unavailable').slice(0, 120);
  }
  provider.lastVerifiedAt = new Date().toISOString();
  return provider;
}

async function checkGoogleDrive(env, policy, fetchImpl) {
  const accessToken = String(env.GOOGLE_DRIVE_CONTROL_ACCESS_TOKEN || '').trim();
  const provider = baseProvider(
    'google_drive',
    'Google Drive',
    'oauth_access_token',
    ['status','read','search','edit'],
    Boolean(accessToken),
    policy,
  );
  if (!provider.configured) {
    provider.connectionHint = 'Google OAuth Drive scope connection required';
    return provider;
  }
  try {
    const response = await fetchWithTimeout(fetchImpl,
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)&supportsAllDrives=true',
      { method:'GET', headers:{ authorization:`Bearer ${accessToken}`, accept:'application/json' } },
    );
    if (!response.ok) throw new Error(`google_drive_http_${response.status}`);
    provider.status = 'connected';
    provider.connected = true;
    provider.capabilities = capabilitySet(provider.capabilities.supported, true, policy);
  } catch (error) {
    provider.status = 'degraded';
    provider.error = String(error?.message || 'google_drive_unavailable').slice(0, 120);
  }
  provider.lastVerifiedAt = new Date().toISOString();
  return provider;
}

export async function buildProviderRegistry(env = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const policy = policyFor(env);
  const checks = [
    () => checkCloudflare(env, policy, fetchImpl),
    () => checkGitHub(env, policy, fetchImpl),
    () => checkSupabase(env, policy, fetchImpl),
    () => checkGoogleDrive(env, policy, fetchImpl),
  ];
  const settled = await Promise.allSettled(checks.map(check => check()));
  const providers = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const id = PROVIDER_IDS[index];
    return {
      id,
      label:id,
      environment:policy.environment,
      configured:false,
      connected:false,
      status:'error',
      capabilities:{ supported:[], enabled:[], writeGate:'unavailable' },
      lastVerifiedAt:new Date().toISOString(),
      error:'provider_check_failed',
    };
  });
  const summary = providers.reduce((acc, provider) => {
    acc.total += 1;
    acc[provider.status] = (acc[provider.status] || 0) + 1;
    return acc;
  }, { total:0, connected:0, unconfigured:0, degraded:0, error:0 });
  return {
    schemaVersion:1,
    controlPlane:'EKODI Admin Access Broker',
    policy,
    providers,
    summary,
    generatedAt:new Date().toISOString(),
  };
}

export async function handleAdminAccessBroker(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== BASE_PATH && !url.pathname.startsWith(`${BASE_PATH}/`)) return null;
  if (request.method !== 'GET') {
    return json({ error:'Provider 상태 API는 읽기 전용입니다.', code:'PROVIDER_METHOD_NOT_ALLOWED' }, 405);
  }

  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;

  const registry = await buildProviderRegistry(env);
  if (url.pathname === BASE_PATH) return json(registry, 200, auth.response.headers);

  const id = decodeURIComponent(url.pathname.slice(`${BASE_PATH}/`.length));
  const provider = registry.providers.find(item => item.id === id);
  if (!provider) return json({ error:'지원하지 않는 Provider입니다.', code:'PROVIDER_NOT_FOUND' }, 404, auth.response.headers);
  return json({
    schemaVersion:registry.schemaVersion,
    controlPlane:registry.controlPlane,
    policy:registry.policy,
    provider,
    generatedAt:registry.generatedAt,
  }, 200, auth.response.headers);
}
