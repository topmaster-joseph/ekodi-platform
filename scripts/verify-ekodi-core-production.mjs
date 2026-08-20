import { mkdir, writeFile } from 'node:fs/promises';

const apiBase = 'https://api.ekodi.kr';
const majorHosts = [
  ['root', 'https://ekodi.kr/'],
  ['admin', 'https://admin.ekodi.kr/'],
  ['auth', 'https://auth.ekodi.kr/'],
  ['biz', 'https://biz.ekodi.kr/'],
  ['marketing', 'https://marketing.ekodi.kr/'],
  ['church', 'https://church.ekodi.kr/'],
  ['lab', 'https://lab.ekodi.kr/'],
];

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await fetch(url, {
        redirect: options.redirect || 'follow',
        headers: { 'user-agent': 'EKODI-Core-Completion-Verifier/1.0', ...(options.headers || {}) },
        signal: AbortSignal.timeout(12000),
        ...options,
      });
    } catch (error) {
      lastError = error;
      if (index + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}

async function jsonGet(path) {
  const response = await fetchWithRetry(`${apiBase}${path}`);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${path} did not return JSON: ${text.slice(0, 160)}`); }
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  return { response, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const report = {
  generatedAt: new Date().toISOString(),
  core: {},
  protectedRoutes: {},
  hosts: {},
  securityHeaders: {},
};

const health = await jsonGet('/health');
assert(health.data?.ok === true, 'Control API health is not ok');
report.core.health = true;

const status = await jsonGet('/api/core/v1/status');
assert(status.data?.ok === true, 'Core status is not ok');
assert(status.data?.service === 'ekodi-core', 'Core service identity mismatch');
assert(status.data?.architecture === 'hybrid-cloud', 'Core architecture is not hybrid-cloud');
for (const principle of ['tenant-isolation', 'provider-independence', 'ai-optional', 'data-portability', 'graceful-degradation', 'observable-operations']) {
  assert(status.data?.principles?.includes(principle), `Core status missing principle: ${principle}`);
}
assert(status.data?.ai?.providerIndependent === true, 'Core status does not report provider-independent AI');
assert(status.data?.ai?.aiOptional === true, 'Core status does not report AI as optional');
report.core.status = status.data;

const roles = await jsonGet('/api/core/v1/roles');
const roleKeys = new Set((roles.data?.roles || []).map(item => item.role));
for (const role of ['owner', 'admin', 'manager', 'marketer', 'accountant', 'staff', 'member', 'viewer']) {
  assert(roleKeys.has(role), `Core role catalog missing ${role}`);
}
report.core.roles = [...roleKeys];

const ai = await jsonGet('/api/core/v1/ai/status');
assert(ai.data?.providerIndependent === true, 'AI gateway is not provider-independent');
assert(ai.data?.aiOptional === true, 'AI gateway is not optional');
report.core.ai = ai.data;

for (const path of ['/api/core/v1/me', '/api/core/v1/organizations', '/api/core/v1/recovery/status']) {
  const response = await fetchWithRetry(`${apiBase}${path}`);
  assert(response.status === 401, `${path} must fail closed with HTTP 401 without authentication, got ${response.status}`);
  report.protectedRoutes[path] = response.status;
}

for (const [label, url] of majorHosts) {
  const response = await fetchWithRetry(url);
  assert(response.status >= 200 && response.status < 400, `${label} production host returned HTTP ${response.status}`);
  report.hosts[label] = { url, status: response.status, finalUrl: response.url };
}

const headerProbe = await fetchWithRetry(`${apiBase}/health`);
const hsts = headerProbe.headers.get('strict-transport-security') || '';
const nosniff = headerProbe.headers.get('x-content-type-options') || '';
assert(hsts.length > 0, 'Production API is missing strict-transport-security');
assert(nosniff.toLowerCase() === 'nosniff', 'Production API is missing x-content-type-options: nosniff');
report.securityHeaders = { strictTransportSecurity: hsts, xContentTypeOptions: nosniff };

await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/ekodi-core-production-verification.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`✅ EKODI Core production verification passed: ${Object.keys(report.hosts).length}/7 hosts live, Core API contracts live, protected routes fail closed.`);
