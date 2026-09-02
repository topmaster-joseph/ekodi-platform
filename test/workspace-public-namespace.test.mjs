import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReservedPublicNamespace,
  isValidPublicNamespace,
  publicNamespaceForLegacyTenantSlug,
  suggestPublicNamespaces,
  workspaceForPublicNamespace,
} from '../workspace-public-namespace.js';
import {
  proxyPublicWorkspace,
  resolveLegacyWorkspaceRedirect,
  resolvePublicWorkspacePath,
} from '../workspace-public-proxy.js';

test('public namespaces are globally unique locators, independent of workspace type', () => {
  assert.equal(isValidPublicNamespace('same-name'), true);
  assert.equal(isReservedPublicNamespace('admin'), true);
  assert.equal(isValidPublicNamespace('admin'), false);
  assert.equal(publicNamespaceForLegacyTenantSlug('ekodi-biz'), 'ekodibiz');
  assert.equal(workspaceForPublicNamespace('cgma').workspaceId, 'ws_org_cgma');
  const suggestions = suggestPublicNamespaces('church', ['church', 'church-2'], { region: 'mokpo' });
  assert.ok(suggestions.includes('church-mokpo'));
  assert.ok(!suggestions.includes('church'));
});
test('legacy typed paths redirect to the assigned namespace', async () => {
  assert.equal(await resolveLegacyWorkspaceRedirect('/org/ekodi-biz/mall'), '/ekodibiz/mall');
  assert.equal(await resolveLegacyWorkspaceRedirect('/biz/cgma/admin'), '/cgma/admin');
});

test('unknown valid namespaces resolve through EKODI Core tenant lookup', async () => {
  const route = await resolvePublicWorkspacePath('/future-space/news', async () => new Response(JSON.stringify({
    tenant: {
      slug: 'future-space', name: '동명이름 기관', domain: 'future-space.ekodi.kr',
      workspaceId: 'ws_future_1', workspaceType: 'organization', workspaceSubtype: 'institution',
      publicNamespace: 'future-space',
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.equal(route.publicNamespace, 'future-space');
  assert.equal(route.suffix, '/news');
  assert.equal(route.workspace.workspaceId, 'ws_future_1');
});

test('workspace proxy keeps root-relative API calls inside the namespace', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("fetch('/api/health')", { status: 200, headers: { 'content-type': 'application/javascript' } });
  try {
    const route = await resolvePublicWorkspacePath('/ekodibiz/app.js');
    const response = await proxyPublicWorkspace(new Request('https://ekodi.kr/ekodibiz/app.js'), route);
    assert.equal(await response.text(), "fetch('/ekodibiz/api/health')");
    assert.equal(response.headers.get('x-ekodi-workspace-id'), 'ws_org_ekodi_biz');
  } finally {
    globalThis.fetch = originalFetch;
  }
});