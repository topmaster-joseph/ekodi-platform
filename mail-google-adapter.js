const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const MAIL_GOOGLE_REDIRECT_URI = 'https://api.ekodi.kr/api/mail/control/oauth/google/callback';
export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const BASE_SCOPES = ['openid', 'email', 'profile'];

export function googleMailClientId(env) {
  return String(env.MAIL_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim();
}
function googleMailClientSecret(env) { return String(env.MAIL_GOOGLE_CLIENT_SECRET || '').trim(); }
export function googleMailConfigured(env) { return Boolean(googleMailClientId(env) && googleMailClientSecret(env)); }
export function scopesForCapability(capability = 'read') {
  const cap = String(capability || 'read').toLowerCase();
  const scopes = [...BASE_SCOPES];
  if (cap === 'read' || cap === 'read_send') scopes.push(GMAIL_READ_SCOPE);
  if (cap === 'send' || cap === 'read_send') scopes.push(GMAIL_SEND_SCOPE);
  return scopes;
}
export function googleMailAuthorizeUrl(env, { state, loginHint = '', capability = 'read' }) {
  const params = new URLSearchParams({
    client_id: googleMailClientId(env), redirect_uri: MAIL_GOOGLE_REDIRECT_URI,
    response_type: 'code', access_type: 'offline', prompt: 'consent',
    include_granted_scopes: 'true', scope: scopesForCapability(capability).join(' '), state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${AUTH_URL}?${params}`;
}async function tokenRequest(env, body) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || `GOOGLE_TOKEN_${response.status}`);
    error.code = 'GOOGLE_TOKEN_EXCHANGE_FAILED'; error.status = response.status; throw error;
  }
  return data;
}
export function exchangeGoogleMailCode(env, code) {
  return tokenRequest(env, {
    client_id: googleMailClientId(env), client_secret: googleMailClientSecret(env),
    code: String(code || ''), grant_type: 'authorization_code', redirect_uri: MAIL_GOOGLE_REDIRECT_URI,
  });
}
export function refreshGoogleMailToken(env, refreshToken) {
  return tokenRequest(env, {
    client_id: googleMailClientId(env), client_secret: googleMailClientSecret(env),
    refresh_token: String(refreshToken || ''), grant_type: 'refresh_token',
  });
}
async function gmailFetch(accessToken, path, init = {}) {
  const headers = new Headers(init.headers || {}); headers.set('authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${GMAIL_API}${path}`, { ...init, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data?.error?.message || `GMAIL_${response.status}`); error.status = response.status; throw error; }
  return data;
}
export function googleMailProfile(accessToken) { return gmailFetch(accessToken, '/profile'); }function decodeBase64Url(value = '') {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  try { return decodeURIComponent(Array.from(atob(padded), c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')); }
  catch { return ''; }
}
function headerValue(message, name) {
  const headers = message?.payload?.headers || [];
  return String(headers.find(h => String(h.name).toLowerCase() === name.toLowerCase())?.value || '');
}
function summarize(message) {
  return {
    id: message.id, threadId: message.threadId, from: headerValue(message, 'From'),
    subject: headerValue(message, 'Subject') || '(제목 없음)', date: headerValue(message, 'Date'),
    snippet: String(message.snippet || ''), unread: Array.isArray(message.labelIds) && message.labelIds.includes('UNREAD'),
  };
}
function flattenParts(part, out = []) { if (!part) return out; out.push(part); for (const child of part.parts || []) flattenParts(child, out); return out; }
function messageBody(message) {
  const parts = flattenParts(message?.payload);
  const plain = parts.find(p => p.mimeType === 'text/plain' && p.body?.data);
  if (plain) return decodeBase64Url(plain.body.data).slice(0, 200000);
  const html = parts.find(p => p.mimeType === 'text/html' && p.body?.data);
  if (html) return decodeBase64Url(html.body.data).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s{3,}/g, '\n\n').trim().slice(0, 200000);
  return decodeBase64Url(message?.payload?.body?.data || '').slice(0, 200000);
}function attachments(message) {
  return flattenParts(message?.payload).filter(p => p.filename && p.body?.attachmentId).map(p => ({
    filename: p.filename, mimeType: p.mimeType || 'application/octet-stream', size: Number(p.body?.size || 0), attachmentId: p.body.attachmentId,
  }));
}
export async function listGoogleMailMessages(accessToken, { q = '', pageToken = '', maxResults = 30 } = {}) {
  const params = new URLSearchParams({ maxResults: String(Math.max(1, Math.min(50, Number(maxResults) || 30))), labelIds: 'INBOX' });
  if (q) params.set('q', String(q).slice(0, 200)); if (pageToken) params.set('pageToken', String(pageToken).slice(0, 512));
  const list = await gmailFetch(accessToken, `/messages?${params}`);
  const details = await Promise.all((list.messages || []).map(item => gmailFetch(accessToken, `/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`).then(summarize)));
  return { messages: details, nextPageToken: list.nextPageToken || null, resultSizeEstimate: Number(list.resultSizeEstimate || 0) };
}
export async function getGoogleMailMessage(accessToken, messageId) {
  const message = await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}?format=full`);
  return { ...summarize(message), to: headerValue(message, 'To'), cc: headerValue(message, 'Cc'), body: messageBody(message), attachments: attachments(message) };
}
function encodeRaw(value) {
  const bytes = new TextEncoder().encode(value); let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function sanitizeHeader(value) { return String(value || '').replace(/[\r\n]+/g, ' ').trim(); }export async function sendGoogleMailMessage(accessToken, { to, cc = '', bcc = '', subject = '', body = '' }) {
  const lines = [
    `To: ${sanitizeHeader(to)}`,
    ...(cc ? [`Cc: ${sanitizeHeader(cc)}`] : []),
    ...(bcc ? [`Bcc: ${sanitizeHeader(bcc)}`] : []),
    `Subject: ${sanitizeHeader(subject)}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', String(body || ''),
  ];
  return gmailFetch(accessToken, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: encodeRaw(lines.join('\r\n')) }) });
}
export function scopeSet(value) { return new Set(String(value || '').split(/\s+/).filter(Boolean)); }
export function hasGoogleReadScope(value) { return scopeSet(value).has(GMAIL_READ_SCOPE); }
export function hasGoogleSendScope(value) { return scopeSet(value).has(GMAIL_SEND_SCOPE); }