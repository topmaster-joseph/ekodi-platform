import platformRouterEntryWorker from './platform-router-entry-worker.js';

const CANONICAL_MCP_HOSTS = new Set(['ekodi.kr', 'www.ekodi.kr']);
const MCP_EDGE_PATHS = new Set(['/mcp', '/.well-known/oauth-protected-resource']);

function mcpServiceUnavailable() {
  return new Response(JSON.stringify({
    error: 'mcp_service_unavailable',
    code: 'MCP_CONTROL_API_UNAVAILABLE',
  }), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-ekodi-mcp-edge': 'control-api-binding-unavailable',
    },
  });
}

async function routeCanonicalMcp(request, env) {
  if (!env?.CONTROL_API?.fetch) return mcpServiceUnavailable();
  const upstream = await env.CONTROL_API.fetch(request);
  const headers = new Headers(upstream.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-ekodi-mcp-edge', 'control-api-service-binding');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    if (CANONICAL_MCP_HOSTS.has(host) && MCP_EDGE_PATHS.has(url.pathname)) {
      return routeCanonicalMcp(request, env);
    }
    return platformRouterEntryWorker.fetch(request, env, ctx);
  },
};
