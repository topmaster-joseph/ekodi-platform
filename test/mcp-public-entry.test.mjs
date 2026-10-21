import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../platform-mcp-entry-worker.js';

function controlApiStub() {
  const calls = [];
  return {
    calls,
    binding: {
      async fetch(request) {
        calls.push({ url: request.url, method: request.method });
        const path = new URL(request.url).pathname;
        if (path === '/.well-known/oauth-protected-resource') {
          return new Response(JSON.stringify({ resource: 'https://ekodi.kr/mcp' }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        }
        return new Response(JSON.stringify({ error: 'streaming_get_not_supported' }), {
          status: 405,
          headers: { allow: 'POST', 'content-type': 'application/json; charset=utf-8' },
        });
      },
    },
  };
}

test('canonical ekodi.kr/mcp is routed through CONTROL_API service binding', async () => {
  const stub = controlApiStub();
  const response = await worker.fetch(new Request('https://ekodi.kr/mcp'), { CONTROL_API: stub.binding }, {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
  assert.equal(response.headers.get('x-ekodi-mcp-edge'), 'control-api-service-binding');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(stub.calls, [{ url: 'https://ekodi.kr/mcp', method: 'GET' }]);
});

test('OAuth protected-resource metadata uses the same canonical MCP edge', async () => {
  const stub = controlApiStub();
  const response = await worker.fetch(
    new Request('https://ekodi.kr/.well-known/oauth-protected-resource'),
    { CONTROL_API: stub.binding },
    {},
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-ekodi-mcp-edge'), 'control-api-service-binding');
  assert.deepEqual(await response.json(), { resource: 'https://ekodi.kr/mcp' });
});

test('canonical MCP edge fails closed when CONTROL_API binding is unavailable', async () => {
  const response = await worker.fetch(new Request('https://ekodi.kr/mcp'), {}, {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-ekodi-mcp-edge'), 'control-api-binding-unavailable');
  assert.deepEqual(await response.json(), {
    error: 'mcp_service_unavailable',
    code: 'MCP_CONTROL_API_UNAVAILABLE',
  });
});
