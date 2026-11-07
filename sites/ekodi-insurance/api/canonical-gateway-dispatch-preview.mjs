// PREVIEW ONLY: private insurance API adapter. NOT wired to a public Worker.
// Callers must have an independently verified, platform-owned visitor identity.
// Never forward arbitrary URLs, browser cookies, bearer authorization, or secrets.
import { classifyInsuranceGatewayRequest } from './canonical-gateway-contract.mjs';

const INTERNAL_ORIGIN = 'https://insurance.internal.invalid';
const CANONICAL_ORIGIN = 'https://ekodi.kr';
const MAX_REPLY_BYTES = 512 * 1024;
const encoder = new TextEncoder();
const baseHeaders = Object.freeze({
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-type': 'application/json; charset=utf-8'
});

function reject(status, code) {
  return new Response(JSON.stringify({ error: code }), { status, headers: baseHeaders });
}
async function boundedBytes(stream, max) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('invalid_stream_chunk');
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        throw new Error('body_limit_exceeded');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
function verifiedIdentity(visitor) {
  // This object must be supplied by the apex Worker, *not* constructed from
  // caller-supplied forwarded/IP/actor headers. Never trust headers alone.
  if (!visitor || visitor.edgeVerified !== true ||
      typeof visitor.ip !== 'string' ||
      !/^(?:[a-fA-F0-9:.]+)$/.test(visitor.ip) ||
      visitor.ip.length > 64) return null;
  const agent = typeof visitor.userAgent === 'string' ? visitor.userAgent.slice(0, 120) : '';
  return { ip: visitor.ip, agent };
}

// This function has no public route registration. All network calls (if any)
// are exclusively to an explicitly injected private service binding.
export async function dispatchInsurancePrivatePreview(request, {
  binding, verifiedVisitor = null, quotaCircuitOpen = false
} = {}) {
  const match = classifyInsuranceGatewayRequest(request);
  if (!match.allowed) return reject(match.status, match.code);
  if (quotaCircuitOpen) return reject(429, 'quota_circuit_open');
  if (!binding || typeof binding.fetch !== 'function') return reject(503, 'private_binding_unavailable');

  const mutating = match.method === 'POST';
  const identity = verifiedIdentity(verifiedVisitor);
  if (mutating && !identity) return reject(503, 'trusted_client_identity_required');

  let payload;
  if (mutating) {
    try {
      payload = await boundedBytes(request.body, match.maxBodyBytes);
      if (!payload.byteLength) return reject(400, 'json_body_required');
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reject(400, 'json_object_required');
    } catch (error) {
      if (error?.message === 'body_limit_exceeded') return reject(413, 'request_body_too_large');
      return reject(400, 'invalid_json_body');
    }
  }

  const headers = new Headers({ origin: CANONICAL_ORIGIN, accept: 'application/json' });
  if (mutating) {
    headers.set('content-type', 'application/json');
    // Authenticated/verified Cloudflare edge client identity only.
    headers.set('cf-connecting-ip', identity.ip);
    if (identity.agent) headers.set('user-agent', identity.agent);
  }
  // Never forward cookies, Authorization, client-supplied CF/actor/internal
  // headers, original query params, redirects, referrers, or credentials.
  const upstreamRequest = new Request(INTERNAL_ORIGIN + match.upstreamPath, {
    method: match.method,
    headers,
    ...(mutating ? { body: payload } : {}),
    redirect: 'manual',
    credentials: 'omit'
  });
  let upstream;
  try {
    upstream = await binding.fetch(upstreamRequest);
  } catch {
    return reject(503, 'private_service_unavailable');
  }
  if (!(upstream instanceof Response)) return reject(502, 'private_service_invalid_response');
  if (upstream.status === 429 || upstream.status === 1027) return reject(429, 'quota_circuit_open');
  if (upstream.status >= 300 && upstream.status < 400) return reject(502, 'private_redirect_denied');
  if (!String(upstream.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return reject(502, 'private_response_not_json');
  }
  let body;
  try {
    body = await boundedBytes(upstream.body, MAX_REPLY_BYTES);
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return reject(502, 'private_response_invalid');
  }
  // Do not forward Set-Cookie, CORS, cache or internal service headers.
  return new Response(body, { status: upstream.status, headers: baseHeaders });
}
