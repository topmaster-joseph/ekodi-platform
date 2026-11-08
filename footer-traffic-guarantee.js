// FOOTER-TRAFFIC-GUARANTEE (owner directive 2026-11-08):
// every public EKODI page — existing and future — must show the shared visit
// summary in its footer. This module is the single runtime enforcement point.
//
// - Idempotent: if the page already loads the shared footer (or the full Shell
//   already injected the user UI), nothing is added.
// - Public-only: admin/auth/api/my/control/workspace surfaces are never touched.
// - Privacy: the scripts it adds are the existing read-only footer and the
//   anonymous site-scoped beacon (no IP, user-agent, account or raw path).
// - CSP-safe: extends script-src/connect-src for https://ekodi.kr and reuses a
//   page nonce when the page's CSP requires one.

export const FOOTER_TRAFFIC_ORIGIN = 'https://ekodi.kr';
export const FOOTER_TRAFFIC_BEACON_SRC = `${FOOTER_TRAFFIC_ORIGIN}/shell/native-visit-beacon.js`;
export const FOOTER_TRAFFIC_FOOTER_SRC = `${FOOTER_TRAFFIC_ORIGIN}/shell/user-ui-footer.js`;
export const FOOTER_TRAFFIC_HEADER = 'x-ekodi-footer-traffic';
export const FOOTER_TRAFFIC_VERSION = 'guarantee-v1';

// Path segments that are never public footer surfaces, anywhere in the path
// (covers /admin, /ekodichurch/admin, /seonammedi/api, …).
const PRIVATE_SEGMENTS = new Set([
  'admin', 'auth', 'api', 'my', 'control', 'work', 'workspace-api', 'oauth', 'oauth-consent',
  'mail', 'messenger', 'mcp', 'webhooks', '_ekodi', '__ekodi', 'login', 'logout', 'callback',
]);
const PRIVATE_FILES = /^(?:auth-center|oauth-consent|google-origin-bridge|admin-shell|control)\.html$/i;
// Script-free public stubs required by security policy.
const SCRIPT_FREE_PATHS = [/^\/seonammedi\/finance(?:\/|$)/i, /^\/finance(?:\/|$)/i, /^\/verify(?:\/|$)/i];

export function isFooterTrafficPublicPath(pathname) {
  const path = String(pathname || '/');
  if (SCRIPT_FREE_PATHS.some(rule => rule.test(path))) return false;
  const segments = path.split('/').filter(Boolean).map(value => value.toLowerCase());
  if (segments.some(segment => PRIVATE_SEGMENTS.has(segment))) return false;
  const last = segments[segments.length - 1] || '';
  if (PRIVATE_FILES.test(last)) return false;
  return true;
}

function sourceIsFooter(src) { return /\/shell\/user-ui-footer\.js(?:[?#]|$)/.test(String(src || '')); }
function sourceIsBeacon(src) { return /\/shell\/native-visit-beacon\.js(?:[?#]|$)/.test(String(src || '')); }

export function htmlHasFooterTraffic(html) {
  const source = String(html || '');
  return /<script\b[^>]*\bsrc="[^"]*\/shell\/user-ui-footer\.js[^"]*"/i.test(source);
}

function directiveList(csp) {
  return String(csp || '').split(';').map(part => part.trim()).filter(Boolean);
}
function nonceFrom(csp) {
  for (const part of directiveList(csp)) {
    const [name, ...values] = part.split(/\s+/);
    if (!['script-src', 'script-src-elem', 'default-src'].includes(name.toLowerCase())) continue;
    for (const value of values) {
      const match = value.match(/^'nonce-([A-Za-z0-9+/=_-]+)'$/);
      if (match) return match[1];
    }
  }
  return '';
}
function allowsOrigin(values) {
  return values.some(value => value === '*' || value === FOOTER_TRAFFIC_ORIGIN || value === 'https:' || value === 'https://ekodi.kr/');
}
export function extendFooterTrafficCsp(csp, {sameOrigin = false} = {}) {
  const parts = directiveList(csp);
  if (!parts.length) return csp;
  const byName = new Map(parts.map(part => [part.split(/\s+/)[0].toLowerCase(), part]));
  const ensure = name => {
    const existing = byName.get(name);
    if (existing) {
      const values = existing.split(/\s+/).slice(1);
      if (values.includes("'none'")) {
        byName.set(name, `${name} ${sameOrigin ? "'self'" : FOOTER_TRAFFIC_ORIGIN}`);
        return;
      }
      if (!allowsOrigin(values) && !(sameOrigin && values.includes("'self'"))) byName.set(name, `${existing} ${FOOTER_TRAFFIC_ORIGIN}`);
      return;
    }
    // Only add a directive when default-src would otherwise block the origin.
    const fallback = byName.get('default-src');
    if (!fallback) return;
    const values = fallback.split(/\s+/).slice(1);
    if (allowsOrigin(values) || (sameOrigin && values.includes("'self'"))) return;
    byName.set(name, `${name} ${values.filter(v => v !== "'none'").join(' ')} ${FOOTER_TRAFFIC_ORIGIN}`.replace(/\s+/g, ' ').trim());
  };
  ensure('script-src');
  if (byName.has('script-src-elem')) ensure('script-src-elem');
  ensure('connect-src');
  ensure('style-src');
  return [...byName.values()].join('; ');
}

export function footerTrafficTags(nonce = '') {
  const attr = nonce ? ` nonce="${nonce.replace(/"/g, '')}"` : '';
  return `<script src="${FOOTER_TRAFFIC_BEACON_SRC}" defer${attr}></script>` +
    `<script src="${FOOTER_TRAFFIC_FOOTER_SRC}" defer${attr}></script>`;
}

// Static/build-time variant used by the dist postbuild and unit tests.
export function injectFooterTrafficIntoHtml(html, {nonce = ''} = {}) {
  let source = String(html || '');
  if (htmlHasFooterTraffic(source)) return source;
  if (!/<html\b[^>]*data-ekodi-(?:shell|user)-surface=/i.test(source)) {
    source = source.replace(/<html\b([^>]*)>/i, (all, attrs) => `<html${attrs} data-ekodi-shell-surface="public">`);
  }
  const hasBeacon = /\/shell\/native-visit-beacon\.js/.test(source);
  const attr = nonce ? ` nonce="${nonce}"` : '';
  const tags = (hasBeacon ? '' : `<script src="${FOOTER_TRAFFIC_BEACON_SRC}" defer${attr}></script>`) +
    `<script src="${FOOTER_TRAFFIC_FOOTER_SRC}" defer${attr}></script>`;
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tags}</body>`);
  return `${source}${tags}`;
}

export function shouldGuaranteeFooterTraffic(response, request) {
  if (!response || !request) return false;
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  if (response.status !== 200) return false;
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return false;
  if (response.headers.has(FOOTER_TRAFFIC_HEADER)) return false;
  // The full Shell user UI already boots the shared footer and records visits.
  if (response.headers.has('x-ekodi-user-ui')) return false;
  const route = String(response.headers.get('x-ekodi-route') || '').toLowerCase();
  const canonical = String(response.headers.get('x-ekodi-canonical-surface') || '').toLowerCase();
  if (route === 'control-surface' || canonical === 'control' || canonical === 'admin') return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return isFooterTrafficPublicPath(url.pathname);
}

export function ensureFooterTraffic(response, request) {
  if (!shouldGuaranteeFooterTraffic(response, request)) return response;
  const headers = new Headers(response.headers);
  headers.set(FOOTER_TRAFFIC_HEADER, FOOTER_TRAFFIC_VERSION);
  if (typeof HTMLRewriter === 'undefined') {
    // Node contract tests and non-Workers runtimes: mark only, never buffer.
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  }
  const sameOrigin = (() => { try { return new URL(request.url).origin === FOOTER_TRAFFIC_ORIGIN; } catch { return false; } })();
  const csp = headers.get('content-security-policy');
  const nonce = nonceFrom(csp);
  if (csp) headers.set('content-security-policy', extendFooterTrafficCsp(csp, {sameOrigin}));
  const state = {footer: false, beacon: false, surface: false, appended: false};
  const tags = () => {
    const attr = nonce ? ` nonce="${nonce}"` : '';
    return (state.beacon ? '' : `<script src="${FOOTER_TRAFFIC_BEACON_SRC}" defer${attr}></script>`) +
      `<script src="${FOOTER_TRAFFIC_FOOTER_SRC}" defer${attr}></script>`;
  };
  return new HTMLRewriter()
    .on('html', {element(element) {
      if (element.getAttribute('data-ekodi-shell-surface') || element.getAttribute('data-ekodi-user-surface')) return;
      element.setAttribute('data-ekodi-shell-surface', 'public');
    }})
    .on('script[src]', {element(element) {
      const src = element.getAttribute('src') || '';
      if (sourceIsFooter(src)) state.footer = true;
      if (sourceIsBeacon(src)) state.beacon = true;
    }})
    .on('body', {element(element) {
      element.onEndTag(end => {
        if (state.footer || state.appended) return;
        state.appended = true;
        end.before(tags(), {html: true});
      });
    }})
    .transform(new Response(response.body, {status: response.status, statusText: response.statusText, headers}));
}

// Wrap a Worker module so every response it returns gets the guarantee,
// while preserving scheduled/queue/other handlers.
export function withFooterTraffic(worker) {
  if (!worker || typeof worker.fetch !== 'function') return worker;
  if (worker.__ekodiFooterTraffic) return worker;
  const wrapped = Object.assign(Object.create(Object.getPrototypeOf(worker)), worker);
  wrapped.fetch = async function fetchWithFooterTraffic(request, env, ctx) {
    const response = await worker.fetch.call(worker, request, env, ctx);
    try { return ensureFooterTraffic(response, request); } catch (error) { console.error('footer traffic guarantee skipped', error); return response; }
  };
  Object.defineProperty(wrapped, '__ekodiFooterTraffic', {value: true});
  return wrapped;
}
