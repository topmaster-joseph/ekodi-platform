// Search-engine ownership verification for EKODI customer domains.
//
// Verification codes are PUBLIC values (they are published in page HTML by
// design), so they live in source control and change through the normal PR
// lane. Each code is validated before it is ever written into HTML so a bad
// value cannot inject markup.
//
// Add a code: put the `content` value Google / Naver shows for the
// "HTML tag" method into the matching host entry below.

export const SEARCH_VERIFICATION_CODES = Object.freeze({
  'seonammedi.kr': Object.freeze({
    google: [],
    naver: [],
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
