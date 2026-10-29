// Search-engine ownership verification for EKODI customer domains.
//
// Verification codes are PUBLIC values (they are published in page HTML by
// design), so they live in source control and change through the normal PR
// lane. Each code is validated before it is ever written into HTML so a bad
// value cannot inject markup.
//
// Add a code: put the `content` value Google / Naver shows for the
// "HTML tag" method into the matching host entry below.

// Naver code received from the owner 2026-10-21 without naming the site.
// Placed on both owner sites so verification succeeds for whichever one was
// registered; a tag on a site not registered with this code is inert.
const NAVER_OWNER_CODE_20261021 = '89c7b7e30eb1de66e84a2b7c751e2e6d8cfe7e8f';

export const SEARCH_VERIFICATION_CODES = Object.freeze({
  'ekodi.kr': Object.freeze({
    google: [],
    naver: [NAVER_OWNER_CODE_20261021],
  }),
  'seonammedi.kr': Object.freeze({
    google: [],
    // Owner-issued to this English domain on 2026-10-30, separate from IDN.
    naver: [NAVER_OWNER_CODE_20261021, 'fda2f0e54ea106c29233baaa602aa5a551c79b88'],
  }),
  // Owner-issued 2026-10-30 for the Korean IDN specifically.
  'xn--3e0b8b58jw4co4mnpll3k.kr': Object.freeze({
    google: [],
    naver: ['24ca4ba6e96faad3747dd25f3df3b1748384771a'],
  }),
});

const META_NAMES = Object.freeze({
  google: 'google-site-verification',
  naver: 'naver-site-verification',
});

const CODE_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidVerificationCode(code) {
  return CODE_PATTERN.test(String(code || ''));
}

export function verificationMetaTags(host, registry = SEARCH_VERIFICATION_CODES) {
  const entry = registry[String(host || '').toLowerCase()];
  if (!entry) return '';
  const tags = [];
  for (const [engine, metaName] of Object.entries(META_NAMES)) {
    for (const code of entry[engine] || []) {
      if (!isValidVerificationCode(code)) continue;
      tags.push(`<meta name="${metaName}" content="${code}">`);
    }
  }
  return tags.join('');
}

// Inserts the tags right after the opening <head> tag (only once).
export function injectVerificationMeta(html, host, registry = SEARCH_VERIFICATION_CODES) {
  const tags = verificationMetaTags(host, registry);
  if (!tags) return html;
  const text = String(html || '');
  const match = text.match(/<head\b[^>]*>/i);
  if (!match) return text;
  const at = match.index + match[0].length;
  return text.slice(0, at) + tags + text.slice(at);
}

// Daum Webmaster Tool ownership: a single robots.txt comment line per host.
export const DAUM_WEBMASTER_LINES = Object.freeze({
  'ekodi.kr': '#DaumWebMasterTool:6a54258804aae42599a30f741a754100f26c942229a78e581195a158354f8ca1:sgQJn+c4WOkeYlgoF2KRow==',
});

const DAUM_LINE_PATTERN = /^#DaumWebMasterTool:[a-f0-9]{64}:[A-Za-z0-9+/]{22}==$/;

export function daumWebmasterLine(host, registry = DAUM_WEBMASTER_LINES) {
  const line = registry[String(host || '').toLowerCase()];
  return line && DAUM_LINE_PATTERN.test(line) ? line : '';
}

// Naver Search Advisor "HTML 파일 업로드" ownership file, received from the owner 2026-10-24.
// Public value by design. Served on every host the platform router answers, at the exact root path.
const VERIFICATION_FILE_PATTERN = /^\/naver[0-9a-f]{32}\.html$/;
export const SEARCH_VERIFICATION_FILES = Object.freeze({
  '/naverf72bebc155107dcad735d8178146679f.html': 'naver-site-verification: naverf72bebc155107dcad735d8178146679f.html',
  // 2026-10-24: file Naver issues for https://ekodi.kr (the f72… file belongs to another registered site).
  '/naver55dffd2edf849422807852a996ee52e6.html': 'naver-site-verification: naver55dffd2edf849422807852a996ee52e6.html',
  // 2026-10-28: file Naver issues for https://ekodichurch.kr (served at that domain's root by legacy-redirect.js).
  '/naver85321326d5553a0caa3a944158fc2969.html': 'naver-site-verification: naver85321326d5553a0caa3a944158fc2969.html',
});

export function searchVerificationFileResponse(pathname, { head = false } = {}, registry = SEARCH_VERIFICATION_FILES) {
  const path = String(pathname || '');
  if (!VERIFICATION_FILE_PATTERN.test(path)) return null;
  const body = registry[path];
  if (!body || body !== `naver-site-verification: ${path.slice(1)}`) return null;
  return new Response(head ? null : body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' },
  });
}
