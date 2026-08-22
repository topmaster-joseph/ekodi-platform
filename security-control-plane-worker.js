const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=() ',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
});

function securedJson(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

function disabledResponse() {
  return securedJson({
    ok: false,
    service: 'EKODI Security Control Plane',
    code: 'SECURITY_CONTROL_PLANE_DISABLED'
  }, 503, { 'Retry-After': '60' });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (!['GET', 'HEAD'].includes(request.method)) {
      return securedJson({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, HEAD' });
    }

    if (env.SECURITY_CONTROL_PLANE_ENABLED !== 'true') {
      return disabledResponse();
    }

    // Deliberately fail closed until server-side EKODI admin identity and role
    // verification are wired to this isolated runtime. Do not replace this with
    // trust in a client-supplied email/header or browser-side role check.
    if (url.pathname === '/healthz') {
      return securedJson({
        ok: true,
        service: 'EKODI Security Control Plane',
        mode: 'pre-activation',
        privilegedUi: false
      });
    }

    return securedJson({
      ok: false,
      code: 'ADMIN_AUTH_NOT_WIRED',
      message: 'Privileged security control plane access is not activated.'
    }, 403);
  }
};

export { SECURITY_HEADERS };
