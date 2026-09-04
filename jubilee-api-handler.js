import { evaluateJubileeRecommendation, JUBILEE_RUNTIME } from './jubilee-runtime.js';

export const JUBILEE_API_PREFIX = '/api/jubilee/v1';
const MAX_BODY_BYTES = 128 * 1024;
const MAX_CANDIDATES = 50;

export async function handleJubileeApi(request, env = {}, options = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(JUBILEE_API_PREFIX)) return null;

  const headers = baseHeaders();

  if (request.method === 'OPTIONS') {
    headers.set('allow', 'POST, OPTIONS');
    return new Response(null, { status: 204, headers });
  }

  const authorize = typeof options.authorize === 'function' ? options.authorize : null;
  if (!authorize) {
    return jsonResponse({
      error: 'Jubilee API authorization adapter is not configured.',
      code: 'JUBILEE_AUTH_ADAPTER_REQUIRED',
    }, 503, headers);
  }

  const auth = await authorize({ request, env, capability: 'jubilee.evaluate' });
  if (!auth?.allowed) {
    return jsonResponse({
      error: 'Not authorized for Jubilee evaluation.',
      code: 'JUBILEE_FORBIDDEN',
    }, auth?.status || 403, headers);
  }

  if (request.method === 'GET' && url.pathname === `${JUBILEE_API_PREFIX}/policy`) {
    return jsonResponse({
      version: JUBILEE_RUNTIME.version,
      principle: JUBILEE_RUNTIME.principle,
      authority: JUBILEE_RUNTIME.authority,
      recommendationRole: JUBILEE_RUNTIME.recommendationRole,
      rules: JUBILEE_RUNTIME.rules,
    }, 200, headers);
  }

  if (request.method !== 'POST' || url.pathname !== `${JUBILEE_API_PREFIX}/evaluate`) {
    return jsonResponse({ error: 'Jubilee API endpoint not found.', code: 'JUBILEE_NOT_FOUND' }, 404, headers);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Request body is too large.', code: 'JUBILEE_BODY_TOO_LARGE' }, 413, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.', code: 'JUBILEE_INVALID_JSON' }, 400, headers);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Request body must be a JSON object.', code: 'JUBILEE_INVALID_REQUEST' }, 400, headers);
  }

  if (!Array.isArray(body.candidates)) {
    return jsonResponse({ error: '`candidates` must be an array.', code: 'JUBILEE_CANDIDATES_REQUIRED' }, 400, headers);
  }

  if (body.candidates.length > MAX_CANDIDATES) {
    return jsonResponse({
      error: `A maximum of ${MAX_CANDIDATES} candidates can be evaluated at once.`,
      code: 'JUBILEE_TOO_MANY_CANDIDATES',
    }, 400, headers);
  }

  const evaluationInput = {
    context: body.context && typeof body.context === 'object' ? body.context : {},
    market: body.market && typeof body.market === 'object' ? body.market : {},
    candidates: body.candidates,
  };

  const result = evaluateJubileeRecommendation(evaluationInput);
  const requestId = globalThis.crypto?.randomUUID?.() || `jubilee_${Date.now()}`;

  if (typeof options.audit === 'function') {
    await options.audit({
      requestId,
      workspaceId: safeWorkspaceId(body.workspace_id),
      actorId: auth.actorId ? String(auth.actorId).slice(0, 160) : null,
      status: result.status,
      policyVersion: result.policyVersion,
      rulesTriggered: result.audit.rulesTriggered,
      warningCount: result.audit.warnings.length,
      candidateCount: body.candidates.length,
      choiceCount: result.choiceSet.length,
      supportActionCount: result.supportActions.length,
      externalAlternativeLookupRequired: result.externalAlternativeLookupRequired,
      humanReviewRequired: result.humanReviewRequired,
    });
  }

  return jsonResponse({
    requestId,
    workspace_id: safeWorkspaceId(body.workspace_id),
    ...result,
  }, result.status === 'blocked' ? 422 : 200, headers);
}

function safeWorkspaceId(value) {
  const id = String(value || '').trim();
  if (!id) return null;
  return /^[A-Za-z0-9:_-]{1,160}$/.test(id) ? id : null;
}

function baseHeaders() {
  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  return headers;
}

function jsonResponse(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers });
}
