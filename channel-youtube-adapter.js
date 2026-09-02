const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
export const YOUTUBE_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
]);

function clientId(env) { return String(env.CHANNEL_GOOGLE_CLIENT_ID || '').trim(); }
function clientSecret(env) { return String(env.CHANNEL_GOOGLE_CLIENT_SECRET || '').trim(); }
function redirectUri(env) { return String(env.CHANNEL_GOOGLE_REDIRECT_URI || 'https://marketing-publish-api.ekodi.kr/oauth/youtube/callback').trim(); }
export function youtubeOAuthConfigured(env) { return Boolean(clientId(env) && clientSecret(env) && redirectUri(env)); }

export function youtubeAuthorizeUrl(env, state, loginHint = '') {
  if (!youtubeOAuthConfigured(env)) throw Object.assign(new Error('YOUTUBE_OAUTH_NOT_CONFIGURED'), { code:'YOUTUBE_OAUTH_NOT_CONFIGURED' });
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', clientId(env));
  url.searchParams.set('redirect_uri', redirectUri(env));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', YOUTUBE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent select_account');
  url.searchParams.set('state', String(state));
  if (loginHint) url.searchParams.set('login_hint', String(loginHint));
  return url.href;
}
async function tokenRequest(fields) {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key,value]) => body.set(key, String(value)));
  const response = await fetch(TOKEN_URL, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw Object.assign(new Error(data.error_description || data.error || `YOUTUBE_TOKEN_${response.status}`), { code:'YOUTUBE_TOKEN_ERROR', status:response.status });
  return data;
}

export function exchangeYoutubeCode(env, code) {
  return tokenRequest({ code, client_id:clientId(env), client_secret:clientSecret(env), redirect_uri:redirectUri(env), grant_type:'authorization_code' });
}

export function refreshYoutubeAccessToken(env, refreshToken) {
  return tokenRequest({ refresh_token:refreshToken, client_id:clientId(env), client_secret:clientSecret(env), grant_type:'refresh_token' });
}

export async function listYoutubeChannels(accessToken) {
  const response = await fetch(`${API}/channels?part=id,snippet&mine=true&maxResults=50`, { headers:{authorization:`Bearer ${accessToken}`} });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `YOUTUBE_CHANNELS_${response.status}`), { code:'YOUTUBE_CHANNELS_ERROR', status:response.status });
  return (data.items || []).map(item => ({ id:String(item.id || ''), title:String(item.snippet?.title || item.id || ''), thumbnail:String(item.snippet?.thumbnails?.default?.url || '') })).filter(item => item.id);
}
function cleanText(value, max) { return String(value || '').trim().slice(0, max); }
function safeHttps(value) { try { const u = new URL(String(value || '')); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }

export async function uploadYoutubeVideo({ env, refreshToken, assetUrl, title, description, publishAt = '', privacyStatus = 'private', categoryId = '22' }) {
  const sourceUrl = safeHttps(assetUrl);
  if (!sourceUrl) throw Object.assign(new Error('YOUTUBE_ASSET_HTTPS_REQUIRED'), { code:'YOUTUBE_ASSET_HTTPS_REQUIRED' });
  const refreshed = await refreshYoutubeAccessToken(env, refreshToken);
  const accessToken = String(refreshed.access_token || '');
  if (!accessToken) throw Object.assign(new Error('YOUTUBE_ACCESS_TOKEN_MISSING'), { code:'YOUTUBE_ACCESS_TOKEN_MISSING' });
  const source = await fetch(sourceUrl, { redirect:'follow' });
  if (!source.ok || !source.body) throw Object.assign(new Error(`YOUTUBE_ASSET_FETCH_${source.status}`), { code:'YOUTUBE_ASSET_FETCH_FAILED' });
  const contentType = source.headers.get('content-type') || 'video/mp4';
  const contentLength = source.headers.get('content-length') || '';
  const scheduled = publishAt && Date.parse(publishAt) > Date.now();
  const allowedPrivacy = ['private','unlisted','public'].includes(privacyStatus) ? privacyStatus : 'private';
  const metadata = { snippet:{ title:cleanText(title,100) || 'EKODI Shorts', description:cleanText(description,5000), categoryId:String(categoryId || '22') }, status:{ privacyStatus:scheduled ? 'private' : allowedPrivacy, selfDeclaredMadeForKids:false } };
  if (scheduled) metadata.status.publishAt = new Date(publishAt).toISOString();
  const init = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, { method:'POST', headers:{ authorization:`Bearer ${accessToken}`, 'content-type':'application/json; charset=UTF-8', 'x-upload-content-type':contentType, ...(contentLength ? {'x-upload-content-length':contentLength} : {}) }, body:JSON.stringify(metadata) });
  if (!init.ok) throw Object.assign(new Error(`YOUTUBE_UPLOAD_INIT_${init.status}`), { code:'YOUTUBE_UPLOAD_INIT_FAILED' });
  const location = init.headers.get('location');
  if (!location) throw Object.assign(new Error('YOUTUBE_UPLOAD_LOCATION_MISSING'), { code:'YOUTUBE_UPLOAD_LOCATION_MISSING' });
  const uploaded = await fetch(location, { method:'PUT', headers:{'content-type':contentType, ...(contentLength ? {'content-length':contentLength} : {})}, body:source.body });
  const result = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || !result.id) throw Object.assign(new Error(result?.error?.message || `YOUTUBE_UPLOAD_${uploaded.status}`), { code:'YOUTUBE_UPLOAD_FAILED', status:uploaded.status });
  return { id:String(result.id), url:`https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}`, response:{ id:String(result.id), privacyStatus:String(result.status?.privacyStatus || metadata.status.privacyStatus), publishAt:metadata.status.publishAt || '' } };
}