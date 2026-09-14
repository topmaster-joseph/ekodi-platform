const API = 'https://api.cloudflare.com/client/v4';
const ZONE_NAME = 'ekodi.kr';

export const DESIRED_DISCOVERY_BOT_POLICY = Object.freeze({
  ai_bots_protection: 'block',
  ai_search: 'disabled',
  ai_training: 'block',
  ai_user: 'block',
  bot_preference_sync_enabled: false,
  is_robots_txt_managed: false,
});

export function validateDesiredPolicy(policy = DESIRED_DISCOVERY_BOT_POLICY) {
  const errors = [];
  if (policy.ai_search !== 'disabled') errors.push('AI Search must remain allowed (ai_search=disabled means no Cloudflare blocking rule).');
  if (policy.ai_training !== 'block') errors.push('AI Training must be blocked.');
  if (policy.ai_user !== 'block') errors.push('AI assistants/agents must be blocked by default.');
  if (policy.ai_bots_protection !== 'block') errors.push('Legacy AI crawler protection must remain enabled.');
  if (policy.bot_preference_sync_enabled !== false) errors.push('Bot Preference Sync must remain off because EKODI owns robots.txt generation.');
  if (policy.is_robots_txt_managed !== false) errors.push('Cloudflare managed robots.txt must remain off because EKODI owns robots.txt generation.');
  return errors;
}

function redactedConfig(config = {}) {
  const keys = [
    'ai_bots_protection', 'ai_search', 'ai_training', 'ai_user',
    'bot_preference_sync_enabled', 'is_robots_txt_managed',
    'sbfm_verified_bots', 'content_bots_protection', 'crawler_protection',
  ];
  return Object.fromEntries(keys.filter(key => key in config).map(key => [key, config[key]]));
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
    const summary = (payload?.errors || []).map(error => `${error.code ?? 'CF'}:${error.message ?? 'request failed'}`).join(', ');
    throw new Error(`Cloudflare ${method} ${path} failed (${response.status})${summary ? `: ${summary}` : ''}`);
  }
  return payload.result;
}

async function resolveZoneId({ token, accountId }) {
  const params = new URLSearchParams({ name: ZONE_NAME, 'account.id': accountId, status: 'active', per_page: '50' });
  const zones = await cloudflare(`/zones?${params.toString()}`, { token });
  const exact = Array.isArray(zones) ? zones.filter(zone => zone?.name === ZONE_NAME && zone?.account?.id === accountId) : [];
  if (exact.length !== 1) throw new Error(`Expected exactly one active ${ZONE_NAME} zone in the production account; found ${exact.length}.`);
  return exact[0].id;
}

function matchesDesired(config, desired = DESIRED_DISCOVERY_BOT_POLICY) {
  return Object.entries(desired).every(([key, value]) => config?.[key] === value);
}

async function restorePrevious({ token, zoneId, previous, desired }) {
  const rollback = {};
  for (const key of Object.keys(desired)) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) rollback[key] = previous[key];
  }
  if (!Object.keys(rollback).length) return;
  await cloudflare(`/zones/${zoneId}/bot_management`, { method: 'PUT', token, body: rollback });
}

async function main() {
  const validationErrors = validateDesiredPolicy();
  if (validationErrors.length) throw new Error(validationErrors.join(' '));

  if (process.argv.includes('--validate-only')) {
    console.log('Cloudflare Discovery policy contract: PASS');
    console.log(JSON.stringify(DESIRED_DISCOVERY_BOT_POLICY));
    return;
  }

  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token || !accountId) throw new Error('Production Cloudflare credentials are required.');
  if (process.env.EKODI_ALLOW_CLOUDFLARE_DISCOVERY_MUTATION !== 'MAIN_APPROVED') throw new Error('Production mutation gate is closed.');
  if (process.env.GITHUB_REF && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Cloudflare discovery policy may only mutate from main.');

  const zoneId = await resolveZoneId({ token, accountId });
  const previous = await cloudflare(`/zones/${zoneId}/bot_management`, { token });
  console.log('Current Cloudflare discovery controls:', JSON.stringify(redactedConfig(previous)));

  if (previous?.sbfm_verified_bots === 'block') {
    throw new Error('Verified bots are globally blocked by Super Bot Fight Mode; refusing to claim SEO/AEO availability until that conflicting policy is reviewed.');
  }

  if (!matchesDesired(previous)) {
    try {
      await cloudflare(`/zones/${zoneId}/bot_management`, {
        method: 'PUT',
        token,
        body: DESIRED_DISCOVERY_BOT_POLICY,
      });
      const after = await cloudflare(`/zones/${zoneId}/bot_management`, { token });
      console.log('Updated Cloudflare discovery controls:', JSON.stringify(redactedConfig(after)));
      if (!matchesDesired(after)) throw new Error('Cloudflare accepted the request but the resulting policy does not match the EKODI discovery contract.');
    } catch (error) {
      console.error(`Discovery policy update failed: ${error.message}`);
      try {
        await restorePrevious({ token, zoneId, previous, desired: DESIRED_DISCOVERY_BOT_POLICY });
        console.error('Rollback of changed Cloudflare bot-management fields completed.');
      } catch (rollbackError) {
        console.error(`Rollback failed: ${rollbackError.message}`);
      }
      throw error;
    }
  } else {
    console.log('Cloudflare discovery controls already match the EKODI policy.');
  }

  const verified = await cloudflare(`/zones/${zoneId}/bot_management`, { token });
  if (!matchesDesired(verified)) throw new Error('Final Cloudflare discovery policy verification failed.');
  console.log('Cloudflare Discovery enforcement: PASS');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
