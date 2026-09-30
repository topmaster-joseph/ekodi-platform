import fs from 'node:fs';

const APPLY_CONFIRMATION = 'DISCONNECT_EKODI_PLATFORM_BUILDS';
const SCHEMA = 'ekodi.cloud-control.request.v1';
const OPERATION = 'workers-builds-trigger-disconnect';
const TARGET = 'ekodi-platform';

function clean(value) {
  return String(value ?? '').trim();
}

function safeScalar(name, value, { max = 240 } = {}) {
  const text = clean(value);
  if (!text) throw new Error(`Missing request field: ${name}`);
  if (text.length > max) throw new Error(`Request field too long: ${name}`);
  if (/\r|\n/.test(text)) throw new Error(`Request field must be single-line: ${name}`);
  return text;
}

export function validateGitOpsRequest(request, now = Date.now()) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Cloud Control request must be a JSON object.');
  }

  const schema = safeScalar('schema', request.schema);
  const operation = safeScalar('operation', request.operation);
  const target = safeScalar('target', request.target);
  const mode = safeScalar('mode', request.mode);
  const reason = safeScalar('reason', request.reason);
  const requestId = safeScalar('requestId', request.requestId, { max: 120 });
  const expiresAt = safeScalar('expiresAt', request.expiresAt, { max: 80 });
  const confirmation = clean(request.confirmation);

  if (schema !== SCHEMA) throw new Error(`Unsupported request schema: ${schema}`);
  if (operation !== OPERATION) throw new Error(`Unsupported Cloud Control operation: ${operation}`);
  if (target !== TARGET) throw new Error(`Target is not allowlisted: ${target}`);
  if (!['plan', 'apply'].includes(mode)) throw new Error(`Unsupported request mode: ${mode}`);
  if (!/^[a-z0-9][a-z0-9._-]{5,119}$/i.test(requestId)) throw new Error('Invalid requestId format.');

  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) throw new Error('Invalid expiresAt timestamp.');
  if (expiry <= now) throw new Error('Cloud Control request is expired.');
  if (expiry - now > 24 * 60 * 60 * 1000) throw new Error('Cloud Control request TTL exceeds 24 hours.');

  if (mode === 'apply' && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`Apply requires exact confirmation: ${APPLY_CONFIRMATION}`);
  }
  if (mode === 'plan' && confirmation) {
    throw new Error('Plan requests must not include an apply confirmation.');
  }

  return { schema, operation, target, mode, confirmation, reason, requestId, expiresAt };
}

export function renderGithubEnv(request) {
  const validated = validateGitOpsRequest(request);
  return [
    `CONTROL_MODE=${validated.mode}`,
    `CONTROL_TARGET=${validated.target}`,
    `CONTROL_CONFIRMATION=${validated.confirmation}`,
    `CONTROL_REASON=${validated.reason}`,
    `CONTROL_REQUEST_ID=${validated.requestId}`,
    `CONTROL_EXPIRES_AT=${validated.expiresAt}`,
  ].join('\n') + '\n';
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/resolve-cloud-control-request.mjs <request.json>');
  const request = JSON.parse(fs.readFileSync(file, 'utf8'));
  process.stdout.write(renderGithubEnv(request));
}

if (process.argv[1]?.endsWith('resolve-cloud-control-request.mjs')) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
