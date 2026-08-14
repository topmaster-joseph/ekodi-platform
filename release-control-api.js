import authWorker from './auth-worker.js';

const REPOSITORY = 'topmaster-joseph/ekodi-platform';
const GITHUB_RUNS_URL = `https://api.github.com/repos/${REPOSITORY}/actions/runs?per_page=80`;
const CACHE_TTL_SECONDS = 45;

const RELEASE_UNITS = [
  { id:'shared-site', name:'Shared Site · Admin/Auth', workflow:'deploy-admin-site.yml', model:'Candidate 0% → verify → 100%', risk:'high', domains:['ekodi.kr','admin.ekodi.kr','auth.ekodi.kr'] },
  { id:'control-api', name:'Control API', workflow:'deploy-control-api.yml', model:'Staging D1 → recovery bookmark → Candidate 0%', risk:'critical', domains:['api.ekodi.kr'] },
  { id:'finance-api', name:'Finance API', workflow:'deploy-finance.yml', model:'Staging D1 → recovery bookmark → secret-safe Candidate 0%', risk:'critical', domains:['finance-api.ekodi.kr'] },
  { id:'marketing-ai', name:'Marketing AI', workflow:'sync-marketing-ai.yml', alternateWorkflows:['deploy-jadam-marketing-ai.yml'], model:'Pages preview → verify all → production', risk:'high', domains:['marketing.ekodi.kr','jadam.ekodi.kr','pizzamaru.ekodi.kr','yogurt.ekodi.kr'] },
  { id:'community', name:'Community', workflow:'deploy-community.yml', model:'Candidate 0% → verify → 100%', risk:'medium', domains:['community.ekodi.kr'] },
  { id:'books', name:'Books', workflow:'deploy-books.yml', model:'Candidate 0% → verify → 100%', risk:'medium', domains:['books.ekodi.kr'] },
  { id:'social', name:'Social', workflow:'deploy-social.yml', model:'Candidate 0% → verify → 100%', risk:'medium', domains:['social.ekodi.kr'] },
];

const TOPOLOGY_WORKFLOWS = [
  'deploy-service-proxy.yml',
  'deploy-biz-legacy.yml',
  'deploy-legacy-redirects.yml',
];

function corsHeaders(request, env) {
  const headers = new Headers();
  const origin = request.headers.get('origin') || '';
  const allowed = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean));
  if (origin && allowed.has(origin)) headers.set('access-control-allow-origin', origin);
  if (origin) headers.set('vary', 'Origin');
  headers.set('access-control-allow-headers', 'authorization, content-type');
  headers.set('access-control-allow-methods', 'GET, OPTIONS');
  headers.set('x-content-type-options', 'nosniff');
  return headers;
}

function json(data, status, request, env) {
  const headers = corsHeaders(request, env);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

function workflowName(pathname = '') {
  return String(pathname).split('/').pop() || '';
}

function unitForWorkflow(name) {
  return RELEASE_UNITS.find(unit => unit.workflow === name || unit.alternateWorkflows?.includes(name)) || null;
}

function normalizedRun(run) {
  const workflow = workflowName(run.path);
  const unit = unitForWorkflow(workflow);
  if (!unit) return null;
  return {
    id: run.id,
    unitId: unit.id,
    unitName: unit.name,
    workflow,
    runNumber: run.run_number,
    event: run.event,
    branch: run.head_branch,
    sha: String(run.head_sha || '').slice(0, 12),
    title: run.display_title || run.name || unit.name,
    status: run.status || 'unknown',
    conclusion: run.conclusion || null,
    createdAt: run.created_at || null,
    updatedAt: run.updated_at || null,
    url: run.html_url || null,
    risk: unit.risk,
    model: unit.model,
  };
}

async function githubRuns(env) {
  const request = new Request(GITHUB_RUNS_URL, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'EKODI-Release-Control/1.0',
      'x-github-api-version': '2022-11-28',
      ...(String(env.GITHUB_RELEASE_READ_TOKEN || '').trim() ? { authorization: `Bearer ${String(env.GITHUB_RELEASE_READ_TOKEN).trim()}` } : {}),
    },
  });
  const cache = caches.default;
  const cacheKey = new Request(`${GITHUB_RUNS_URL}&ekodi_release_cache=v1`);
  let response = await cache.match(cacheKey);
  if (!response) {
    response = await fetch(request);
    if (!response.ok) throw new Error(`GitHub Actions metadata unavailable (${response.status})`);
    const cached = new Response(response.clone().body, response);
    cached.headers.set('cache-control', `public, max-age=${CACHE_TTL_SECONDS}`);
    await cache.put(cacheKey, cached);
  }
  const data = await response.json();
  return Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
}

function summarizeUnits(runs) {
  return RELEASE_UNITS.map(unit => {
    const latest = runs.find(run => run.unitId === unit.id) || null;
    return {
      id: unit.id,
      name: unit.name,
      workflow: unit.workflow,
      model: unit.model,
      risk: unit.risk,
      domains: unit.domains,
      latest,
    };
  });
}

export async function handleReleaseControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/control/releases')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:corsHeaders(request, env) });
  if (request.method !== 'GET') return json({ error:'Method not allowed.' }, 405, request, env);

  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;

  try {
    const runs = (await githubRuns(env)).map(normalizedRun).filter(Boolean).slice(0, 40);
    return json({
      repository: REPOSITORY,
      generatedAt: new Date().toISOString(),
      policy: {
        sourceOfTruth: 'GitHub Actions + guarded release manifests',
        automaticProductionBypass: false,
        topologyMutation: 'manual-only',
        topologyWorkflows: TOPOLOGY_WORKFLOWS,
        cloudflareCredentialIsolation: 'prepared-for-split-token',
        note: 'Cloudflare token scope separation is enforced operationally after dedicated deploy/topology tokens are provisioned.',
      },
      units: summarizeUnits(runs),
      recentRuns: runs,
    }, 200, request, env);
  } catch (error) {
    console.error('Release Control API error', error);
    return json({ error:'배포 이력을 불러오지 못했습니다.', code:'RELEASE_CONTROL_UPSTREAM_ERROR' }, 503, request, env);
  }
}
