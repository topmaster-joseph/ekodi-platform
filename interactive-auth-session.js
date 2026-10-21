// EKODI-INTERACTIVE-AUTH-001
// Human-in-the-loop external service login on an EKODI-owned, task-scoped
// Chromium window. The person signs in directly on the provider's own page.
// EKODI never renders, receives, stores or relays passwords, OTPs, cookies,
// tokens or storage state. This module is pure (no I/O) so the Control API,
// the admin UI contract tests and the policy validator share one truth.
//
// This capability is deliberately separate from EKODI-BROWSER-WORKER-001.
// The background worker keeps its canonical-origin-only, never-open-login
// contract unchanged.

export const INTERACTIVE_AUTH_POLICY_ID = 'EKODI-INTERACTIVE-AUTH-001';
export const INTERACTIVE_AUTH_CAPABILITY = 'interactiveAuthSession';
export const INTERACTIVE_AUTH_DEFAULT_TTL_MINUTES = 30;
export const INTERACTIVE_AUTH_MAX_TTL_MINUTES = 60;

export const INTERACTIVE_AUTH_COMMANDS = Object.freeze({
  start: 'computer.auth_session.start',
  verify: 'computer.auth_session.verify',
  close: 'computer.auth_session.close',
});

// Feature ids the read-only inventory may report. Seeing a menu label only
// proves visibility; it never proves the feature executes.
export const FACTCHAT_FEATURES = Object.freeze([
  { id: 'productivity', label: '생산성', keywords: ['생산성', 'productivity'] },
  { id: 'meeting-notes', label: '회의록', keywords: ['회의록', '회의 녹음', 'meeting'] },
  { id: 'hwp-editor', label: 'HWP 편집', keywords: ['hwp', 'hwpx', '한글 문서', '한글문서', '한글 편집'] },
  { id: 'presentation', label: '프레젠테이션', keywords: ['프레젠테이션', 'ppt', '슬라이드', 'presentation'] },
  { id: 'super-agent', label: 'Super Agent', keywords: ['super agent', '슈퍼 에이전트', '슈퍼에이전트'] },
  { id: 'deep-research', label: 'Deep Research', keywords: ['deep research', '딥리서치', '딥 리서치'] },
  { id: 'univ-in-data', label: 'Univ-in-Data', keywords: ['univ-in-data', 'univ in data'] },
  { id: 'korea-in-data', label: 'Korea-in-Data', keywords: ['korea-in-data', 'korea in data'] },
  { id: 'law-in-data', label: 'Law-in-Data', keywords: ['law-in-data', 'law in data'] },
  { id: 'usage-credit', label: '크레딧·사용량', keywords: ['크레딧', 'credit', '사용량', '잔여', '한도'] },
]);

export const INTERACTIVE_AUTH_SERVICES = Object.freeze({
  'factchat-mokpo': Object.freeze({
    id: 'factchat-mokpo',
    label: 'FactChat · 국립목포대학교 기관계정',
    entryUrl: 'https://mokpo.factchat.bot/dashboard/chat/40882',
    automationOrigin: 'https://mokpo.factchat.bot',
    authenticatedPathPrefixes: Object.freeze(['/dashboard']),
    officialGuideUrl: 'https://docs.mindlogic.ai/docs/general/baze/getting-started/introduction',
    verificationProbe: 'menu-and-usage-readonly',
    features: FACTCHAT_FEATURES,
  }),
});

export const SESSION_STATES = Object.freeze([
  'awaiting_local_consent', 'declined', 'launching', 'login_required', 'authenticated',
  'verifying', 'verified', 'closing', 'closed', 'expired', 'failed',
]);
const BROWSERS = ['ekodi-chromium', 'chrome', 'msedge'];
const SESSION_ID_RE = /^ias_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const text = (value, max = 120) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const oneOf = (value, values, fallback) => (values.includes(value) ? value : fallback);
const iso = value => {
  const t = new Date(String(value || '')).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
};

export function interactiveAuthService(id) {
  return Object.prototype.hasOwnProperty.call(INTERACTIVE_AUTH_SERVICES, id) ? INTERACTIVE_AUTH_SERVICES[id] : null;
}

export function isInteractiveAuthCommand(type) {
  return Object.values(INTERACTIVE_AUTH_COMMANDS).includes(type);
}

export function validSessionId(value) {
  return SESSION_ID_RE.test(String(value || ''));
}

function newSessionId(randomUUID) {
  const uuid = String((randomUUID || (() => globalThis.crypto.randomUUID()))()).toLowerCase();
  const id = `ias_${uuid}`;
  if (!validSessionId(id)) throw new Error('INTERACTIVE_AUTH_SESSION_ID_INVALID');
  return id;
}

// Server-side payload construction. The admin request may only choose the
// registered service, an optional TTL and (for verify/close) a session id.
// Every security property is fixed here, never taken from the request.
export function sanitizeInteractiveAuthPayload(type, raw = {}, { now = Date.now(), randomUUID } = {}) {
  if (type === INTERACTIVE_AUTH_COMMANDS.start) {
    const service = interactiveAuthService(text(raw.service, 60));
    if (!service) throw new Error('INTERACTIVE_AUTH_SERVICE_INVALID');
    if (raw.userWillSignInPersonally !== true) throw new Error('INTERACTIVE_AUTH_PERSONAL_SIGNIN_REQUIRED');
    const requested = Number(raw.ttlMinutes);
    const ttlMinutes = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 5), INTERACTIVE_AUTH_MAX_TTL_MINUTES)
      : INTERACTIVE_AUTH_DEFAULT_TTL_MINUTES;
    return {
      policyId: INTERACTIVE_AUTH_POLICY_ID,
      sessionId: newSessionId(randomUUID),
      service: service.id,
      entryUrl: service.entryUrl,
      automationOrigin: service.automationOrigin,
      authenticatedPathPrefixes: [...service.authenticatedPathPrefixes],
      ttlMinutes,
      expiresAt: new Date(now + ttlMinutes * 60_000).toISOString(),
      interactiveMode: 'human-in-the-loop-login',
      localConsentRequired: true,
      headed: true,
      dedicatedEphemeralProfile: true,
      activeUserProfileReuse: false,
      passwordManagerEnabled: false,
      credentialRelay: false,
      cookieExport: false,
      clipboardShared: false,
      hostInputInjection: false,
      screenCapture: false,
      forbiddenBrowsers: ['opera'],
      allowedBrowsers: [...BROWSERS],
    };
  }
  if (type === INTERACTIVE_AUTH_COMMANDS.verify) {
    const sessionId = text(raw.sessionId, 60).toLowerCase();
    if (!validSessionId(sessionId)) throw new Error('INTERACTIVE_AUTH_SESSION_ID_INVALID');
    const service = interactiveAuthService(text(raw.service, 60));
    if (!service) throw new Error('INTERACTIVE_AUTH_SERVICE_INVALID');
    if (raw.readOnlyAcknowledged !== true) throw new Error('INTERACTIVE_AUTH_READONLY_ACK_REQUIRED');
    return {
      policyId: INTERACTIVE_AUTH_POLICY_ID,
      sessionId,
      service: service.id,
      automationOrigin: service.automationOrigin,
      probe: service.verificationProbe,
      mutation: false,
      uploads: false,
      creditConsumingActions: false,
      cookieRead: false,
      storageRead: false,
      featureIds: service.features.map(feature => feature.id),
    };
  }
  if (type === INTERACTIVE_AUTH_COMMANDS.close) {
    const sessionId = text(raw.sessionId, 60).toLowerCase();
    if (sessionId && !validSessionId(sessionId)) throw new Error('INTERACTIVE_AUTH_SESSION_ID_INVALID');
    return { policyId: INTERACTIVE_AUTH_POLICY_ID, sessionId: sessionId || 'any', deleteProfile: true };
  }
  throw new Error('INTERACTIVE_AUTH_COMMAND_INVALID');
}

function hostOnly(value) {
  const host = text(value, 253).toLowerCase();
  return HOST_RE.test(host) ? host : '';
}

// Allowlisted projection of the agent-reported session status. Anything not
// listed here (URLs with query strings, titles, page text, cookies) is dropped.
export function projectInteractiveAuthStatus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sessionId = text(raw.sessionId, 60).toLowerCase();
  if (!validSessionId(sessionId)) return null;
  const service = interactiveAuthService(text(raw.service, 60));
  if (!service) return null;
  const observedHosts = Array.isArray(raw.observedHosts)
    ? [...new Set(raw.observedHosts.map(hostOnly).filter(Boolean))].slice(0, 12)
    : [];
  return {
    policyId: INTERACTIVE_AUTH_POLICY_ID,
    sessionId,
    service: service.id,
    state: oneOf(text(raw.state, 40), SESSION_STATES, 'failed'),
    browser: oneOf(text(raw.browser, 30), BROWSERS, ''),
    startedAt: iso(raw.startedAt),
    expiresAt: iso(raw.expiresAt),
    updatedAt: iso(raw.updatedAt),
    currentHost: hostOnly(raw.currentHost),
    pageClass: oneOf(text(raw.pageClass, 20), ['login', 'authenticated', 'other', 'none'], 'none'),
    observedHosts,
    browserProcessAlive: raw.browserProcessAlive === true,
    profileRemoved: raw.profileRemoved === true,
    errorCode: text(raw.errorCode, 60).replace(/[^A-Za-z0-9_:-]/g, ''),
  };
}

function maskSensitive(line) {
  return line
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}\b/g, '[phone]')
    .replace(/\b\d{6}[- ]?\d{7}\b/g, '[id]');
}

// Allowlisted projection of the read-only verification report.
export function projectInteractiveAuthVerification(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sessionId = text(raw.sessionId, 60).toLowerCase();
  const service = interactiveAuthService(text(raw.service, 60));
  if (!validSessionId(sessionId) || !service) return null;
  const known = new Map(service.features.map(feature => [feature.id, feature]));
  const features = (Array.isArray(raw.features) ? raw.features : [])
    .filter(item => known.has(item?.id))
    .slice(0, known.size)
    .map(item => ({
      id: item.id,
      label: known.get(item.id).label,
      menuVisible: item.menuVisible === true,
      // Execution is never claimed by the read-only probe.
      executionVerified: false,
      status: item.menuVisible === true ? 'menu_visible_execution_unverified' : 'menu_not_found',
    }));
  const usageLines = (Array.isArray(raw.usageLines) ? raw.usageLines : [])
    .map(line => maskSensitive(text(line, 140)))
    .filter(line => /(크레딧|credit|사용량|잔여|한도|토큰|token)/i.test(line))
    .slice(0, 8);
  return {
    policyId: INTERACTIVE_AUTH_POLICY_ID,
    sessionId,
    service: service.id,
    checkedAt: iso(raw.checkedAt),
    pageOrigin: raw.pageOrigin === service.automationOrigin ? service.automationOrigin : '',
    authenticated: raw.authenticated === true,
    menuLabelCount: Math.max(0, Math.min(500, Number(raw.menuLabelCount) || 0)),
    features,
    usageLines,
    mutationPerformed: false,
    uploadsPerformed: false,
    cookiesRead: false,
  };
}

// A receipt is trusted only if every privacy invariant is asserted exactly.
export function assessInteractiveAuthReceipt(commandType, result = {}) {
  if (!isInteractiveAuthCommand(commandType)) return { outcome: 'not_applicable' };
  const receipt = result?.interactiveAuth;
  if (!receipt || typeof receipt !== 'object') return { outcome: 'invalid', reason: 'receipt_missing' };
  const invariants = {
    credentialsReturned: false,
    cookiesExported: false,
    storageStateExported: false,
    passwordFieldRead: false,
    screenCaptured: false,
    clipboardShared: false,
    hostInputInjection: false,
    activeUserProfileReused: false,
  };
  for (const [key, expected] of Object.entries(invariants)) {
    if (receipt[key] !== expected) return { outcome: 'invalid', reason: `invariant_${key}` };
  }
  if (commandType === INTERACTIVE_AUTH_COMMANDS.close && receipt.profileRemoved !== true) {
    return { outcome: 'invalid', reason: 'profile_not_removed' };
  }
  const status = projectInteractiveAuthStatus(receipt.status);
  const verification = commandType === INTERACTIVE_AUTH_COMMANDS.verify
    ? projectInteractiveAuthVerification(receipt.verification)
    : null;
  if (commandType === INTERACTIVE_AUTH_COMMANDS.verify && !verification) {
    return { outcome: 'invalid', reason: 'verification_missing' };
  }
  return { outcome: 'valid', status, verification };
}

// Projection used for both command results and heartbeat settings.
export function summarizeInteractiveAuthResult(commandType, result = {}) {
  const assessed = assessInteractiveAuthReceipt(commandType, result);
  if (assessed.outcome !== 'valid') return { interactiveAuth: { valid: false, reason: assessed.reason || 'invalid' } };
  return { interactiveAuth: { valid: true, status: assessed.status, verification: assessed.verification } };
}

export function sanitizeInteractiveAuthSettings(settings) {
  if (!settings || typeof settings !== 'object' || !('interactiveAuthSession' in settings)) return settings;
  const projected = projectInteractiveAuthStatus(settings.interactiveAuthSession);
  const next = { ...settings };
  if (projected) next.interactiveAuthSession = projected; else delete next.interactiveAuthSession;
  return next;
}
