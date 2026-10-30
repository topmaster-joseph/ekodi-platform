// EKODI GitHub API admission control.
// Per-process guard only: the durable, cross-run EKODI queue is a separate protected release.
export class GitHubRateDeferredError extends Error {
  constructor(retryAt, status, reason = 'rate_limited') {
    super('EKODI GitHub API deferred (' + reason + ', HTTP ' + status +
      '); retry after ' + new Date(retryAt).toISOString());
    this.name = 'GitHubRateDeferredError';
    this.code = 'EKODI_GITHUB_RATE_DEFERRED';
    this.retryAt = retryAt;
    this.status = status;
  }
}

function value(headers, key) {
  if (typeof headers?.get === 'function') return headers.get(key);
  const obj = Object.entries(headers || {}).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return obj?.[1] ?? null;
}

export function parseRetryAfter(raw, nowMs = Date.now()) {
  if (raw == null || !String(raw).trim()) return null;
  const text = String(raw).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return nowMs + Math.ceil(Number(text) * 1000);
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(nowMs, at) : null;
}

export function inspectGitHubBudget({ status, headers, body, nowMs = Date.now(), reserve = 5 }) {
  const rawRemaining = value(headers, 'x-ratelimit-remaining');
  const rawLimit = value(headers, 'x-ratelimit-limit');
  const rawReset = value(headers, 'x-ratelimit-reset');
  const number = v => v != null && String(v).trim() !== '' && /^\d+$/.test(String(v))
    ? Number(v) : null;
  const remaining = number(rawRemaining);
  const limit = number(rawLimit);
  const resetSeconds = number(rawReset);
  const resetAt = resetSeconds == null ? null : resetSeconds * 1000;
  const retryAfter = parseRetryAfter(value(headers, 'retry-after'), nowMs);
  const reason = String(body?.message || '').toLowerCase();
  // Ordinary 403 permission errors are NOT quota errors.
  const limited = status === 429 ||
    (status === 403 && (remaining === 0 ||
      /rate limit|abuse detection|secondary limit/.test(reason)));
  const until = limited
    ? Math.max(nowMs + 60000, retryAfter || 0, remaining === 0 ? (resetAt || 0) : 0)
    : (remaining != null && remaining <= reserve && resetAt != null && resetAt > nowMs
      ? resetAt : 0);
  return { limited, remaining, limit, resetAt, retryAfter, until,
    reason: limited ? (remaining === 0 ? 'primary_rate_limit' : 'secondary_rate_limit') :
      (until ? 'reserve_protection' : 'normal') };
}

export function createGitHubBudgetClient({
  repo, token, fetchImpl = fetch, now = Date.now, reserve = 5,
  cacheMs = 0, onMetric = () => {}
}) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) || !token)
    throw new Error('GitHub canonical repository and token required');
  const state = { remaining: null, limit: null, resetAt: null, until: 0,
    attempts: 0, cacheHits: 0, blocked: 0, reason: 'normal' };
  const inflight = new Map();
  const cache = new Map();
  // Ephemeral, token-scoped validators for authorized conditional GETs only.
  // Never use a 304 to manufacture an unseen success or cache a mutation.
  const validators = new Map();
  async function request(route, init = {}) {
    if (!/^\/(?!\/)[\w?=./&%+,:-]+$/.test(route) || route.includes('..'))
      throw new Error('GitHub API path outside canonical repository is forbidden');
    const method = String(init.method || 'GET').toUpperCase();
    const nowMs = now();
    if (state.until > nowMs) {
      state.blocked++;
      onMetric({ type: 'blocked', reason: state.reason, retryAt: state.until });
      throw new GitHubRateDeferredError(state.until, 429, state.reason);
    }
    const key = method === 'GET' && !init.body ? route : null;
    if (key) {
      const cached = cache.get(key);
      if (cached?.expires > nowMs) {
        state.cacheHits++;
        return cached.value;
      }
      if (inflight.has(key)) {
        state.cacheHits++;
        return inflight.get(key);
      }
    }
    async function run() {
      state.attempts++;
      const validator = key ? validators.get(key) : null;
      const response = await fetchImpl('https://api.github.com/repos/' + repo + route, {
        ...init,
        headers: {
          authorization: 'Bearer ' + token,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(init.headers || {}),
          ...(validator ? { 'if-none-match': validator.etag } : {}),
        },
        signal: init.signal || AbortSignal.timeout(12000),
      });
      const data = response.status === 204 || response.status === 304 ? null :
        await response.json().catch(() => ({}));
      const budget = inspectGitHubBudget({
        status: response.status, headers: response.headers, body: data, nowMs: now(), reserve,
      });
      state.remaining = budget.remaining;
      state.limit = budget.limit;
      state.resetAt = budget.resetAt;
      state.until = Math.max(state.until, budget.until || 0);
      state.reason = budget.reason;
      onMetric({ type: budget.limited ? 'rate_limited' : 'request',
        status: response.status, remaining: budget.remaining, reason: budget.reason });
      if (budget.limited) throw new GitHubRateDeferredError(
        state.until || (now() + 60000), response.status, budget.reason);
      if (response.status === 304) {
        // GitHub only exempts correctly authorized unchanged conditional GETs
        // from the primary budget. Require matching in-process 200 evidence.
        if (!key || !validator || !validator.result?.ok)
          throw new Error('GitHub unexpected 304 without validated response');
        state.cacheHits++;
        onMetric({ type: 'not_modified', status: 304, reason: budget.reason });
        if (cacheMs > 0)
          cache.set(key, { expires: now() + cacheMs, value: validator.result });
        return validator.result;
      }
      const result = { status: response.status, ok: response.ok, data };
      if (key && response.ok) {
        const etag = response.headers.get('etag');
        if (typeof etag === 'string' && etag.length <= 256 &&
            /^(?:W\/)?\"[^\r\n]*\"$/.test(etag)) validators.set(key, { etag, result });
        else validators.delete(key);
      }
      if (key && response.ok && cacheMs > 0)
        cache.set(key, { expires: now() + cacheMs, value: result });
      return result;
    }
    const promise = run();
    if (!key) return promise;
    inflight.set(key, promise);
    try { return await promise; }
    finally { inflight.delete(key); }
  }
  async function json(route, init = {}) {
    const result = await request(route, init);
    if (!result.ok) throw new Error('GitHub API HTTP ' + result.status +
      ': ' + String(result.data?.message || 'unavailable').slice(0, 160));
    return result.data;
  }
  return { request, json, snapshot: () => ({ ...state }) };
}
