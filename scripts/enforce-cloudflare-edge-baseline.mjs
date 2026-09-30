const API = 'https://api.cloudflare.com/client/v4';
const ZONE_NAME = 'ekodi.kr';

export const DESIRED_EDGE_BASELINE = Object.freeze({
  always_use_https: 'on',
  automatic_https_rewrites: 'on',
  min_tls_version: '1.2',
  tls_1_3: 'on',
  http2: 'on',
  brotli: 'on',
  http3: 'off',
});

export const BASELINE_RATIONALE = Object.freeze({
  always_use_https: 'Redirect all plaintext visitor traffic to HTTPS at the edge.',
  automatic_https_rewrites: 'Reduce accidental mixed-content references on public pages.',
  min_tls_version: 'Reject TLS versions older than 1.2.',
  tls_1_3: 'Keep modern TLS available while retaining TLS 1.2 compatibility.',
  http2: 'Keep the stable multiplexed transport required by EKODI web/admin surfaces.',
  brotli: 'Reduce transfer bytes for compatible clients.',
  http3: 'Remain off until the existing EKODI Admin HTTP2 stability exception is explicitly retired.',
});

export function validateDesiredBaseline(settings = DESIRED_EDGE_BASELINE) {
  const errors = [];
  if (settings.always_use_https !== 'on') errors.push('Always Use HTTPS must be on.');
  if (settings.automatic_https_rewrites !== 'on') errors.push('Automatic HTTPS Rewrites must be on.');
  if (settings.min_tls_version !== '1.2') errors.push('Minimum TLS must remain 1.2.');
  if (settings.tls_1_3 !== 'on') errors.push('TLS 1.3 must be on.');
  if (settings.http2 !== 'on') errors.push('HTTP/2 must be on.');
  if (settings.brotli !== 'on') errors.push('Brotli must be on.');
  if (settings.http3 !== 'off') errors.push('HTTP/3 must remain off while the Admin stability exception is active.');
  return errors;
}

async function cloudflare(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const summary = (payload?.errors || [])
      .map(error => `${error.code ?? 'CF'}:${error.message ?? 'request failed'}`)
      .join(', ');
    throw new Error(`Cloudflare ${method} ${path} failed (${response.status})${summary ? `: ${summary}` : ''}`);
  }
  return payload.result;
}

async function resolveZoneId({ token, accountId }) {
  const params = new URLSearchParams({
    name: ZONE_NAME,
    'account.id': accountId,
    status: 'active',
    per_page: '50',
  });
  const zones = await cloudflare(`/zones?${params.toString()}`, { token });
  const exact = Array.isArray(zones)
    ? zones.filter(zone => zone?.name === ZONE_NAME && zone?.account?.id === accountId)
    : [];
  if (exact.length !== 1) {
    throw new Error(`Expected exactly one active ${ZONE_NAME} zone in the production account; found ${exact.length}.`);
  }
  return exact[0].id;
}

async function readSetting({ token, zoneId, id }) {
  const result = await cloudflare(`/zones/${zoneId}/settings/${id}`, { token });
  return {
    id: String(result?.id || id),
    value: result?.value,
    editable: result?.editable !== false,
    modifiedOn: result?.modified_on || null,
  };
}

async function patchSetting({ token, zoneId, id, value }) {
  const result = await cloudflare(`/zones/${zoneId}/settings/${id}`, {
    method: 'PATCH',
    token,
    body: { value },
  });
  return {
    id: String(result?.id || id),
    value: result?.value,
    editable: result?.editable !== false,
    modifiedOn: result?.modified_on || null,
  };
}

function compact(settings) {
  return Object.fromEntries(
    Object.entries(settings).map(([id, state]) => [
      id,
      { value: state.value, editable: state.editable, modifiedOn: state.modifiedOn },
    ]),
  );
}

async function readBaseline({ token, zoneId }) {
  const entries = [];
  for (const id of Object.keys(DESIRED_EDGE_BASELINE)) {
    entries.push([id, await readSetting({ token, zoneId, id })]);
  }
  return Object.fromEntries(entries);
}

async function rollbackChanged({ token, zoneId, changed }) {
  const failures = [];
  for (const item of [...changed].reverse()) {
    try {
      await patchSetting({ token, zoneId, id: item.id, value: item.before });
    } catch (error) {
      failures.push(`${item.id}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Rollback incomplete: ${failures.join('; ')}`);
}

function assertMatches(settings) {
  const mismatches = [];
  for (const [id, desired] of Object.entries(DESIRED_EDGE_BASELINE)) {
    if (settings[id]?.value !== desired) mismatches.push(`${id}=${settings[id]?.value ?? 'missing'} (wanted ${desired})`);
  }
  if (mismatches.length) throw new Error(`Cloudflare edge baseline mismatch: ${mismatches.join(', ')}`);
}

async function main() {
  const validationErrors = validateDesiredBaseline();
  if (validationErrors.length) throw new Error(validationErrors.join(' '));

  if (process.argv.includes('--validate-only')) {
    console.log('Cloudflare Edge Baseline contract: PASS');
    console.log(JSON.stringify(DESIRED_EDGE_BASELINE));
    return;
  }

  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token || !accountId) throw new Error('Production Cloudflare credentials are required.');
  if (process.env.GITHUB_REF && process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Cloudflare edge baseline may mutate only from main.');
  }

  const zoneId = await resolveZoneId({ token, accountId });
  const before = await readBaseline({ token, zoneId });
  console.log('Cloudflare Edge Baseline before:', JSON.stringify(compact(before)));

  if (process.argv.includes('--audit')) {
    assertMatches(before);
    console.log('Cloudflare Edge Baseline audit: PASS');
    return;
  }

  if (process.env.EKODI_ALLOW_CLOUDFLARE_EDGE_MUTATION !== 'MAIN_APPROVED') {
    throw new Error('Production Cloudflare edge mutation gate is closed.');
  }

  const changed = [];
  try {
    for (const [id, desired] of Object.entries(DESIRED_EDGE_BASELINE)) {
      const current = before[id];
      if (!current) throw new Error(`Cloudflare setting missing: ${id}`);
      if (current.value === desired) continue;
      if (!current.editable) throw new Error(`Cloudflare setting is not editable on the current plan: ${id}`);
      const updated = await patchSetting({ token, zoneId, id, value: desired });
      if (updated.value !== desired) throw new Error(`Cloudflare did not apply ${id}=${desired}`);
      changed.push({ id, before: current.value, after: desired });
      console.log(`Cloudflare edge setting updated: ${id} ${current.value} -> ${desired}`);
    }

    const after = await readBaseline({ token, zoneId });
    assertMatches(after);
    console.log('Cloudflare Edge Baseline after:', JSON.stringify(compact(after)));
    console.log('Cloudflare Edge Baseline enforcement: PASS');
  } catch (error) {
    console.error(`Cloudflare Edge Baseline enforcement failed: ${error.message}`);
    if (changed.length) {
      try {
        await rollbackChanged({ token, zoneId, changed });
        console.error('Cloudflare Edge Baseline rollback completed.');
      } catch (rollbackError) {
        console.error(rollbackError.message);
      }
    }
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
