import { isReservedPlatformRoot } from './platform-route-registry.js';

// A public locator is never a new tenant or grant. Check all tenant states,
// including private/inactive occupants, before serving the shorter address.
const rootLocator = value => {
  try {
    const raw = String(value || '').trim();
    const url = new URL(raw.startsWith('/') ? raw : /^https?:\/\//i.test(raw) ? raw : 'https://' + raw, 'https://ekodi.kr');
    return url.hostname.toLowerCase().replace(/^www\./, '') === 'ekodi.kr'
      ? decodeURIComponent(url.pathname).split('/').filter(Boolean)[0]?.toLowerCase() || '' : '';
  } catch { return ''; }
};

// Share one decision through publication and routing for this request only.
// Never retry a failed lookup later in the same request and expose private HTML.
const requestDecisions = new WeakMap();
export function cooperativeLocatorAvailability(env, coop, request) {
  if (!request) return checkAvailability(env, coop);
  let decisions = requestDecisions.get(request);
  if (!decisions) { decisions = new Map(); requestDecisions.set(request, decisions); }
  const previous = decisions.get(coop.workspaceId);
  if (previous?.env === env) return previous.result;
  const result = checkAvailability(env, coop);
  decisions.set(coop.workspaceId, { env, result });
  return result;
}

async function checkAvailability(env, coop) {
  if (isReservedPlatformRoot(coop.publicSlug)) return { ok: false, code: 'COOP_LOCATOR_CONFLICT' };
  if (!env?.DB?.prepare) return { ok: false, code: 'COOP_LOCATOR_UNAVAILABLE' };
  try {
    const [tenants, sites] = await Promise.all([
      env.DB.prepare('SELECT slug,domain FROM customer_tenants').all(),
      env.DB.prepare('SELECT site_id,workspace_id,domain FROM public_site_controls').all(),
    ]);
    const collision = (tenants.results || []).some(row => row.slug !== coop.slug &&
      (String(row.slug).toLowerCase() === coop.publicSlug || rootLocator(row.domain) === coop.publicSlug)) ||
      (sites.results || []).some(row => rootLocator(row.domain) === coop.publicSlug &&
        (row.site_id !== coop.slug || row.workspace_id !== coop.workspaceId));
    if (collision) return { ok: false, code: 'COOP_LOCATOR_CONFLICT' };
    // SPACE's existing public RPC includes paused sites and alias_slugs. Only
    // a successful literal null proves this locator is not already occupied.
    const base = env.SUPABASE_URL || env.MY_SUPABASE_URL;
    const key = env.SUPABASE_PUBLISHABLE_KEY || env.MY_SUPABASE_PUBLISHABLE_KEY;
    if (base && key) {
      const response = await fetch(String(base).replace(/\/$/, '') + '/rest/v1/rpc/store_user_site_public_profile', {
        method: 'POST', headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify({ p_slug: coop.publicSlug }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return { ok: false, code: 'COOP_LOCATOR_UNAVAILABLE' };
      const profile = await response.json();
      if (profile !== null) return { ok: false, code: profile && typeof profile === 'object' && !Array.isArray(profile) ? 'COOP_LOCATOR_CONFLICT' : 'COOP_LOCATOR_UNAVAILABLE' };
    } else if (env.ENVIRONMENT === 'production') return { ok: false, code: 'COOP_LOCATOR_UNAVAILABLE' };
    return { ok: true };
  } catch { return { ok: false, code: 'COOP_LOCATOR_UNAVAILABLE' }; }
}
