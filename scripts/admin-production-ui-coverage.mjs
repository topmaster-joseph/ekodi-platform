// Production Admin verification must account for every registered menu, the
// real Control workbench, and explicit read-only interaction probes. A numerical
// total alone can hide missing, duplicated or unexpectedly skipped assertions.
export function auditAdminProductionUiCoverage(menuIds, results) {
  if (!Array.isArray(menuIds) || !Array.isArray(results)) {
    throw new TypeError('Admin coverage requires menu IDs and verification results');
  }
  const menuNames = menuIds.map(value => String(value || '').trim());
  const required = ['command-home', ...menuNames];
  if (menuNames.includes('search-visibility')) {
    required.push('search-visibility-interactions');
    required.push('search-visibility-google-readonly');
  }
  const issues = [];
  if (menuNames.some(value => !value)) issues.push('empty registered menu ID');
  if (new Set(menuNames).size !== menuNames.length) issues.push('duplicate registered menu ID');
  const expected = new Set(required);
  const observed = new Map();
  for (const result of results) {
    const id = String(result?.id || '').trim();
    if (!id) { issues.push('empty verification result ID'); continue; }
    const row = observed.get(id) || {count: 0, passed: 0};
    row.count += 1;
    if (result?.ok === true) row.passed += 1;
    observed.set(id, row);
  }
  for (const id of expected) {
    const row = observed.get(id);
    if (!row) issues.push('missing: ' + id);
    else {
      if (row.count !== 1) issues.push('duplicate: ' + id + ' (' + row.count + ')');
      if (row.passed !== 1) issues.push('unverified: ' + id);
    }
  }
  for (const [id, row] of observed) {
    if (!expected.has(id)) issues.push('unexpected: ' + id + ' (' + row.count + ')');
  }
  return {
    ok: issues.length === 0,
    actualCount: results.filter(result => result?.ok === true).length,
    expectedCount: expected.size,
    issues,
  };
}
