export const TRAFFIC_CLASSIFIER_VERSION = '1.0.0';

const SEARCH_CRAWLER_MARKERS = Object.freeze([
  'googlebot', 'google-inspectiontool', 'bingbot', 'bingpreview', 'duckduckbot',
  'applebot', 'baiduspider', 'yandexbot', 'naverbot', 'yeti/', 'daum',
  'oai-searchbot', 'gptbot', 'chatgpt-user', 'claudebot', 'claude-searchbot',
  'perplexitybot', 'bytespider', 'amazonbot', 'ccbot', 'facebookexternalhit',
  'kakaotalk-scrap', 'slackbot', 'linkedinbot', 'twitterbot'
]);

const AUTOMATION_MARKERS = Object.freeze([
  'curl/', 'wget/', 'python-requests', 'python/', 'go-http-client', 'axios/',
  'libwww-perl', 'okhttp', 'java/', 'headlesschrome', 'phantomjs', 'selenium',
  'puppeteer', 'playwright', 'zgrab', 'masscan', 'nmap', 'httpx', 'sqlmap',
  'nikto', 'censys', 'securityresearch', 'developers.cloudflare.com/security-center',
  'uptimerobot', 'statuscake', 'checkly', 'synthetic-monitor'
]);

const LEGACY_SITE_ALIASES = Object.freeze({
  'ekodichurch.kr': 'church',
  'www.ekodichurch.kr': 'church',
  'ekodibiz.kr': 'biz',
  'www.ekodibiz.kr': 'biz',
  'cgma.or.kr': 'cgma',
  'www.cgma.or.kr': 'cgma'
});
export function normalizeTrafficHost(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '').slice(0, 253);
}

export function trafficSiteIdForHost(value) {
  const host = normalizeTrafficHost(value);
  if (!host) return '';
  if (LEGACY_SITE_ALIASES[host]) return LEGACY_SITE_ALIASES[host];
  if (host === 'ekodi.kr' || host === 'www.ekodi.kr') return 'root';
  if (host.endsWith('.ekodi.kr')) {
    const label = host.slice(0, -'.ekodi.kr'.length).split('.')[0];
    return /^[a-z0-9-]{1,64}$/.test(label) ? label : 'ekodi';
  }
  return host.replace(/[^a-z0-9.-]/g, '').slice(0, 80);
}

export function classifyTrafficUserAgent(value) {
  const raw = String(value || '').trim();
  const ua = raw.toLowerCase();
  if (/^ekodi-[a-z0-9-]+\//i.test(raw)) {
    return { category:'ekodi_internal', confidence:1, reason:'ekodi-user-agent' };
  }
  if (SEARCH_CRAWLER_MARKERS.some(marker => ua.includes(marker))) {
    return { category:'search_bot', confidence:0.99, reason:'known-crawler' };
  }
  if (!ua) return { category:'other_bot', confidence:0.94, reason:'empty-user-agent' };
  if (AUTOMATION_MARKERS.some(marker => ua.includes(marker))) {
    return { category:'other_bot', confidence:0.96, reason:'automation-user-agent' };
  }
  if (/\b(bot|crawler|spider|scanner|scraper)\b/i.test(raw)) {
    return { category:'other_bot', confidence:0.88, reason:'generic-bot-marker' };
  }
  return { category:'unclassified', confidence:0.35, reason:'browser-or-unknown' };
}
export function isAllowedTelemetryOrigin(origin, configuredOrigins = '') {
  let url;
  try { url = new URL(String(origin || '')); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = normalizeTrafficHost(url.hostname);
  if (host === 'ekodi.kr' || host.endsWith('.ekodi.kr') || LEGACY_SITE_ALIASES[host]) return true;
  const configured = new Set(String(configuredOrigins || '').split(',').map(item => item.trim()).filter(Boolean));
  return configured.has(url.origin);
}

export function emptyTrafficBuckets() {
  return {
    requestTotal:0,
    searchBotRequests:0,
    ekodiInternalRequests:0,
    otherBotRequests:0,
    unclassifiedRequests:0
  };
}

export function addClassifiedRequests(bucket, count, classification) {
  const value = Math.max(0, Number(count) || 0);
  bucket.requestTotal += value;
  if (classification.category === 'search_bot') bucket.searchBotRequests += value;
  else if (classification.category === 'ekodi_internal') bucket.ekodiInternalRequests += value;
  else if (classification.category === 'other_bot') bucket.otherBotRequests += value;
  else bucket.unclassifiedRequests += value;
  return bucket;
}

export function classifiedCoveragePercent(bucket) {
  const total = Math.max(0, Number(bucket?.requestTotal) || 0);
  if (!total) return 0;
  const classified = Math.max(0, Number(bucket.searchBotRequests) || 0)
    + Math.max(0, Number(bucket.ekodiInternalRequests) || 0)
    + Math.max(0, Number(bucket.otherBotRequests) || 0);
  return Math.round((classified / total) * 1000) / 10;
}