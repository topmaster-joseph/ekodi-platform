// Diagnostic-only scope selection. The full production Admin verification is
// always the default; focused read-only probes cannot certify other menus.
export function resolveAdminE2EMenus(allMenuIds, requestedFocus = '') {
  if (!Array.isArray(allMenuIds) || allMenuIds.length === 0) throw new Error('Admin menu registry is empty');
  const focus = String(requestedFocus ?? '').trim();
  if (!focus || focus === 'all') return [...allMenuIds];
  if (!['social-accounts', 'architecture'].includes(focus)) throw new Error('Unsupported Admin E2E focus: ' + focus);
  if (!allMenuIds.includes(focus)) throw new Error('Admin E2E focus is not in the canonical menu registry');
  return [focus];
}

export function isAdminEntryQuotaCircuit(report) {
  return Number(report?.diagnostics?.adminEntryTransport?.status) === 429
    || /CF-QUOTA-001 circuit open/i.test(String(report?.error || ''));
}
