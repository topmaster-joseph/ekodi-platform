import { handleAdminSessionFastPath } from './admin-session-fastpath.js';

const BASE_PATH = '/api/control/secrets';
const DEFAULT_BYTES = 48;
const ALLOWED_BYTES = new Set([32, 48, 64]);
const BINDING_NAME = /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/;
const RESERVED_NAMES = new Set([
  'CLOUDFLARE_SECRET_MANAGER_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
]);

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

function splitList(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function managerAdmins(env) {
  return new Set([
    ...splitList(env.SECRET_MANAGER_ADMIN_EMAILS),
    ...splitList(env.ADMIN_EMAIL),
    ...splitList(env.ADMIN_GOOGLE_BOOTSTRAP_EMAILS),
  ].map(email => email.toLowerCase()));
}

function allowedScripts(env) {
  const configured = splitList(env.CLOUDFLARE_SECRET_ALLOWED_SCRIPTS);
  return configured.length ? configured : ['ekodi-auth-api'];
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
  const session = await response.clone().json();
  if (!session?.authenticated) return { response };
  if (!managerAdmins(env).has(String(session.email || '').toLowerCase())) {
    return { response:json({ error:'최고관리자 권한이 필요합니다.', code:'SECRET_MANAGER_FORBIDDEN' }, 403, response.headers) };
  }
  return { response, session };
}

function randomSecret(byteLength) {
  const length = ALLOWED_BYTES.has(Number(byteLength)) ? Number(byteLength) : DEFAULT_BYTES;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function fingerprint(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].slice(0, 8).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function cloudflareReady(env) {
  return Boolean(env.CLOUDFLARE_SECRET_MANAGER_TOKEN && env.CLOUDFLARE_ACCOUNT_ID);
}

function maskId(value) {
  const text = String(value || '');
  if (text.length <= 10) return text ? '••••' : '';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function cfUrl(env, scriptName, suffix = '') {
  const account = encodeURIComponent(String(env.CLOUDFLARE_ACCOUNT_ID || ''));
  const script = encodeURIComponent(scriptName);
  return `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${script}/secrets${suffix}`;
}

async function cfRequest(env, url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${env.CLOUDFLARE_SECRET_MANAGER_TOKEN}`);
  headers.set('content-type', 'application/json');
  return fetch(url, { ...init, headers });
}

async function cfJson(env, url) {
  const response = await cfRequest(env, url, { method:'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const error = new Error(`Cloudflare inventory lookup failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function cloudflareInventory(env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '');
  const fallbackWorkers = allowedScripts(env).map(name => ({ name, allowed:true, source:'configured' }));
  const result = {
    configured:cloudflareReady(env),
    account:{ name:String(env.CLOUDFLARE_ACCOUNT_LABEL || 'EKODI Cloudflare'), idMasked:maskId(accountId) },
    zones:[],
    workers:fallbackWorkers,
    warnings:[],
  };
  if (!result.configured) return result;
  const accountUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`;
  const zonesUrl = `https://api.cloudflare.com/client/v4/zones?account.id=${encodeURIComponent(accountId)}&per_page=50`;
  const workersUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts`;
  const [account, zones, workers] = await Promise.allSettled([
    cfJson(env, accountUrl),
    cfJson(env, zonesUrl),
    cfJson(env, workersUrl),
  ]);
  if (account.status === 'fulfilled' && account.value?.result) {
    result.account.name = String(account.value.result.name || result.account.name);
  } else if (account.status === 'rejected') result.warnings.push('account_read_unavailable');
  if (zones.status === 'fulfilled') {
    result.zones = (zones.value?.result || []).map(zone => ({
      idMasked:maskId(zone.id), name:String(zone.name || ''), status:String(zone.status || 'unknown')
    })).filter(zone => zone.name);
  } else result.warnings.push('zone_read_unavailable');
  if (workers.status === 'fulfilled') {
    const allowed = new Set(allowedScripts(env));
    const rows = Array.isArray(workers.value?.result) ? workers.value.result : [];
    result.workers = rows.map(worker => {
      const name = String(worker.id || worker.name || '');
      return { name, allowed:allowed.has(name), source:'cloudflare' };
    }).filter(worker => worker.name);
    for (const name of allowed) {
      if (!result.workers.some(worker => worker.name === name)) result.workers.push({ name, allowed:true, source:'configured' });
    }
  } else result.warnings.push('worker_list_unavailable');
  return result;
}

async function githubInventory(env) {
  const owner = String(env.GITHUB_CONTROL_OWNER || 'topmaster-joseph').trim();
  const token = String(env.GITHUB_CONTROL_TOKEN || '').trim();
  const allowed = new Set(splitList(env.GITHUB_CONTROL_ALLOWED_REPOS));
  const headers = new Headers({
    accept:'application/vnd.github+json',
    'user-agent':'EKODI-Admin-Control-Plane',
    'x-github-api-version':'2022-11-28',
  });
  if (token) headers.set('authorization', `Bearer ${token}`);
  const endpoint = token
    ? 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member'
    : `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated`;
  try {
    const response = await fetch(endpoint, { headers, method:'GET' });
    if (!response.ok) return { configured:Boolean(token), owner, repositories:[], warning:`github_http_${response.status}`, mode:token ? 'authenticated' : 'public' };
    const rows = await response.json().catch(() => []);
    const repositories = (Array.isArray(rows) ? rows : []).map(repo => ({
      name:String(repo.name || ''),
      fullName:String(repo.full_name || ''),
      private:Boolean(repo.private),
      defaultBranch:String(repo.default_branch || 'main'),
      updatedAt:String(repo.updated_at || ''),
      url:String(repo.html_url || ''),
      allowed:allowed.size ? allowed.has(String(repo.full_name || '')) || allowed.has(String(repo.name || '')) : String(repo.owner?.login || '') === owner,
    })).filter(repo => repo.name);
    return { configured:Boolean(token), owner, repositories, warning:'', mode:token ? 'authenticated' : 'public' };
  } catch (error) {
    return { configured:Boolean(token), owner, repositories:[], warning:'github_inventory_unavailable', mode:token ? 'authenticated' : 'public' };
  }
}

async function providerInventory(env) {
  const [cloudflare, github] = await Promise.all([
    cloudflareInventory(env).catch(() => ({ configured:cloudflareReady(env), account:{ name:String(env.CLOUDFLARE_ACCOUNT_LABEL || 'EKODI Cloudflare'), idMasked:maskId(env.CLOUDFLARE_ACCOUNT_ID) }, zones:[], workers:allowedScripts(env).map(name => ({ name, allowed:true, source:'configured' })), warnings:['inventory_unavailable'] })),
    githubInventory(env),
  ]);
  return {
    schemaVersion:1,
    controlPlane:'EKODI Admin AI',
    primaryAgent:'chief',
    specialists:['infrastructure','development','devops','security','data','ai_gateway'],
    cloudflare,
    github,
    highImpactRequiresHuman:true,
    providerConsoles:'advanced_or_emergency_only',
    generatedAt:new Date().toISOString(),
  };
}

async function secretExists(env, scriptName, name) {
  const response = await cfRequest(env, cfUrl(env, scriptName, `/${encodeURIComponent(name)}`), { method:'GET' });
  if (response.status === 404) return false;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloudflare secret lookup failed: ${response.status} ${body.slice(0, 240)}`);
  }
  return true;
}

async function audit(env, event) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`INSERT INTO cloudflare_secret_audit
      (id, admin_email, script_name, secret_name, secret_type, action, status, fingerprint, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), event.adminEmail, event.scriptName, event.name, event.type,
        event.action, event.status, event.fingerprint || null, new Date().toISOString(),
      ).run();
  } catch (error) {
    console.warn('Cloudflare secret audit write failed', String(error?.message || error));
  }
}

export async function handleCloudflareSecretControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE_PATH)) return null;

  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;

  if (url.pathname === `${BASE_PATH}/status` && request.method === 'GET') {
    const inventory = await cloudflareInventory(env).catch(() => null);
    return json({
      schemaVersion:2,
      configured:cloudflareReady(env),
      account:inventory?.account || { name:String(env.CLOUDFLARE_ACCOUNT_LABEL || 'EKODI Cloudflare'), idMasked:maskId(env.CLOUDFLARE_ACCOUNT_ID) },
      zones:inventory?.zones || [],
      workers:inventory?.workers || allowedScripts(env).map(name => ({ name, allowed:true, source:'configured' })),
      inventoryWarnings:inventory?.warnings || ['inventory_unavailable'],
      scripts:allowedScripts(env),
      types:[{ value:'secret_text', label:'Secret' }],
      bytes:[32,48,64],
      defaultBytes:DEFAULT_BYTES,
      valueReturned:false,
      existingSecretRequiresExplicitReplace:true,
      controllerCredentialsProtected:true,
    }, 200, auth.response.headers);
  }

  if (url.pathname === `${BASE_PATH}/providers` && request.method === 'GET') {
    return json(await providerInventory(env), 200, auth.response.headers);
  }

  if (url.pathname !== `${BASE_PATH}/generate` || request.method !== 'POST') return null;
  if (!cloudflareReady(env)) {
    return json({ error:'Cloudflare Secret Manager 연결이 준비되지 않았습니다.', code:'SECRET_MANAGER_NOT_CONFIGURED' }, 503, auth.response.headers);
  }
  if (request.headers.get('x-ekodi-confirm-impact') !== 'cloudflare-secret-create') {
    return json({ error:'명시적 관리자 승인 헤더가 필요합니다.', code:'SECRET_CREATE_CONFIRMATION_REQUIRED' }, 428, auth.response.headers);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error:'요청 형식이 올바르지 않습니다.', code:'INVALID_JSON' }, 400, auth.response.headers); }

  const scriptName = String(body?.scriptName || '').trim();
  const name = String(body?.name || '').trim();
  const type = String(body?.type || 'secret_text').trim();
  const bytes = ALLOWED_BYTES.has(Number(body?.bytes)) ? Number(body.bytes) : DEFAULT_BYTES;
  const replace = body?.replace === true;

  if (!allowedScripts(env).includes(scriptName)) {
    return json({ error:'허용되지 않은 Worker 대상입니다.', code:'SECRET_TARGET_FORBIDDEN' }, 403, auth.response.headers);
  }
  if (!BINDING_NAME.test(name)) {
    return json({ error:'Variable name 형식이 올바르지 않습니다.', code:'INVALID_SECRET_NAME' }, 400, auth.response.headers);
  }
  if (RESERVED_NAMES.has(name)) {
    return json({ error:'Secret Manager 자체 제어 자격증명은 이 화면에서 생성·교체할 수 없습니다.', code:'SECRET_NAME_RESERVED' }, 403, auth.response.headers);
  }
  if (type !== 'secret_text') {
    return json({ error:'현재 자동 생성은 Cloudflare Secret 타입만 지원합니다.', code:'UNSUPPORTED_SECRET_TYPE' }, 400, auth.response.headers);
  }

  try {
    const exists = await secretExists(env, scriptName, name);
    if (exists && !replace) {
      await audit(env, { adminEmail:auth.session.email, scriptName, name, type, action:'create', status:'blocked_existing' });
      return json({
        error:'같은 이름의 Secret이 이미 있습니다. 교체는 별도 승인 버튼으로 다시 실행해야 합니다.',
        code:'SECRET_ALREADY_EXISTS',
        existing:true,
      }, 409, auth.response.headers);
    }

    const secret = randomSecret(bytes);
    const secretFingerprint = await fingerprint(secret);
    const response = await cfRequest(env, cfUrl(env, scriptName), {
      method:'PUT',
      body:JSON.stringify({ name, text:secret, type:'secret_text' }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      await audit(env, { adminEmail:auth.session.email, scriptName, name, type, action:exists ? 'replace' : 'create', status:'failed', fingerprint:secretFingerprint });
      return json({
        error:'Cloudflare Secret 등록에 실패했습니다.',
        code:'CLOUDFLARE_SECRET_CREATE_FAILED',
        cloudflareStatus:response.status,
      }, 502, auth.response.headers);
    }

    await audit(env, { adminEmail:auth.session.email, scriptName, name, type, action:exists ? 'replace' : 'create', status:'success', fingerprint:secretFingerprint });
    return json({
      ok:true,
      scriptName,
      name,
      type:'secret_text',
      bytes,
      replaced:exists,
      fingerprint:secretFingerprint,
      valueReturned:false,
      createdAt:new Date().toISOString(),
    }, 200, auth.response.headers);
  } catch (error) {
    console.error('Cloudflare secret control error', String(error?.message || error));
    await audit(env, { adminEmail:auth.session.email, scriptName, name, type, action:replace ? 'replace' : 'create', status:'error' });
    return json({ error:'Cloudflare Secret 처리 중 오류가 발생했습니다.', code:'CLOUDFLARE_SECRET_CONTROL_ERROR' }, 502, auth.response.headers);
  }
}
