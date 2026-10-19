// Anthropic identity-linked keys (personal or service account keys that are not
// scoped to one workspace) must name a workspace on every request with the
// anthropic-workspace-id header; without it the API answers 400
// invalid_request_error. Workspace-scoped keys need no header.
//
// The workspace comes from ANTHROPIC_WORKSPACE_ID when it is set. Otherwise it
// is looked up once with the same key through List Workspaces (the Admin API
// accepts an unscoped personal/service key) and cached per isolate. The
// Default Workspace is the one that only appears with include_default=true.
// Only a key fingerprint is kept in memory, never the key itself.
const API = 'https://api.anthropic.com';
const VERSION = '2023-06-01';
const MESSAGES_URL = `${API}/v1/messages`;
const cache = new Map();

function configuredWorkspace(env = {}) {
  return String(env?.ANTHROPIC_WORKSPACE_ID || '').trim().slice(0, 120);
}

async function keyId(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(key)));
  return [...new Uint8Array(digest)].slice(0, 12).map(v => v.toString(16).padStart(2, '0')).join('');
}

export function anthropicWorkspaceRequired(status, data) {
  return Number(status) === 400 && /anthropic-workspace-id/i.test(String(data?.error?.message || ''));
}

async function listWorkspaceIds(key, includeDefault, fetchImpl) {
  const url = `${API}/v1/organizations/workspaces?limit=1000${includeDefault ? '&include_default=true' : ''}`;
  const response = await fetchImpl(url, { headers: { 'x-api-key': key, 'anthropic-version': VERSION }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error(`anthropic_workspace_lookup_${response.status}`), { status: response.status });
  const data = await response.json().catch(() => ({}));
  return (Array.isArray(data?.data) ? data.data : [])
    .filter(workspace => !workspace?.archived_at)
    .map(workspace => String(workspace?.id || '').trim())
    .filter(Boolean);
}

export async function resolveAnthropicWorkspace(env, key, { fetchImpl = globalThis.fetch, refresh = false } = {}) {
  const configured = configuredWorkspace(env);
  if (configured) return configured;
  const id = await keyId(key);
  if (!refresh && cache.has(id)) return cache.get(id);
  const [withDefault, named] = await Promise.all([
    listWorkspaceIds(key, true, fetchImpl),
    listWorkspaceIds(key, false, fetchImpl),
  ]);
  const defaultWorkspace = withDefault.find(workspace => !named.includes(workspace));
  const chosen = defaultWorkspace || (withDefault.length === 1 ? withDefault[0] : '');
  if (!chosen) throw new Error('anthropic_workspace_ambiguous');
  cache.set(id, chosen);
  return chosen;
}

// POST /v1/messages, adding the workspace header when one is known and retrying
// once with a looked-up workspace when the key turns out to need it.
export async function fetchAnthropicMessages(env, key, init = {}, fetchImpl = globalThis.fetch) {
  const configured = configuredWorkspace(env);
  const known = configured || cache.get(await keyId(key)) || '';
  const send = workspace => fetchImpl(MESSAGES_URL, {
    ...init,
    headers: { ...(init.headers || {}), ...(workspace ? { 'anthropic-workspace-id': workspace } : {}) },
  });
  const response = await send(known);
  if (response.status !== 400 || configured) return response;
  const data = await response.clone().json().catch(() => ({}));
  if (!anthropicWorkspaceRequired(response.status, data)) return response;
  const workspace = await resolveAnthropicWorkspace(env, key, { fetchImpl, refresh: true });
  return send(workspace);
}

export function resetAnthropicWorkspaceCache() {
  cache.clear();
}
