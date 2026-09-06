const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const stagingUrl = String(process.env.STAGING_URL || '').trim();

if (!accountId || !apiToken || !stagingUrl) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and STAGING_URL are required.');
}

const url = new URL(stagingUrl);
if (url.protocol !== 'https:' || !url.hostname.endsWith('.ekodi-development.workers.dev')) {
  throw new Error(`Refusing unexpected staging host: ${url.hostname}`);
}

const apiBase = 'https://api.cloudflare.com/client/v4';

async function cf(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    // Keep the error free of response bodies so credentials or provider internals are not logged.
  }
  if (!response.ok || body.success !== true) {
    const errors = Array.isArray(body.errors)
      ? body.errors.map((error) => `${error.code || 'unknown'}:${error.message || ''}`).join(' | ')
      : 'none';
    throw new Error(`Cloudflare Access API failed status=${response.status} errors=${errors}`);
  }
  return body.result;
}

function hasEveryoneBypass(app) {
  return Array.isArray(app?.policies) && app.policies.some((policy) =>
    policy?.decision === 'bypass'
      && Array.isArray(policy.include)
      && policy.include.some((rule) => rule && Object.prototype.hasOwnProperty.call(rule, 'everyone'))
  );
}

const specs = [
  {
    name: 'EKODI Mall staging health bypass',
    uri: `${url.hostname}/health`,
  },
  {
    name: 'EKODI Mall staging public API bypass',
    uri: `${url.hostname}/api/public/*`,
  },
];

const listed = await cf(`/accounts/${accountId}/access/apps?per_page=100`);
const apps = Array.isArray(listed) ? listed : [];

for (const spec of specs) {
  const existing = apps.find((app) =>
    Array.isArray(app?.destinations)
      && app.destinations.some((destination) => destination?.type === 'public' && destination.uri === spec.uri)
  );

  if (existing) {
    const detail = await cf(`/accounts/${accountId}/access/apps/${existing.id}`);
    if (!hasEveryoneBypass(detail)) {
      throw new Error(`Existing Access app for ${spec.uri} is not the expected Everyone bypass; refusing to modify it.`);
    }
    console.log(`Access bypass already correct: ${spec.uri}`);
    continue;
  }

  await cf(`/accounts/${accountId}/access/apps`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'self_hosted',
      name: spec.name,
      destinations: [{ type: 'public', uri: spec.uri }],
      policies: [{
        name: `${spec.name} policy`,
        decision: 'bypass',
        include: [{ everyone: {} }],
      }],
    }),
  });
  console.log(`Created Access bypass: ${spec.uri}`);
}
