// Safe, allowlisted failure reasons sent from a verified Google OAuth broker
// to the Marketing callback. Never forward raw Google response/error payloads.
// Google token-endpoint `error` values are a fixed public enum (RFC 6749 §5.2),
// so mapping them to our own codes is safe and lets the admin see the real cause.
const ALLOWED_MARKETING_YOUTUBE_ERRORS = new Set([
  'YOUTUBE_TARGET_ACCOUNT_MISMATCH',
  'YOUTUBE_REFRESH_TOKEN_MISSING',
  'AUTHORIZATION_CODE_MISSING',
  'GOOGLE_OAUTH_ACCESS_DENIED',
  'GOOGLE_OAUTH_TICKET_STORE_FAILED',
]);

const GOOGLE_TOKEN_ERROR_CODES = new Map([
  ['invalid_client', 'GOOGLE_OAUTH_INVALID_CLIENT'],
  ['unauthorized_client', 'GOOGLE_OAUTH_UNAUTHORIZED_CLIENT'],
  ['redirect_uri_mismatch', 'GOOGLE_OAUTH_REDIRECT_MISMATCH'],
  ['invalid_grant', 'GOOGLE_OAUTH_CODE_INVALID'],
  ['deleted_client', 'GOOGLE_OAUTH_CLIENT_DELETED'],
]);

export function marketingYouTubeOAuthErrorCode(error) {
  const value = String(error?.code || error?.message || '').trim();
  if (ALLOWED_MARKETING_YOUTUBE_ERRORS.has(value)) return value;
  const provider = String(error?.providerCode || error?.googleError || '').trim().toLowerCase();
  return GOOGLE_TOKEN_ERROR_CODES.get(provider) || 'GOOGLE_OAUTH_EXCHANGE_FAILED';
}
