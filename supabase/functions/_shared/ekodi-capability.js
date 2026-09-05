const cleanCapability = (value, max = 180) => String(value ?? '').trim().slice(0, max).toLowerCase();

export function capabilityMatches(grant = '', requested = '') {
  const allowed = cleanCapability(grant);
  const need = cleanCapability(requested);
  if (!allowed || !need) return false;
  if (allowed === '*' || allowed === need) return true;
  if (allowed.endsWith(':*')) return need.startsWith(allowed.slice(0, -1));
  return false;
}

export function hasEkodiCapability(grants = [], requested = '', denied = []) {
  const need = cleanCapability(requested);
  if (!need) return false;
  if ((denied ?? []).some(grant => capabilityMatches(grant, need))) return false;
  return (grants ?? []).some(grant => capabilityMatches(grant, need));
}
