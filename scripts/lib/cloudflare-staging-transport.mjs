// Only a transport-level Cloudflare API reset can be retried at staging.
// This classifier does not authorize an additional deployment path.
const QUOTA_OR_AUTH=/\b(?:HTTP\s*)?(?:401|403|429)\b|\b(?:error\s*)?1027\b|\bquota (?:circuit|exhausted)\b|\btoo many requests\b|\brate limit(?:ed|ing)\b|\b(?:unauthorized|forbidden|invalid token|permission denied)\b/i;
const MALFORMED_RESPONSE=/received a malformed response from the API/i;
const RESET_BEFORE_HEADERS=/upstream connect error or disconnect\/reset before headers/i;

export function canRetryCloudflareStagingTransport(output){
  const body=String(output??'');
  return !QUOTA_OR_AUTH.test(body)&&MALFORMED_RESPONSE.test(body)&&RESET_BEFORE_HEADERS.test(body);
}
