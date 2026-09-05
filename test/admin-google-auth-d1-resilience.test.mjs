import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handleAdminGoogleAuth } from '../admin-google-auth.js';

const CLIENT_ID = '483044030492-4e6231l5glchhtniroinvuq3ev6n5mv5.apps.googleusercontent.com';
const baseEnv = {
  ENVIRONMENT: 'production',
  ALLOWED_ORIGINS: 'https://admin.ekodi.kr,https://auth.ekodi.kr',
  GOOGLE_CLIENT_ID: CLIENT_ID,
  ADMIN_GOOGLE_BOOTSTRAP_EMAILS: '',
  ADMIN_WORKSPACE_DOMAIN: 'ekodi.kr',
};

function request(path, method = 'GET') {
  return new Request(`https://api.ekodi.kr${path}`, {
    method,
    headers: { origin: 'https://auth.ekodi.kr' },
  });
}

test('Google client config remains available without touching D1', async () => {
  const response = await handleAdminGoogleAuth(request('/api/google/config'), { ...baseEnv });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    enabled: true,
    clientId: CLIENT_ID,
    mode: 'google_allowlist',
  });
});

test('D1 daily row-read exhaustion is surfaced as retryable 503 instead of generic 500', async () => {
  let attempts = 0;
  const db = {
    prepare() { return {}; },
    async batch() {
      attempts += 1;
      throw new Error("Your account has exceeded D1's free tier daily row read limit. [code: 7500]");
    },
  };
  const env = { ...baseEnv, DB: db };
  for (let index = 0; index < 2; index += 1) {
    const response = await handleAdminGoogleAuth(request('/api/google/challenge', 'POST'), env);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'AUTH_STORE_DAILY_LIMIT');
    assert.match(body.retryAt, /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  }
  assert.equal(attempts, 2, 'failed schema initialization must be retryable after the quota resets');
});

test('schema bootstrap runs once per D1 binding while challenges stay one-time and server-stored', async () => {
  const stats = { batch: 0, pragma: 0, challengeWrites: 0 };
  const db = {
    async batch() { stats.batch += 1; return []; },
    prepare(sql) {
      const statement = {
        bind() { return statement; },
        async run() {
          if (String(sql).includes('google_login_challenges')) stats.challengeWrites += 1;
          return { meta: { last_row_id: 1 } };
        },
        async all() {
          if (String(sql).includes('PRAGMA table_info(admins)')) stats.pragma += 1;
          return { results: [{ name: 'password_iterations' }] };
        },
        async first() { return null; },
      };
      return statement;
    },
  };
  const env = { ...baseEnv, DB: db };
  const first = await handleAdminGoogleAuth(request('/api/google/challenge', 'POST'), env);
  const second = await handleAdminGoogleAuth(request('/api/google/challenge', 'POST'), env);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(stats.batch, 1);
  assert.equal(stats.pragma, 1);
  assert.equal(stats.challengeWrites, 4, 'each challenge still deletes expired rows and inserts its own nonce');
});


test('admin login UI explains retryable D1 quota exhaustion instead of a generic failure', async () => {
  const source = await readFile(new URL('../auth-site/admin-auth.js', import.meta.url), 'utf8');
  assert.match(source, /AUTH_STORE_DAILY_LIMIT/);
  assert.match(source, /retryAt/);
  assert.match(source, /preparationFailureMessage\(e\)/);
});
