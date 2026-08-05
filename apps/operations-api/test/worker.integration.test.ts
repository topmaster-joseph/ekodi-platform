import { env, exports as workerExports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

const ADMIN_ORIGIN = 'https://ekodi.kr';
const PUBLIC_ORIGIN = 'https://mall.ekodi.kr';
const SETUP_TOKEN = 'integration-test-setup-token';
const ADMIN_EMAIL = 'topmaster.joseph@gmail.com';
const ADMIN_PASSWORD = 'integration-test-password';

async function request(path: string, init: RequestInit = {}) {
  return workerExports.default.fetch(`https://api.ekodi.test${path}`, init);
}

async function jsonRequest(path: string, method: string, body: unknown, token?: string, extraHeaders: Record<string, string> = {}) {
  return request(path, {
    method,
    headers: {
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
}

async function bootstrap() {
  const response = await jsonRequest('/api/setup', 'POST', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  }, undefined, { 'x-ekodi-setup-token': SETUP_TOKEN });
  expect(response.status).toBe(201);
  const result = await response.json() as { token: string; role: string };
  expect(result.role).toBe('super_admin');
  return result.token;
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM cms_revisions'),
    env.DB.prepare('DELETE FROM media_assets'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM login_attempts'),
    env.DB.prepare('DELETE FROM audit_logs'),
    env.DB.prepare('DELETE FROM cms_pages'),
    env.DB.prepare('DELETE FROM domain_registry'),
    env.DB.prepare('DELETE FROM admins')
  ]);
  const objects = await env.STORAGE.list();
  if (objects.objects.length) await env.STORAGE.delete(objects.objects.map(object => object.key));
});

describe('operations API integration', () => {
  it('requires the one-time setup secret and creates a server-side session', async () => {
    const preflight = await request('/api/setup', {
      method: 'OPTIONS',
      headers: { origin: ADMIN_ORIGIN, 'access-control-request-headers': 'content-type,x-ekodi-setup-token' }
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('x-ekodi-setup-token');
    const status = await request('/api/status', { headers: { origin: ADMIN_ORIGIN } });
    await expect(status.json()).resolves.toMatchObject({ initialized: false, setupAvailable: true, adminEmail: ADMIN_EMAIL });
    const denied = await jsonRequest('/api/setup', 'POST', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(denied.status).toBe(403);

    const token = await bootstrap();
    const session = await request('/api/session', {
      headers: { origin: ADMIN_ORIGIN, authorization: `Bearer ${token}` }
    });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({ authenticated: true, email: ADMIN_EMAIL, role: 'super_admin' });
  });

  it('keeps internal content private and records classification changes in revisions', async () => {
    const token = await bootstrap();
    const createdResponse = await jsonRequest('/api/cms/pages', 'POST', {
      siteId: 'mall', slug: 'private-plan', title: '내부 계획', summary: '내부 자료', content: '외부 공개 금지', classification: 'internal'
    }, token);
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { page: { id: number; version: number } };

    const blockedPublish = await request(`/api/cms/pages/${created.page.id}/publish`, {
      method: 'POST', headers: { origin: ADMIN_ORIGIN, authorization: `Bearer ${token}` }
    });
    expect(blockedPublish.status).toBe(409);

    const privateListing = await request('/api/content/mall/pages', { headers: { origin: PUBLIC_ORIGIN } });
    await expect(privateListing.json()).resolves.toEqual({ pages: [] });

    const savedResponse = await jsonRequest(`/api/cms/pages/${created.page.id}`, 'PUT', {
      version: created.page.version, classification: 'public'
    }, token);
    expect(savedResponse.status).toBe(200);
    const saved = await savedResponse.json() as { page: { version: number } };

    const publishedResponse = await request(`/api/cms/pages/${created.page.id}/publish`, {
      method: 'POST', headers: { origin: ADMIN_ORIGIN, authorization: `Bearer ${token}` }
    });
    expect(publishedResponse.status).toBe(200);

    const publicListing = await request('/api/content/mall/pages', { headers: { origin: PUBLIC_ORIGIN } });
    await expect(publicListing.json()).resolves.toMatchObject({ pages: [{ slug: 'private-plan', content: '외부 공개 금지' }] });

    const revisionsResponse = await request(`/api/cms/pages/${created.page.id}/revisions`, {
      headers: { origin: ADMIN_ORIGIN, authorization: `Bearer ${token}` }
    });
    const revisions = await revisionsResponse.json() as { revisions: Array<{ classification: string }> };
    expect(revisions.revisions.map(revision => revision.classification)).toEqual(['public', 'public', 'internal']);
    expect(saved.page.version).toBe(2);
  });

  it('enforces role permissions from D1 on every authenticated request', async () => {
    const token = await bootstrap();
    await env.DB.prepare("UPDATE admins SET role = 'viewer' WHERE email = ?").bind(ADMIN_EMAIL).run();

    const readable = await request('/api/cms/pages', {
      headers: { origin: ADMIN_ORIGIN, authorization: `Bearer ${token}` }
    });
    expect(readable.status).toBe(200);

    const denied = await jsonRequest('/api/cms/pages', 'POST', {
      siteId: 'mall', slug: 'blocked', title: '차단', summary: '', content: '', classification: 'public'
    }, token);
    expect(denied.status).toBe(403);

    await env.DB.prepare("UPDATE admins SET role = 'content_admin' WHERE email = ?").bind(ADMIN_EMAIL).run();
    const operationsDenied = await request('/api/domains', {
      headers: { origin: ADMIN_ORIGIN, authorization: `Bearer ${token}` }
    });
    expect(operationsDenied.status).toBe(403);
  });

  it('stores media in R2 privately by default and serves only explicit public assets', async () => {
    const token = await bootstrap();
    const privateForm = new FormData();
    privateForm.set('siteId', 'mall');
    privateForm.set('file', new File([new Uint8Array([1, 2, 3])], 'private.png', { type: 'image/png' }));
    const privateUpload = await request('/api/cms/media', {
      method: 'POST', headers: { origin: ADMIN_ORIGIN, authorization: `Bearer ${token}` }, body: privateForm
    });
    expect(privateUpload.status).toBe(201);
    const privateAsset = await privateUpload.json() as { asset: { id: number; url: null; visibility: string } };
    expect(privateAsset.asset).toMatchObject({ url: null, visibility: 'private' });
    const privateRead = await request(`/api/content/mall/media/${privateAsset.asset.id}`, { headers: { origin: PUBLIC_ORIGIN } });
    expect(privateRead.status).toBe(404);

    const publicForm = new FormData();
    publicForm.set('siteId', 'mall');
    publicForm.set('visibility', 'public');
    publicForm.set('file', new File([new Uint8Array([4, 5, 6])], 'public.png', { type: 'image/png' }));
    const publicUpload = await request('/api/cms/media', {
      method: 'POST', headers: { origin: ADMIN_ORIGIN, authorization: `Bearer ${token}` }, body: publicForm
    });
    expect(publicUpload.status).toBe(201);
    const publicAsset = await publicUpload.json() as { asset: { id: number; visibility: string } };
    expect(publicAsset.asset.visibility).toBe('public');

    const publicRead = await request(`/api/content/mall/media/${publicAsset.asset.id}`, { headers: { origin: PUBLIC_ORIGIN } });
    expect(publicRead.status).toBe(200);
    expect(publicRead.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await publicRead.arrayBuffer())]).toEqual([4, 5, 6]);
  });
});
