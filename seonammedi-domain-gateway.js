const ORIGIN = 'https://ekodi.kr';
const SITE_PREFIX = '/seonammedi';
const API_PREFIX = '/api/seonammedi';
const DOMAIN_HOSTS = new Set(['seonammedi.kr', 'xn--3e0b8b58jw4co4mnpll3k.kr']);

function upstreamPath(pathname) {
  const path = pathname || '/';
  if (path === SITE_PREFIX || path.startsWith(SITE_PREFIX + '/')) return path;
  if (path === API_PREFIX || path.startsWith(API_PREFIX + '/')) return path;
  if (path === '/') return SITE_PREFIX + '/';
  return SITE_PREFIX + (path.startsWith('/') ? path : '/' + path);
}

function upstreamRequest(request, incoming) {
  const target = new URL(ORIGIN);
  target.pathname = upstreamPath(incoming.pathname);
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.set('x-ekodi-customer-domain', incoming.hostname);
  return new Request(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
}
function customerLocation(value, incoming) {
  if (!value) return value;
  try {
    const target = new URL(value, ORIGIN);
    if (target.hostname !== 'ekodi.kr') return value;
    if (target.pathname === SITE_PREFIX || target.pathname.startsWith(SITE_PREFIX + '/')) {
      target.hostname = incoming.hostname;
      target.pathname = target.pathname.slice(SITE_PREFIX.length) || '/';
      return target.toString();
    }
    if (target.pathname === API_PREFIX || target.pathname.startsWith(API_PREFIX + '/')) {
      target.hostname = incoming.hostname;
      return target.toString();
    }
  } catch {}
  return value;
}

function rewriteText(text, incoming, contentType) {
  let output = String(text || '');
  const customerOrigin = 'https://' + incoming.hostname;
  output = output.replaceAll('https://ekodi.kr/seonammedi/', customerOrigin + '/');
  output = output.replaceAll('https://ekodi.kr/seonammedi', customerOrigin);
  if (contentType.includes('text/html')) {
    output = output.replaceAll('href="/seonammedi/', 'href="/');
    output = output.replaceAll('src="/seonammedi/', 'src="/');
  }
  return output;
}
export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (!DOMAIN_HOSTS.has(incoming.hostname.toLowerCase())) {
      return new Response('Not found', { status: 404 });
    }

    const upstream = await fetch(upstreamRequest(request, incoming));
    const headers = new Headers(upstream.headers);
    const location = customerLocation(headers.get('location'), incoming);
    if (location) headers.set('location', location);
    headers.set('x-ekodi-domain-mode', 'customer-domain-preserved');
    headers.set('x-ekodi-upstream-path', upstreamPath(incoming.pathname));

    const contentType = String(headers.get('content-type') || '').toLowerCase();
    const rewritable = contentType.includes('text/html') ||
      contentType.includes('javascript') ||
      contentType.includes('application/json') ||
      contentType.includes('text/plain');

    if (!rewritable || request.method === 'HEAD') {
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    }
    const body = rewriteText(await upstream.text(), incoming, contentType);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
