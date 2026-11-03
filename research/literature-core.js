/** EKODI Research OS — deterministic, offline-verifiable scholarly record core.
 * No network calls, no personal data, no fabricated bibliographic metadata.
 */
export function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  if (!/^10\.\d{4,9}\/[^\s<>]+$/i.test(s)) return null;
  return s.toLowerCase();
}
export function normalizeOrcid(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim().replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
  if (!/^\d{4}-\d{4}-\d{4}-[\dX]{4}$/.test(id)) return null;
  const digits = id.replace(/-/g, '');
  let total = 0;
  for (const c of digits.slice(0, 15)) total = (total + Number(c)) * 2;
  const check = (12 - (total % 11)) % 11;
  return (check === 10 ? 'X' : String(check)) === digits[15] ? id : null;
}
export function auditLiteratureRecords(records) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  const seen = new Set();
  return records.map((record, index) => {
    const doi = normalizeDoi(record?.doi);
    const issues = [];
    if (!doi) issues.push('doi_missing_or_invalid');
    else if (seen.has(doi)) issues.push('duplicate_doi');
    else seen.add(doi);
    if (!record || typeof record.title !== 'string' || !record.title.trim()) issues.push('title_missing');
    if (!record || !Number.isInteger(record.year) || record.year < 1500 || record.year > 2200) issues.push('year_unverified');
    // An identifier is NOT proof of an existing publication; provider verification is separate.
    return { index, doi, status: issues.length ? 'review_required' : 'pending_external_verification', issues };
  });
}
