// Diagnostic-only scope selection. The full production Admin verification is
// always the default; a focused social read-only probe cannot certify other menus.
export function resolveAdminE2EMenus(allMenuIds, requestedFocus = '') {
  if (!Array.isArray(allMenuIds) || allMenuIds.length === 0) throw new Error('Admin menu registry is empty');
  const focus = String(requestedFocus ?? '').trim();
  if (!focus || focus === 'all') return [...allMenuIds];
  if (focus !== 'social-accounts') throw new Error('Unsupported Admin E2E focus: ' + focus);
  if (!allMenuIds.includes(focus)) throw new Error('Admin E2E focus is not in the canonical menu registry');
  return [focus];
}

export function isAdminEntryQuotaCircuit(report) {
  return Number(report?.diagnostics?.adminEntryTransport?.status) === 429
    || /CF-QUOTA-001 circuit open/i.test(String(report?.error || ''));
}
