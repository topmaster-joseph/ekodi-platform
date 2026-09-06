import { connectionRecoverySnapshot } from './integration-connection-supervisor.js';

const DEFAULT_SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';

function text(value) { return String(value ?? '').trim(); }

export function canonicalAiSubject(identity = {}) {
  const personId = text(identity.personId);
  const authUserId = text(identity.authUserId || identity.id);
  if (personId) return `person:${personId}`;
  return authUserId ? `auth:${authUserId}` : '';
}

export function legacyAiSubject(identity = {}) {
  return text(identity.authUserId || identity.id);
}

export function personalAiSubjectCandidates(identity = {}) {
  const values = [canonicalAiSubject(identity), legacyAiSubject(identity)].filter(Boolean);
  return [...new Set(values)];
}

export function buildPersonalAiBridgeSnapshot(identity = {}, options = {}) {
  const canonical = Boolean(text(identity.personId) && text(identity.ekodiId));
  return Object.freeze({
    version:'2026-09-06.1',
    active:Boolean(identity.authUserId || identity.id),
    canonical,
    providerIndependent:true,
    subjectKey:canonicalAiSubject(identity),
    ekodiId:text(identity.ekodiId) || null,
    loginProvider:text(identity.loginProvider) || null,
    forward:Object.freeze({ router:'ekodi-ai-router', automatic:true, coreFirst:true }),
    reverse:Object.freeze({ gateway:'ekodi-mcp', requiresFirstConnectionConsent:true, connected:Boolean(options.mcpConnected) }),
    recovery:connectionRecoverySnapshot(options.recovery || {}),
  });
}

export async function resolveCanonicalEkodiIdentity({
  token,
  authUser,
  fetchImpl = fetch,
  supabaseUrl = DEFAULT_SUPABASE_URL,
  publishableKey = DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  oauthMcp = false,
} = {}) {
  const authUserId = text(authUser?.id);
  const email = text(authUser?.email).toLowerCase();
  if (!text(token) || !authUserId) return null;

  const fallback = {
    id:authUserId,
    authUserId,
    email,
    personId:null,
    ekodiId:null,
    loginProvider:null,
    canonical:false,
    authorized:oauthMcp ? false : true,
  };

  try {
    const rpc = oauthMcp ? 'current_ekodi_mcp_identity' : 'current_ekodi_identity';
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
      method:'POST',
      headers:{
        apikey:publishableKey,
        authorization:`Bearer ${token}`,
        'content-type':'application/json',
      },
      body:'{}',
    });
    if (!response.ok) return { ...fallback, subjectKey:canonicalAiSubject(fallback) };
    const data = await response.json();
    const identity = {
      ...fallback,
      personId:text(data?.person_id) || null,
      ekodiId:text(data?.ekodi_id) || null,
      loginProvider:text(data?.login_provider) || null,
      canonical:data?.canonical === true,
      authorized:oauthMcp ? data?.authorized === true : true,
    };
    return { ...identity, subjectKey:canonicalAiSubject(identity) };
  } catch {
    return { ...fallback, subjectKey:canonicalAiSubject(fallback) };
  }
}

export const PERSONAL_AI_BRIDGE_CONTRACT = Object.freeze({
  version:'2026-09-06.1',
  identityAuthority:'ekodi-person',
  loginProvidersReplaceable:true,
  forward:'ai-router',
  reverse:'ekodi-mcp',
  consumerAiConnectionRequiresConsent:true,
  consumerWebSessionNeverServerApi:true,
  automaticSafeReconnect:true,
  explicitDisconnectWins:true,
});
