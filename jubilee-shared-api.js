import { handleJubileeApi, JUBILEE_API_PREFIX } from './jubilee-api-handler.js';
import { createJubileeCapabilityAuthorizer } from './jubilee-capability-auth.js';
import { createJubileePostgrestOperationalStore } from './jubilee-postgrest-adapter.js';

const MODES = new Set(['off', 'shadow', 'active']);

/**
 * Production-facing composition root for the Jubilee API.
 *
 * Default mode is OFF. Enabling shadow/active still requires capability grants,
 * and evaluation additionally requires durable PostgREST audit persistence.
 * No browser/client receives database credentials.
 */
export async function handleJubileeSharedApi(request, env = {}, options = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(JUBILEE_API_PREFIX)) return null;

  const mode = normalizeMode(options.mode ?? env.JUBILEE_API_MODE);
  if (mode === 'off') return integrationJson({ error: 'Not found.', code: 'JUBILEE_NOT_FOUND' }, 404);

  let authorize;
  try {
    authorize = createJubileeCapabilityAuthorizer({
      grants: options.grants ?? env.JUBILEE_CAPABILITY_GRANTS ?? '[]',
      sessionVerifier: options.sessionVerifier,
    });
  } catch (error) {
    console.error('Jubilee capability integration configuration error', String(error?.message || error));
    return integrationJson({
      error: 'Jubilee authorization is not ready.',
      code: 'JUBILEE_INTEGRATION_NOT_READY',
    }, 503);
  }

  const isEvaluation = request.method === 'POST' && url.pathname === `${JUBILEE_API_PREFIX}/evaluate`;
  let audit;
  if (isEvaluation) {
    try {
      const store = createJubileePostgrestOperationalStore({
        env,
        baseUrl: options.postgrestUrl,
        serviceToken: options.postgrestServiceToken,
        apiKey: options.postgrestApiKey,
        fetch: options.fetch,
      });
      audit = event => store.recordPolicyEvent(event);
    } catch (error) {
      console.error('Jubilee durable audit integration configuration error', String(error?.message || error));
      return integrationJson({
        error: 'Jubilee durable audit is not ready.',
        code: 'JUBILEE_INTEGRATION_NOT_READY',
      }, 503);
    }
  }

  const response = await handleJubileeApi(request, env, {
    authorize,
    audit,
    requireAudit: isEvaluation,
  });
  if (response) response.headers.set('x-ekodi-jubilee-mode', mode);
  return response;
}

export function jubileeApiMode(env = {}) {
  return normalizeMode(env.JUBILEE_API_MODE);
}

function normalizeMode(value) {
  const mode = String(value || 'off').trim().toLowerCase();
  return MODES.has(mode) ? mode : 'off';
}

function integrationJson(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
