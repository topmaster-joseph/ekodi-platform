import { createJubileeOperationalStore } from './jubilee-operational-store.js';

const TABLES = Object.freeze({
  policy: 'jubilee_policy_events',
  support: 'jubilee_support_events',
  pool: 'jubilee_pool_entries',
});

/**
 * PostgREST-compatible durable adapter for the Jubilee operational store.
 *
 * The Jubilee core remains vendor-neutral. Supabase is one possible PostgREST
 * host, but the runtime only depends on this narrow append contract.
 * Server-side secrets must be injected at runtime and never shipped to browsers.
 */
export function createJubileePostgrestAdapter(config = {}) {
  const baseUrl = normalizeBaseUrl(
    config.baseUrl
      || config.JUBILEE_POSTGREST_URL
      || config.env?.JUBILEE_POSTGREST_URL
      || '',
  );
  const serviceToken = requiredSecret(
    config.serviceToken
      || config.JUBILEE_POSTGREST_SERVICE_TOKEN
      || config.env?.JUBILEE_POSTGREST_SERVICE_TOKEN
      || '',
  );
  const apiKey = optionalSecret(
    config.apiKey
      || config.JUBILEE_POSTGREST_API_KEY
      || config.env?.JUBILEE_POSTGREST_API_KEY
      || serviceToken,
  );
  const fetchImpl = typeof config.fetch === 'function' ? config.fetch : globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('jubilee_postgrest_fetch_required');

  const append = async (table, rows) => {
    const payload = Array.isArray(rows) ? rows : [rows];
    if (payload.length === 0) return;
    const response = await fetchImpl(`${baseUrl}/${table}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceToken}`,
        apikey: apiKey,
        'content-type': 'application/json',
        prefer: 'return=minimal',
        'x-client-info': 'ekodi-jubilee/1.0',
      },
      body: JSON.stringify(payload),
    });
    if (!response?.ok) {
      const status = Number(response?.status || 0);
      throw new Error(`jubilee_postgrest_write_failed:${table}:${status || 'network'}`);
    }
  };

  return Object.freeze({
    appendPolicyEvent: event => append(TABLES.policy, event),
    appendSupportEvents: events => append(TABLES.support, events),
    appendPoolEntry: entry => append(TABLES.pool, entry),
  });
}

export function createJubileePostgrestOperationalStore(config = {}) {
  return createJubileeOperationalStore(createJubileePostgrestAdapter(config));
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('jubilee_postgrest_url_required');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('invalid_jubilee_postgrest_url');
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('jubilee_postgrest_https_required');
  }
  return raw;
}

function requiredSecret(value) {
  const secret = String(value || '').trim();
  if (secret.length < 24) throw new Error('jubilee_postgrest_service_token_required');
  return secret;
}

function optionalSecret(value) {
  const secret = String(value || '').trim();
  return secret || '';
}
