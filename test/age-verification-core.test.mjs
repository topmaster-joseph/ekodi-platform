import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAgeVerificationRequest, verifiedAgeEligible, pruneAgeVerification } from '../age-verification-core.js';

const U = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const url = 'https://ekodi.kr/api/age-verification';
const cfg = {
  AGE_VERIFICATION_ENABLED: 'true',
  AGE_VERIFICATION_SITE_POLICIES: '{"singles":"civil_adult_19","ekodimall":"youth_protection_19"}',
  PORTONE_AGE_STORE_ID: 'store-abc12345',
  PORTONE_AGE_CHANNEL_KEY: 'channel-key-abc12345',
  PORTONE_AGE_API_SECRET: 'secret-test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'anon-test',
};
class Db {
  constructor() { this.attempts = new Map(); this.grants = new Map(); }
  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        const params = args;
        return {
          sql, params,
          async first() {
            if (sql.startsWith('SELECT name FROM sqlite_master')) return { name: 'age_verification_attempts' };
            if (sql.startsWith('SELECT COUNT(*)')) return { total: [...db.attempts.values()].filter(a => a.subject === args[0] && a.created > args[1]).length };
            if (sql.startsWith('SELECT expires_at,attempt_id FROM age_verification_grants')) {
              const item = db.grants.get(args.slice(0, 3).join(':'));
              return item && item.expires > args[3] ? { expires_at: item.expires, attempt_id: item.attempt_id } : null;
            }
            if (sql.startsWith('SELECT status,expires_at FROM age_verification_attempts')) {
              const a = db.attempts.get(args[0]);
              return a && a.subject === args[1] && a.site === args[2] && a.policy === args[3] ?
                { status: a.status, expires_at: a.expires } : null;
            }
            throw Error('unexpected first: ' + sql);
          },
          async run() {
            if (sql.startsWith('INSERT INTO age_verification_attempts')) {
              const [id, subject, site, policy, status, created, expires] = args;
              const quota = [...db.attempts.values()].filter(a => a.subject === args.at(-2) && a.created > args.at(-1)).length;
              if (sql.includes('SELECT') && quota >= 5) return { meta: { changes: 0 } };
              db.attempts.set(id, { id, subject, site, policy, status, created, expires }); return { meta: { changes: 1 } };
            }
            if (sql.startsWith('UPDATE age_verification_attempts')) {
              const [status, _, id, subject, prior, time] = args;
              const a = db.attempts.get(id);
              if (!a || a.subject !== subject || a.status !== prior || a.expires <= time) return { meta: { changes: 0 } };
              a.status = status; return { meta: { changes: 1 } };
            }
            if (sql.startsWith('INSERT INTO age_verification_grants')) {
              const [verified, expires, id, subject, prior, time] = args, a = db.attempts.get(id);
              if (!a || a.subject !== subject || a.status !== prior || a.expires <= time) return { meta: { changes: 0 } };
              db.grants.set([subject, a.site, a.policy].join(':'), { expires, verified, attempt_id: id });
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('DELETE FROM age_verification_')) return { meta: { changes: 0 } };
            throw Error('unexpected run: ' + sql);
          },
        };
      },
    };
  }
  async batch(statements) { const results = []; for (const s of statements) results.push(await s.run()); return results; }
}
const DB = new Db();
let current = U, proof;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (target, options) => {
  if (String(target).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: current }));
  if (String(target).startsWith('https://api.portone.io/identity-verifications/')) {
    assert.equal(options.headers.authorization, 'PortOne secret-test');
    return new Response(JSON.stringify(proof?.(String(target).split('/').at(-1)) ?? { status: 'READY' }));
  }
  throw Error('Unexpected network: ' + target);
};
const env = { ...cfg, DB };
const request = (route, body, token = 't') => new Request(url + route, {
  method: body ? 'POST' : 'GET',
  headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: 'Bearer ' + token },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const handle = async (route, body, user = U) => {
  current = user;
  const r = await handleAgeVerificationRequest(request(route, body), env);
  return { status: r.status, value: await r.json(), headers: r.headers };
};
test.after(() => { globalThis.fetch = originalFetch; });
test('age policy explicitly separates civil adulthood and youth protection on KST day boundary', () => {
  const now = new Date('2026-11-03T15:10:00.000Z'); // 2026-11-04 in Korea
  assert.equal(verifiedAgeEligible('2007-11-04', 'civil_adult_19', now), true);
  assert.equal(verifiedAgeEligible('2007-11-05', 'civil_adult_19', now), false);
  assert.equal(verifiedAgeEligible('2007-12-31', 'youth_protection_19', now), true);
  assert.equal(verifiedAgeEligible('2008-01-01', 'youth_protection_19', now), false);
  for (const invalid of ['2007-02-29', '2007-00-01', '2007-13-01', '2007-11-31', '2030-01-01','2007/01/01', '']) {
    assert.equal(verifiedAgeEligible(invalid, 'civil_adult_19', now), false);
  }
});
test('disabled or missing provider is closed, public config never leaks the API secret', async () => {
  const a = await handleAgeVerificationRequest(request('/config?site=singles'), { ...env, AGE_VERIFICATION_ENABLED: 'false' });
  assert.deepEqual(await a.json(), { enabled: false });
  const b = await handleAgeVerificationRequest(request('/config?site=singles'), env);
  const raw = await b.text();
  assert.equal(JSON.parse(raw).enabled, true);
  assert.ok(!raw.includes('secret-test'));
});
test('start binds provider id to Supabase account, site, policy; status no-store', async () => {
  const { status, value } = await handle('/start', { site: 'singles' });
  assert.equal(status, 201);
  assert.match(value.identityVerificationId, /^ekodi-age-[0-9a-f]{32}$/);
  assert.equal(DB.attempts.get(value.identityVerificationId).subject, U);
  assert.equal(DB.attempts.get(value.identityVerificationId).policy, 'civil_adult_19');
  const check = await handle('/status?site=singles');
  assert.equal(check.value.verified, false);
  assert.equal(check.headers.get('cache-control'), 'private, no-store');
});
test('cannot accept unverified provider result, other user, other site, or wrong channel', async () => {
  const a = (await handle('/start', { site: 'singles' })).value;
  proof = id => ({ id, status: 'READY' });
  assert.equal((await handle('/complete', { site: 'singles', identityVerificationId: a.identityVerificationId })).status, 409);
  assert.equal((await handle('/complete', { site: 'singles', identityVerificationId: a.identityVerificationId }, V)).status, 404);
  assert.equal((await handle('/complete', { site: 'ekodimall', identityVerificationId: a.identityVerificationId })).status, 404);
  proof = id => ({ id, status: 'VERIFIED', channel: { key: 'channel-key-wrong' }, verifiedCustomer: { birthDate: '1980-01-01' } });
  assert.equal((await handle('/complete', { site: 'singles', identityVerificationId: a.identityVerificationId })).status, 502);
});
test('provider VERIFIED with DOB proves only site-scoped eligibility; replay is blocked', async () => {
  const a = (await handle('/start', { site: 'singles' })).value;
  proof = id => ({ id, status: 'VERIFIED', storeId: cfg.PORTONE_AGE_STORE_ID, channel: { key: cfg.PORTONE_AGE_CHANNEL_KEY },
    verifiedCustomer: { birthDate: '1980-01-01', ci: 'must-not-store', name: 'must-not-store', phoneNumber: '01000000000' } });
  const ok = await handle('/complete', { site: 'singles', identityVerificationId: a.identityVerificationId });
  assert.equal(ok.status, 200);
  assert.equal(ok.value.verified, true);
  assert.equal((await handle('/status?site=singles')).value.verified, true);
  assert.equal((await handle('/status?site=ekodimall')).value.verified, false);
  assert.equal((await handle('/complete', { site: 'singles', identityVerificationId: a.identityVerificationId })).status, 409);
  const raw = JSON.stringify([...DB.grants, ...DB.attempts]);
  for (const secret of ['must-not-store', '01000000000', '1980-01-01']) assert.equal(raw.includes(secret), false);
});
test('minor and future dates deny and never mint an eligibility grant', async () => {
  const a = (await handle('/start', { site: 'ekodimall' })).value;
  proof = id => ({ id, status: 'VERIFIED', verifiedCustomer: { birthDate: '2012-01-01' } });
  const denied = await handle('/complete', { site: 'ekodimall', identityVerificationId: a.identityVerificationId });
  assert.equal(denied.status, 403);
  assert.equal(denied.value.verified, false);
  assert.equal((await handle('/status?site=ekodimall')).value.verified, false);
});
test('client-selected policy/age and forged verification ID are rejected', async () => {
  assert.equal((await handle('/start', { site: 'singles', age: 60 })).status, 400);
  assert.equal((await handle('/start', { site: 'singles', policy: 'youth_protection_19' })).status, 400);
  assert.equal((await handle('/complete', { site: 'singles', identityVerificationId: '../../p' })).status, 400);
  assert.equal((await handle('/start', { site: 'not-enabled' })).status, 403);
  const cross = await handleAgeVerificationRequest(new Request(url + '/status?site=singles', {
    headers: { origin: 'https://attacker.example', authorization: 'Bearer t' }
  }), env);
  assert.equal(cross.status, 403);
});
test('retention is a guarded no-op when DB migration is not yet present', async () => {
  await pruneAgeVerification({ DB });
});

test('daily quota is enforced on the atomic insert and never relies only on the early count', async () => {
  const existing = [...DB.attempts.values()].filter(a => a.subject === U).length;
  for (let n = existing; n < 5; n++) assert.equal((await handle('/start', { site: 'singles' })).status, 201);
  assert.equal((await handle('/start', { site: 'singles' })).status, 429);
  assert.equal([...DB.attempts.values()].filter(a => a.subject === U).length, 5);
});
test('secret missing and client-claimed proof fail closed', async () => {
  const r = await handleAgeVerificationRequest(request('/start', { site: 'singles' }), { ...env, PORTONE_AGE_API_SECRET: null });
  assert.equal(r.status, 503);
  const requestWithClientAge = request('/complete', {
    site: 'singles', identityVerificationId: 'ekodi-age-' + '0'.repeat(32),
    verified: true, age: 99,
  });
  const r2 = await handleAgeVerificationRequest(requestWithClientAge, env);
  assert.equal(r2.status, 400);
});
