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
test('nested Marketing service mounts resolve to provider-neutral canonical workspace paths', async () => {
  const ekodibiz = await resolvePublicWorkspacePath('/ekodibiz/marketing-ai');
  const jadam = await resolvePublicWorkspacePath('/jadam/marketing/app.js');
  const cgma = await resolvePublicWorkspacePath('/cgma/marketing/app.js');
  assert.equal(ekodibiz.serviceMount?.upstreamHost, 'marketing-ai.pages.dev');
  assert.equal(ekodibiz.serviceMount?.prefix, '/marketing-ai');
  assert.equal(jadam.serviceMount?.upstreamHost, 'marketing-ai-jadam.pages.dev');
  assert.equal(jadam.serviceMount?.prefix, '/marketing');
  assert.equal(cgma.serviceMount?.upstreamHost, 'cheonggye-market.pages.dev');
  assert.equal(cgma.serviceMount?.upstreamBase, '/market-ai');
});

test('nested Marketing proxy strips mount prefix upstream and rewrites assets back to canonical path', async () => {
  const originalFetch = globalThis.fetch;
  let requested = '';
  globalThis.fetch = async request => {
    requested = String(request.url || request);
    return new Response('<link href="/app.css"><script src="/app.js"></script>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  };
  try {
    const route = await resolvePublicWorkspacePath('/jadam/marketing');
    const response = await proxyPublicWorkspace(new Request('https://ekodi.kr/jadam/marketing'), route);
    assert.equal(requested, 'https://marketing-ai-jadam.pages.dev/');
    assert.equal(response.headers.get('x-ekodi-service-mount'), 'marketing');
    assert.equal(response.headers.get('link'), '<https://ekodi.kr/jadam/marketing>; rel="canonical"');
    const html = await response.text();
    assert.match(html, /href="\/jadam\/marketing\/app\.css"/);
    assert.match(html, /src="\/jadam\/marketing\/app\.js"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('nested Marketing redirects stay under the user canonical service path', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: 'https://marketing-ai-pizzamaru.pages.dev/login?next=1' },
  });
  try {
    const route = await resolvePublicWorkspacePath('/pizzamaru/marketing');
    const response = await proxyPublicWorkspace(new Request('https://ekodi.kr/pizzamaru/marketing'), route);
    assert.equal(response.headers.get('location'), 'https://ekodi.kr/pizzamaru/marketing/login?next=1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CGMA Marketing mount preserves its existing /market-ai upstream base without exposing it', async () => {
  const originalFetch = globalThis.fetch;
  let requested = '';
  globalThis.fetch = async request => {
    requested = String(request.url || request);
    return new Response("fetch('/api/status')", { status: 200, headers: { 'content-type': 'application/javascript' } });
  };
  try {
    const route = await resolvePublicWorkspacePath('/cgma/marketing/app.js');
    const response = await proxyPublicWorkspace(new Request('https://ekodi.kr/cgma/marketing/app.js'), route);
    assert.equal(requested, 'https://cheonggye-market.pages.dev/market-ai/app.js');
    assert.equal(await response.text(), "fetch('/cgma/marketing/api/status')");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
