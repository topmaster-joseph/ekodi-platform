function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function requireAccess(request) {
  const assertion = request.headers.get('cf-access-jwt-assertion') || '';
  if (!assertion) {
    return json({ error: 'Cloudflare Access 인증이 필요합니다.', code: 'ACCESS_REQUIRED' }, 401);
  }
  return null;
}

function normalizeKey(raw) {
  const key = String(raw || '').trim();
  if (!key || key.length > 1024 || key.startsWith('/') || key.includes('\\') || /[\u0000-\u001f\u007f]/.test(key)) return '';
  const parts = key.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return '';
  return parts.join('/');
}

function objectMetadata(object) {
  return {
    key: object.key,
    size: object.size,
    etag: object.httpEtag || object.etag || '',
    uploaded: object.uploaded instanceof Date ? object.uploaded.toISOString() : object.uploaded || null,
    contentType: object.httpMetadata?.contentType || null,
  };
}

export async function handleR2StorageControl(request, env) {
  if (!env.R2_BUCKET) return json({ error: 'R2 저장소가 연결되지 않았습니다.', code: 'R2_NOT_CONFIGURED' }, 503);
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/control/storage/r2/status' && request.method === 'GET') {
    return json({ ok: true, provider: 'r2', configured: true, binding: 'R2_BUCKET' });
  }

  if (path === '/api/control/storage/r2/list' && request.method === 'GET') {
    const prefix = String(url.searchParams.get('prefix') || '');
    const cursor = String(url.searchParams.get('cursor') || '');
    const requestedLimit = Number(url.searchParams.get('limit') || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(1000, Math.max(1, Math.trunc(requestedLimit))) : 100;
    const result = await env.R2_BUCKET.list({ prefix, cursor: cursor || undefined, limit });
    return json({
      ok: true,
      provider: 'r2',
      prefix,
      truncated: Boolean(result.truncated),
      cursor: result.truncated ? result.cursor || null : null,
      objects: (result.objects || []).map(objectMetadata),
    });
  }

  if (path === '/api/control/storage/r2/object') {
    const key = normalizeKey(url.searchParams.get('key'));
    if (!key) return json({ error: '유효한 객체 key가 필요합니다.', code: 'INVALID_OBJECT_KEY' }, 400);

    if (request.method === 'POST' || request.method === 'PUT') {
      const contentType = request.headers.get('content-type') || 'application/octet-stream';
      const result = await env.R2_BUCKET.put(key, request.body || new Uint8Array(), {
        httpMetadata: { contentType },
        customMetadata: { uploadedAt: new Date().toISOString() },
      });
      return json({ ok: true, provider: 'r2', object: objectMetadata(result) }, 201);
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      const object = await env.R2_BUCKET.get(key);
      if (!object) return json({ error: '객체를 찾을 수 없습니다.', code: 'OBJECT_NOT_FOUND' }, 404);
      const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      if (typeof object.writeHttpMetadata === 'function') object.writeHttpMetadata(headers);
      else if (object.httpMetadata?.contentType) headers.set('content-type', object.httpMetadata.contentType);
      const etag = object.httpEtag || object.etag;
      if (etag) headers.set('etag', etag);
      if (object.uploaded) headers.set('last-modified', new Date(object.uploaded).toUTCString());
      headers.set('x-ekodi-storage-provider', 'r2');
      headers.set('x-ekodi-object-key', key);
      return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
    }

    if (request.method === 'DELETE') {
      await env.R2_BUCKET.delete(key);
      return json({ ok: true, provider: 'r2', deleted: key });
    }

    return json({ error: '지원하지 않는 메서드입니다.', code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  return null;
}
