// Pure, privacy-safe Cloudflare aggregate collection diagnostics.
// Never retain raw GraphQL error details, API tokens, requests or user agents.
export function trafficAnalyticsFailureCategory(error) {
  const status = Number(error?.status || 0);
  const description = String(error?.message || error || '').toLowerCase();
  if (status === 429 || status === 1027 || /rate.limit|too many requests|quota.exceed|daily.limit|exhausted/.test(description)) return 'rate_limited';
  if (status === 401 || status === 403 || /permission|not.authorized|not.allowed|access.denied|zone.analytics.read|unauthorized|forbidden/.test(description)) return 'permission_denied';
  if (/cannot.query.field|unknown.argument|does.not.exist|unknown.field|unsupported|not.available|field.*not.found/.test(description)) return 'unsupported_metric';
  if (/viewer.zones.empty|missing.analytics.rows|no.zone.analytics|zone.not.found/.test(description)) return 'analytics_unavailable';
  if (status >= 500) return 'upstream_error';
  return 'query_error';
}
export function canKeepTrafficHostTotalsWithMissingUserAgent(error) {
  return !['rate_limited','upstream_error'].includes(trafficAnalyticsFailureCategory(error));
}
export function trafficZoneCollectionStatus(collected, requested, degraded = 0) {
  return collected > 0 && collected === requested && degraded === 0 ? 'ok' : 'partial';
}
