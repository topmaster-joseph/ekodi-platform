import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  handleMarketingAuthHandoffRequest,
  isMarketingReturnOrigin,
  safeMarketingReturn,
} from '../marketing-auth-handoff.js';

class MemoryD1 {
  constructor() { this.rows = new Map(); }
  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        return {
          async run() {
            if (sql.startsWith('DELETE FROM marketing_handoff_exchanges WHERE expires_at')) {
              const now = values[0];
              for (const [key, row] of db.rows) if (row.expires_at <= now || row.consumed_at) db.rows.delete(key);
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('INSERT INTO marketing_handoff_exchanges')) {
              const [exchange_hash, token_hash, token_type, workspace_json, return_to, created_at, expires_at] = values;
              db.rows.set(exchange_hash, { exchange_hash, token_hash, token_type, workspace_json, return_to, created_at, expires_at, consumed_at: null });
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('UPDATE marketing_handoff_exchanges SET consumed_at')) {
              const [consumed_at, exchange_hash, now] = values;
              const row = db.rows.get(exchange_hash);
              if (!row || row.consumed_at || row.expires_at <= now) return { meta: { changes: 0 } };
              row.consumed_at = consumed_at;
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('DELETE FROM marketing_handoff_exchanges WHERE exchange_hash')) {
              const changed = db.rows.delete(values[0]) ? 1 : 0;
              return { meta: { changes: changed } };
            }
            throw new Error(`Unhandled run SQL: ${sql}`);
          },
          async first() {
            if (sql.startsWith('SELECT exchange_hash,token_hash')) return db.rows.get(values[0]) || null;
            throw new Error(`Unhandled first SQL: ${sql}`);
          },
        };
      },
    };
  }
}

test('Marketing return URLs are HTTPS and restricted to EKODI Marketing origins', () => {
  assert.equal(isMarketingReturnOrigin('https://marketing.ekodi.kr'), true);
  assert.equal(isMarketingReturnOrigin('https://demo.ai.ekodi.kr'), true);
  assert.equal(isMarketingReturnOrigin('https://evil.example.com'), false);
  assert.equal(safeMarketingReturn('https://marketing.ekodi.kr/path?x=1#secret'), 'https://marketing.ekodi.kr/path?x=1');
  assert.equal(safeMarketingReturn('https://evil.example.com/'), null);
});

test('start hides the credential in an HttpOnly cookie and consume is one-time', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url).endsWith('/functions/v1/access-api/handoff'), true);
    assert.equal(options.headers.authorization, 'Bearer session-token');
    return new Response(JSON.stringify({
      tokenHash: 'otp-token-hash',
      type: 'email',
      returnTo: 'https://marketing.ekodi.kr/',
      workspace: { workspace_key: 'store:123', tenant_id: 'tenant-1', store_id: 'store-1' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = { DB: new MemoryD1(), ALLOWED_ORIGINS: 'https://marketing.ekodi.kr,https://auth.ekodi.kr' };
    const start = await handleMarketingAuthHandoffRequest(new Request('https://marketing-api.ekodi.kr/api/marketing/handoff/start', {
      method: 'POST',
      headers: {
        origin: 'https://auth.ekodi.kr',
        authorization: 'Bearer session-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ return_to: 'https://marketing.ekodi.kr/', workspace_key: 'store:123' }),
    }), env);
    assert.equal(start.status, 200);
    assert.equal(start.headers.get('access-control-allow-credentials'), 'true');
    const setCookie = start.headers.get('set-cookie');
    assert.match(setCookie, /^__Host-ekodi_handoff=[a-f0-9]{64};/i);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.doesNotMatch(setCookie, /Domain=/i);
    const startBody = await start.json();
    assert.equal(startBody.returnTo, 'https://marketing.ekodi.kr/');
    assert.equal('tokenHash' in startBody, false);
    assert.equal(JSON.stringify(startBody).includes('otp-token-hash'), false);

    const cookiePair = setCookie.split(';', 1)[0];
    const consume = await handleMarketingAuthHandoffRequest(new Request('https://marketing-api.ekodi.kr/api/marketing/handoff/consume', {
      method: 'POST',
      headers: { origin: 'https://marketing.ekodi.kr', cookie: cookiePair },
    }), env);
    assert.equal(consume.status, 200);
    const payload = await consume.json();
    assert.equal(payload.tokenHash, 'otp-token-hash');
    assert.equal(payload.workspace.workspace_key, 'store:123');
    assert.match(consume.headers.get('set-cookie'), /Max-Age=0/);

    const replay = await handleMarketingAuthHandoffRequest(new Request('https://marketing-api.ekodi.kr/api/marketing/handoff/consume', {
      method: 'POST',
      headers: { origin: 'https://marketing.ekodi.kr', cookie: cookiePair },
    }), env);
    assert.equal(replay.status, 410);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auth UI no longer constructs an ekodi_token URL fragment', () => {
  const source = fs.readFileSync(new URL('../auth-site/marketing-auth-hotfix.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/marketing\/handoff\/start/);
  assert.match(source, /credentials:'include'/);
  assert.doesNotMatch(source, /ekodi_token/);
  assert.doesNotMatch(source, /target\.hash\s*=/);
  assert.doesNotMatch(source, /api\('\/handoff'/);
});
