import { createHash, randomBytes } from 'node:crypto';

const CF_API = 'https://api.cloudflare.com/client/v4';
const gatewayOrigin = String(process.env.AI_GATEWAY_ORIGIN || 'https://ai.ekodi.kr').replace(/\/$/, '');
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required for authenticated production verification.`);
  return value;
}

requireValue(accountId, 'CLOUDFLARE_ACCOUNT_ID');
requireValue(apiToken, 'CLOUDFLARE_API_TOKEN');

async function cloudflare(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${apiToken}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${CF_API}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const codes = Array.isArray(payload?.errors) ? payload.errors.map(item => item?.code).filter(Boolean).join(',') : '';
    throw new Error(`Cloudflare API request failed (${response.status}${codes ? ` codes=${codes}` : ''}).`);
  }
  return payload;
}
async function queryDatabase(databaseId, sql) {
  return cloudflare(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql }),
  });
}

function rows(payload) {
  return (payload?.result || []).flatMap(item => Array.isArray(item?.results) ? item.results : []);
}

async function locateAuthDatabase() {
  const databases = await cloudflare(`/accounts/${accountId}/d1/database?per_page=100`);
  for (const database of databases.result || []) {
    const databaseId = String(database?.uuid || database?.id || '').trim();
    if (!databaseId) continue;
    const schema = await queryDatabase(databaseId, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('admins','sessions')").catch(() => null);
    if (!schema) continue;
    const names = new Set(rows(schema).map(row => String(row?.name || '')));
    if (!names.has('admins') || !names.has('sessions')) continue;
    const admin = await queryDatabase(databaseId, "SELECT id FROM admins WHERE role='super_admin' ORDER BY id LIMIT 1").catch(() => null);
    const adminId = Number(rows(admin)[0]?.id);
    if (Number.isSafeInteger(adminId) && adminId > 0) return { databaseId, adminId };
  }
  throw new Error('Could not locate EKODI auth D1 with an authorized super_admin account.');
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
async function gatewayJson(path, init = {}) {
  const response = await fetch(`${gatewayOrigin}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = String(payload?.code || payload?.error || 'UNKNOWN').slice(0, 120);
    throw new Error(`AI Gateway request ${path} failed (${response.status}, ${code}).`);
  }
  return payload;
}

const { databaseId, adminId } = await locateAuthDatabase();
const token = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
const createdAt = new Date();
const expiresAt = new Date(createdAt.getTime() + 12 * 60 * 1000);
let inserted = false;

const insertSql = `INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (${sqlText(tokenHash)}, ${adminId}, ${sqlText(expiresAt.toISOString())}, ${sqlText(createdAt.toISOString())})`;
await queryDatabase(databaseId, insertSql);
inserted = true;
console.log('Issue short-lived genuine super-admin session: OK');
try {
  const authorization = `Bearer ${token}`;
  const session = await gatewayJson('/api/session', { headers: { authorization } });
  if (session?.role !== 'super_admin' || !session?.authenticated) {
    throw new Error('Short-lived verification session did not resolve as an authenticated super_admin.');
  }

  const status = await gatewayJson('/api/control/ai/provider-status', { headers: { authorization } });
  const workers = status?.workersAi || (status?.providers || []).find(item => item?.id === 'cloudflare-workers-ai');
  if (!status?.ok || !workers?.configured || !workers?.available || workers?.credentialMode !== 'workers-ai-binding') {
    throw new Error('Cloudflare Workers AI binding is not available in the production Control API.');
  }
  if (status?.gateway?.adaptiveParallelism !== true || status?.gateway?.orchestrationMode !== 'adaptive') {
    throw new Error('Adaptive parallel orchestration is not active in the production Control API.');
  }
  const availableWorkers = (status?.providers || []).filter(item => item?.available && String(item?.id || '').startsWith('cloudflare-workers-ai'));
  if (availableWorkers.length < 3) {
    throw new Error(`Production Control API exposes only ${availableWorkers.length} Workers AI reviewers; expected 3.`);
  }

  const assist = await gatewayJson('/api/control/ai/assist', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'AI 연결 상태 확인입니다. 짧게 확인이라고 답하세요.',
      context: { section: 'health-check', title: 'AI connection check', pathname: '/' },
      history: [],
    }),
  });

  if (!assist?.ok || assist?.degraded || assist?.provider !== 'cloudflare-workers-ai') {
    throw new Error(`Production assist did not execute on Cloudflare Workers AI (provider=${assist?.provider || 'none'}, degraded=${Boolean(assist?.degraded)}).`);
  }
  if (typeof assist?.model !== 'string' || !assist.model.trim()) {
    throw new Error('Production assist returned no model identity.');
  }
  if (typeof assist?.reply !== 'string' || !assist.reply.trim()) {
    throw new Error('Production assist returned an empty model response.');
  }
  if (assist.reply.includes('외부 AI 연결이 준비되지 않았거나')) {
    throw new Error('Production assist returned the fallback response instead of a live model response.');
  }

  if (assist?.orchestration?.strategy !== 'single' || assist?.orchestration?.fanout !== 1) {
    throw new Error('Routine production request did not remain on single-provider routing.');
  }
  console.log(`Verify routine Workers AI request: OK provider=${assist.provider} model=${assist.model}`);

  const parallelAssist = await gatewayJson('/api/control/ai/assist', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: '운영 배포 전 구조와 위험을 교차검증해 주세요. 실제 변경은 하지 말고 검토 결과만 짧게 답하세요.',
      context: { section: 'release-verification', title: 'Adaptive parallel verification', pathname: '/' },
      history: [],
    }),
  });
  const orchestration = parallelAssist?.orchestration || {};
  if (!parallelAssist?.ok || parallelAssist?.degraded || parallelAssist?.provider !== 'ekodi-orchestrator') {
    throw new Error(`Adaptive production request was not synthesized by EKODI Orchestrator (provider=${parallelAssist?.provider || 'none'}, degraded=${Boolean(parallelAssist?.degraded)}).`);
  }
  if (orchestration.strategy !== 'parallel' || orchestration.quorumMet !== true || orchestration.synthesized !== true) {
    throw new Error('Adaptive production request did not complete parallel quorum and synthesis.');
  }
  if (!Array.isArray(orchestration.successfulProviders) || orchestration.successfulProviders.length < 2) {
    throw new Error('Adaptive production request did not obtain at least two independent AI reviews.');
  }
  if (typeof parallelAssist.reply !== 'string' || !parallelAssist.reply.trim()) {
    throw new Error('Adaptive parallel production assist returned an empty synthesis.');
  }
  console.log(`Verify adaptive parallel AI production request: OK reviewers=${orchestration.successfulProviders.join(',')} synthesis=${orchestration.synthesisProvider || 'unknown'}`);
} finally {
  if (inserted) {
    const cleanupSql = `DELETE FROM sessions WHERE token_hash = ${sqlText(tokenHash)}`;
    await queryDatabase(databaseId, cleanupSql);
    console.log('Revoke short-lived AI Gateway verification session: OK');
  }
}
