// Read-only Wrangler declaration audit; never provisions or changes a resource.
export function declaredBindings(toml, section) {
  const bindings = [];
  let current = null;
  for (const raw of String(toml).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const start = line.match(/^\[\[([\w-]+)\]\]$/);
    if (start) {
      current = start[1] === section ? {} : null;
      if (current) bindings.push(current);
      continue;
    }
    if (line.startsWith('[')) { current = null; continue; }
    const field = line.match(/^([\w-]+)\s*=\s*"([^"]*)"/);
    if (current && field) current[field[1]] = field[2];
  }
  return bindings;
}

export function declaredVar(toml, name) {
  let inVars = false;
  for (const raw of String(toml).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '[vars]') { inVars = true; continue; }
    if (line.startsWith('[')) { inVars = false; continue; }
    const field = line.match(/^([\w-]+)\s*=\s*"([^"]*)"/);
    if (inVars && field && field[1] === name) return field[2];
  }
  return undefined;
}

const unresolved = value => !value || /REPLACE_WITH|TODO|CHANGEME|PLACEHOLDER/i.test(value);

export function auditDataStoreTopology(topology, contents) {
  const errors = [], warnings = [], inventory = [];
  if (topology.schemaVersion !== 1 || topology.policyId !== 'EKODI-DATA-STORE-TOPOLOGY-001') {
    errors.push('Unknown topology schema or policy');
  }
  const guards = topology.releaseSafeguards ?? {};
  if (!guards.noAutomaticCutover || !guards.backupAndRestoreDrillBeforeMigration ||
      !guards.neverCopyPrivateDataWithoutApprovedPlan) errors.push('Migration guards weakened');
  const ids = new Set();
  for (const store of topology.stores ?? []) {
    if (!store.id || ids.has(store.id)) { errors.push('Duplicate or empty store ID'); continue; }
    ids.add(store.id);
    const source = contents[store.source];
    if (typeof source !== 'string') { errors.push(store.id + ': source missing'); continue; }
    const matches = store.section === 'vars'
      ? [{ value: declaredVar(source, store.binding) }]
      : declaredBindings(source, store.section)
        .filter(b => b.binding === store.binding)
        .map(b => ({ value: store.section === 'd1_databases' ? b.database_id : b.bucket_name,
          name: store.section === 'd1_databases' ? b.database_name : b.bucket_name }));
    if (matches.length !== 1) { errors.push(store.id + ': expected one binding'); continue; }
    const match = matches[0], missing = unresolved(match.value);
    if (store.expectedName && store.expectedName !== match.name) errors.push(store.id + ': resource name mismatch');
    if (store.expectedContains && !String(match.value ?? '').includes(store.expectedContains)) errors.push(store.id + ': endpoint mismatch');
    if (store.state === 'configured' && missing) errors.push(store.id + ': configured but unresolved binding');
    if (store.state === 'provisioning-required' && !missing) warnings.push(store.id + ': verify live resource before promotion');
    if (missing) warnings.push(store.id + ': not provisioned in manifest');
    inventory.push({ id: store.id, engine: store.engine, ownerBoundary: store.ownerBoundary,
      isolation: store.isolation, state: missing ? 'unresolved-binding' : 'declared', liveVerified: false });
  }
  if (!ids.size) errors.push('No registered stores');
  return { ok: !errors.length, errors, warnings, inventory };
}
