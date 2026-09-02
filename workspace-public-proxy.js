import { canonicalWorkspacePath, isReservedPublicNamespace, isValidPublicNamespace, normalizePublicNamespace, publicNamespaceForLegacyTenantSlug, workspaceForPublicNamespace } from './workspace-public-namespace.js';

const DYNAMIC_ROUTE_CACHE = new Map();
const ROUTE_CACHE_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_MS = 30 * 1000;

function baseHeaders(headers) {
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
}

function routeParts(pathname) {
  const parts = String(pathname || '/').split('/').filter(Boolean);
  if (!parts.length) return null;
  const publicNamespace = normalizePublicNamespace(parts[0]);
  if (!publicNamespace || parts[0].toLowerCase() !== publicNamespace) return null;
  return { publicNamespace, suffix: `/${parts.slice(1).join('/')}`.replace(/\/$/, '') || '/' };
}

function routeForWorkspace(parts, workspace) {
  return { ...parts, workspace };
}

function safeUpstreamHost(value) {
  const host = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) return '';
  if (host === 'ekodi.kr' || host === 'www.ekodi.kr' || host === 'api.ekodi.kr') return '';
  if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(host)) return '';
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return '';
  return host;
}

export async function resolvePublicWorkspacePath(pathname, fetchImpl = fetch) {
  const parts = routeParts(pathname);
  if (!parts) return null;
  const staticWorkspace = workspaceForPublicNamespace(parts.publicNamespace);
  if (staticWorkspace) return routeForWorkspace(parts, staticWorkspace);
  if (!isValidPublicNamespace(parts.publicNamespace) || isReservedPublicNamespace(parts.publicNamespace)) return null;

  const cached = DYNAMIC_ROUTE_CACHE.get(parts.publicNamespace);
  if (cached && cached.expiresAt > Date.now()) return cached.workspace ? routeForWorkspace(parts, cached.workspace) : null;
  try {
    const endpoint = new URL('https://api.ekodi.kr/api/customer/tenant');
    endpoint.searchParams.set('namespace', parts.publicNamespace);
    const response = await fetchImpl(endpoint.toString(), { headers: { accept: 'application/json' } });
    if (!response.ok) {
      DYNAMIC_ROUTE_CACHE.set(parts.publicNamespace, { workspace: null, expiresAt: Date.now() + NEGATIVE_CACHE_MS });
      return null;
    }
    const payload = await response.json();
    const tenant = payload?.tenant || {};
    const upstreamHost = safeUpstreamHost(tenant.domain);
    if (!upstreamHost || tenant.publicNamespace !== parts.publicNamespace || !tenant.workspaceId) return null;
    const workspace = {
      workspaceId: tenant.workspaceId, workspaceType: tenant.workspaceType || '', workspaceSubtype: tenant.workspaceSubtype || '',
      displayName: tenant.name || '', legacyTenantSlug: tenant.slug || '', upstreamHost,
    };
    DYNAMIC_ROUTE_CACHE.set(parts.publicNamespace, { workspace, expiresAt: Date.now() + ROUTE_CACHE_MS });
    return routeForWorkspace(parts, workspace);
  } catch {
    return null;
  }
}

export async function resolveLegacyWorkspaceRedirect(pathname, fetchImpl = fetch) {
  const match = String(pathname || '').match(/^\/(personal|org|group|project|people|biz)\/([a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)(\/.*)?$/i);
  if (!match) return '';
  const slug = match[2].toLowerCase();
  const suffix = match[3] || '';
  let publicNamespace = publicNamespaceForLegacyTenantSlug(slug);
  if (!publicNamespace) {
    try {
      const endpoint = new URL('https://api.ekodi.kr/api/customer/tenant');
      endpoint.searchParams.set('slug', slug);
      const response = await fetchImpl(endpoint.toString(), { headers: { accept: 'application/json' } });
      if (!response.ok) return '';
      const payload = await response.json();
      publicNamespace = normalizePublicNamespace(payload?.tenant?.publicNamespace || '');
    } catch {
      return '';
    }
  }
  return publicNamespace ? canonicalWorkspacePath(publicNamespace, suffix) : '';
}

function canonicalUrl(publicNamespace, suffix = '/') {
  const path = canonicalWorkspacePath(publicNamespace, suffix === '/' ? '' : suffix);
  return `https://ekodi.kr${path}`;
}

function rewriteText(text, publicNamespace, upstreamHost, contentType) {
  const prefix = `/${publicNamespace}`;
  let next = text;
  if (contentType.includes('text/html')) {
    next = next.replace(/\b(href|src|action|poster)=(['"])\/(?!\/)/gi, `$1=$2${prefix}/`);
    const escaped = upstreamHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = next.replace(new RegExp(`https:\\/\\/${escaped}\\/`, 'gi'), `https://ekodi.kr${prefix}/`);
    next = next.replace(/(['"`])\/api\//g, `$1${prefix}/api/`);
    const canonical = canonicalUrl(publicNamespace);
    if (/<link\s+[^>]*rel=['"]canonical['"][^>]*>/i.test(next)) {
      next = next.replace(/<link\s+[^>]*rel=['"]canonical['"][^>]*>/i, `<link rel="canonical" href="${canonical}">`);
    } else {
      next = next.replace(/<\/head>/i, `<link rel="canonical" href="${canonical}">\n</head>`);
    }
  } else if (contentType.includes('javascript')) {
    next = next.replace(/(['"`])\/api\//g, `$1${prefix}/api/`);
    next = next.replace(/(['"`])\/assets\//g, `$1${prefix}/assets/`);
  } else if (contentType.includes('text/css')) {
    next = next.replace(/url\((['"]?)\/(?!\/)/g, `url($1${prefix}/`);
  }
  return next;
}

function canonicalizeLocation(location, upstreamUrl, publicNamespace) {
  if (!location) return '';
  try {
    const target = new URL(location, upstreamUrl);
    if (target.hostname !== upstreamUrl.hostname) return location;
    return `${canonicalUrl(publicNamespace, target.pathname)}${target.search}${target.hash}`;
  } catch {
    return location;
  }
}

export async function proxyPublicWorkspace(request, route) {
  const { publicNamespace, workspace, suffix } = route;
  const incoming = new URL(request.url);
  const upstreamUrl = new URL(`https://${workspace.upstreamHost}`);
  upstreamUrl.pathname = suffix;
  upstreamUrl.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('x-ekodi-staging-host');
  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers,
    body: ['GET','HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
  const responseHeaders = new Headers(upstream.headers);
  const location = canonicalizeLocation(responseHeaders.get('location'), upstreamUrl, publicNamespace);
  if (location) responseHeaders.set('location', location);
  baseHeaders(responseHeaders);
  responseHeaders.set('X-EKODI-Route', 'public-workspace-namespace');
  responseHeaders.set('X-EKODI-Workspace-ID', workspace.workspaceId);
  responseHeaders.set('X-EKODI-Public-Namespace', publicNamespace);
  responseHeaders.set('Link', `<${canonicalUrl(publicNamespace, suffix)}>; rel="canonical"`);

  const contentType = responseHeaders.get('content-type') || '';
  if (!/(text\/html|javascript|text\/css)/i.test(contentType) || request.method === 'HEAD') {
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  }
  const text = rewriteText(await upstream.text(), publicNamespace, workspace.upstreamHost, contentType);
  responseHeaders.delete('content-length');
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('etag');
  return new Response(text, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}
