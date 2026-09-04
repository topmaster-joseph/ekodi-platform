import { evaluateJubileeRecommendation, JUBILEE_RUNTIME } from './jubilee-runtime.js';

export const JUBILEE_API_PREFIX = '/api/jubilee/v1';
const MAX_BODY_BYTES = 128 * 1024;
const MAX_CANDIDATES = 50;

export async function handleJubileeApi(request, env = {}, options = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(JUBILEE_API_PREFIX)) return null;

  const headers = baseHeaders();

  if (request.method === 'OPTIONS') {
    headers.set('allow', 'GET, POST, OPTIONS');
    return new Response(null, { status: 204, headers });
  }

  const isPolicyRead = request.method === 'GET' && url.pathname === `${JUBILEE_API_PREFIX}/policy`;
  const isEvaluation = request.method === 'POST' && url.pathname === `${JUBILEE_API_PREFIX}/evaluate`;
  if (!isPolicyRead && !isEvaluation) {
    return jsonResponse({ error: 'Jubilee API endpoint not found.', code: 'JUBILEE_NOT_FOUND' }, 404, headers);
  }

  const authorize = typeof options.authorize === 'function' ? options.authorize : null;
  if (!authorize) {
    return jsonResponse({
      error: 'Jubilee API authorization adapter is not configured.',
      code: 'JUBILEE_AUTH_ADAPTER_REQUIRED',
    }, 503, headers);
  }

  const capability = isPolicyRead ? 'jubilee.policy.read' : 'jubilee.evaluate';
  const auth = await authorize(request, { env, capability });
  if (!auth?.allowed) {
    return jsonResponse({
      error: 'Not authorized for this Jubilee capability.',
      code: 'JUBILEE_FORBIDDEN',
    }, auth?.status || 403, headers);
  }

  if (isPolicyRead) {
    return jsonResponse({
      version: JUBILEE_RUNTIME.version,
      principle: JUBILEE_RUNTIME.principle,
      authority: JUBILEE_RUNTIME.authority,
      recommendationRole: JUBILEE_RUNTIME.recommendationRole,
      rules: JUBILEE_RUNTIME.rules,
    }, 200, headers);
  }

  const audit = typeof options.audit === 'function' ? options.audit : null;
  const requireAudit = options.requireAudit === true;
  if (requireAudit && !audit) {
    return jsonResponse({
      error: 'Jubilee durable audit persistence is required before evaluation can run.',
      code: 'JUBILEE_AUDIT_ADAPTER_REQUIRED',
    }, 503, headers);
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
  const actorRefHash = auth.actorId ? await sha256Hex(`jubilee-actor:${String(auth.actorId).slice(0, 160)}`) : null;

  if (audit) {
    try {
      await audit({
        requestId,
        workspaceId: safeWorkspaceId(body.workspace_id),
        purpose: safePurpose(body.purpose),
        status: result.status,
        decisionStatus: result.status,
        policyVersion: result.policyVersion,
        rulesTriggered: result.audit.rulesTriggered,
        warningCount: result.audit.warnings.length,
        candidateCount: body.candidates.length,
        choiceCount: result.choiceSet.length,
        supportActionCount: result.supportActions.length,
        externalAlternativeLookupRequired: result.externalAlternativeLookupRequired,
        humanReviewRequired: result.humanReviewRequired,
        actorRefHash,
      });
    } catch (error) {
      console.error('Jubilee durable audit persistence failed', String(error?.message || error));
      if (requireAudit) {
        return jsonResponse({
          error: 'Jubilee evaluation was not released because durable audit persistence failed.',
          code: 'JUBILEE_AUDIT_PERSISTENCE_FAILED',
        }, 503, headers);
      }
      throw error;
    }
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

function safePurpose(value) {
  const purpose = String(value || 'recommendation').trim().toLowerCase();
  return /^[a-z0-9:_-]{1,80}$/.test(purpose) ? purpose : 'recommendation';
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
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
