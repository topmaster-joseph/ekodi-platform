// Safe, allowlisted failure reasons sent from a verified Google OAuth broker
// to the Marketing callback. Never forward raw Google response/error payloads.
const ALLOWED_MARKETING_YOUTUBE_ERRORS = new Set([
  'YOUTUBE_TARGET_ACCOUNT_MISMATCH',
  'YOUTUBE_REFRESH_TOKEN_MISSING',
  'AUTHORIZATION_CODE_MISSING',
]);

export function marketingYouTubeOAuthErrorCode(error) {
  const value = String(error?.code || error?.message || '').trim();
  return ALLOWED_MARKETING_YOUTUBE_ERRORS.has(value)
    ? value
    : 'GOOGLE_OAUTH_EXCHANGE_FAILED';
}
