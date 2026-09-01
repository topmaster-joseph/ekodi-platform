const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const pathParts = pathname => pathname.split('/').filter(Boolean);

export function createDevotionStudioHttpHandler({ service, serviceKey = '' }) {
  if (!service) throw new Error('service is required');
  return async function handle(request) {
    const url = new URL(request.url);
    const parts = pathParts(url.pathname);
    if (request.method === 'GET' && url.pathname === '/v1/health') return json({ ok: true, service: 'ekodi.devotion-studio' });
    if (serviceKey) {
      const expected = `Bearer ${serviceKey}`;
      if (request.headers.get('authorization') !== expected) return json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, 401);
    }
    try {
      if (parts[0] !== 'v1' || parts[1] !== 'batches' || !parts[2]) return json({ error: 'not found', code: 'NOT_FOUND' }, 404);
      const batchKey = decodeURIComponent(parts[2]);
      const workspaceId = String(url.searchParams.get('workspace_id') || '');
      if (request.method === 'GET' && parts.length === 3) {
        const snapshot = await service.getBatch({ workspace_id: workspaceId, batch_key: batchKey });
        return snapshot ? json(snapshot) : json({ error: 'batch not found', code: 'BATCH_NOT_FOUND' }, 404);
      }
      if (request.method === 'PUT' && parts.length === 3) {
        const body = await request.json();
        return json(await service.putBatch({ ...body, workspace_id: body.workspace_id || workspaceId, batch_key: batchKey }));
      }
      if (request.method === 'POST' && parts[3] === 'render') {
        const body = await request.json().catch(() => ({}));
        return json(await service.queueRender({ workspace_id: body.workspace_id || workspaceId, batch_key: batchKey, format: body.format }), 202);
      }
      if (request.method === 'POST' && parts[3] === 'publications' && parts[4] && parts[5] === 'schedule') {
        const body = await request.json();
        return json(await service.schedulePublication({
          workspace_id: body.workspace_id || workspaceId,
          batch_key: batchKey,
          target_id: decodeURIComponent(parts[4]),
          publish_at: body.publish_at,
          item_ids: body.item_ids
        }), 202);
      }
      return json({ error: 'not found', code: 'NOT_FOUND' }, 404);
    } catch (error) {
      const code = String(error?.code || 'DEVOTION_STUDIO_ERROR');
      const status = code.endsWith('_NOT_CONNECTED') ? 409 : /required|not found/i.test(String(error?.message)) ? 400 : 500;
      return json({ error: String(error?.message || 'service error'), code }, status);
    }
  };
}
