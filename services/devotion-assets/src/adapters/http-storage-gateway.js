const required = (value, name) => {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
};

export function createHttpStorageGateway({ endpoint, token = '', fetchImpl = fetch }) {
  const base = String(endpoint || '').replace(/\/$/, '');
  const objectUrl = (workspaceId, assetKey) => `${base}/v1/objects/${encodeURIComponent(workspaceId)}/${encodeURIComponent(assetKey)}`;
  const authHeaders = token ? { authorization: `Bearer ${token}` } : {};

  return {
    ready() { return Boolean(base); },
    async put({ workspace_id, asset_key, data, mime_type, metadata }) {
      if (!base) { const error = new Error('storage gateway endpoint is not configured'); error.code = 'ASSET_STORE_NOT_CONNECTED'; throw error; }
      const workspaceId = required(workspace_id, 'workspace_id');
      const assetKey = required(asset_key, 'asset_key');
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const response = await fetchImpl(objectUrl(workspaceId, assetKey), {
        method: 'PUT',
        headers: { 'content-type': mime_type || 'application/octet-stream', 'x-asset-metadata': JSON.stringify(metadata || {}), ...authHeaders },
        body: buffer
      });
      if (!response.ok) throw new Error(`storage gateway PUT failed: HTTP ${response.status}`);
      const body = await response.json().catch(() => ({}));
      return {
        workspace_id: workspaceId,
        asset_key: assetKey,
        mime_type: mime_type || 'application/octet-stream',
        size: Number(body.size ?? buffer.length),
        metadata: metadata || {},
        stored_at: body.stored_at || new Date().toISOString(),
        etag: body.etag || ''
      };
    },
    async get({ workspace_id, asset_key }) {
      if (!base) { const error = new Error('storage gateway endpoint is not configured'); error.code = 'ASSET_STORE_NOT_CONNECTED'; throw error; }
      const workspaceId = required(workspace_id, 'workspace_id');
      const assetKey = required(asset_key, 'asset_key');
      const response = await fetchImpl(objectUrl(workspaceId, assetKey), { method: 'GET', headers: { ...authHeaders } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`storage gateway GET failed: HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      const metadata = JSON.parse(response.headers.get('x-asset-metadata') || '{}');
      return {
        workspace_id: workspaceId,
        asset_key: assetKey,
        data,
        mime_type: response.headers.get('content-type') || 'application/octet-stream',
        metadata,
        stored_at: response.headers.get('x-asset-stored-at') || ''
      };
    }
  };
}
