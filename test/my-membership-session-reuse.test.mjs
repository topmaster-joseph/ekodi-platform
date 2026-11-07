import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../my/membership-summary.js', import.meta.url), 'utf8');
const executable = source.replace(
  /^import \{ USER_SERVICES \} from '\.\/user-services\.js';\n/m,
  'const USER_SERVICES = [];\n',
);

function harness({ deferredPortfolio = false } = {}) {
  assert.doesNotMatch(executable, /^import /m, 'isolate this browser module without network imports');
  let token = '';
  const handlers = new Map();
  const requests = [];
  const pending = [];
  const window = {
    EKODI_MY_CONFIG: { dataEnabled: true, supabaseUrl: 'https://example.invalid', supabasePublishableKey: 'publishable-test' },
    EKODI_MY_AUTH: {
      isSignedIn: () => Boolean(token),
      getAccessToken: () => token,
    },
    addEventListener: (name, callback) => handlers.set(name, callback),
  };
  const fetch = (url, options) => {
    const destination = String(url);
    requests.push({ destination, authorization: options?.headers?.authorization, cache: options?.cache });
    if (deferredPortfolio && destination.endsWith('/portfolio')) {
      return new Promise(resolve => pending.push(resolve));
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => destination.endsWith('/portfolio') ? { services: [] } : { capabilities: [], subjects: [] },
    });
  };
  const document = { querySelector: () => null };
  runInNewContext(executable, {
    window, document, fetch, URL, console,
    localStorage: { getItem: () => null, setItem() {} },
  }, { timeout: 2000 });
  return {
    requests,
    pending,
    setToken(next) {
      token = next;
      handlers.get('ekodi:my-session')?.({ detail: { signedIn: Boolean(next) } });
    },
  };
}

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

test('membership startup uses verified main session, without a second Supabase client', async () => {
  assert.doesNotMatch(source, /createClient\s*\(|sb\.auth\.getSession\s*\(/);
  assert.doesNotMatch(source, /from 'https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/);
  const app = harness();
  await flush();
  assert.equal(app.requests.length, 0, 'guest must not fetch private membership APIs');
  app.setToken('verified-first');
  await flush();
  assert.equal(app.requests.length, 2);
  assert.match(app.requests[0].destination, /\/api\/membership\/portfolio$/);
  assert.match(app.requests[1].destination, /\/api\/membership\/entitlements/);
  assert.ok(app.requests.every(item => item.cache === 'no-store'));
  assert.ok(app.requests.every(item => item.authorization === 'Bearer verified-first'));
  app.setToken('');
  await flush();
  assert.equal(app.requests.length, 2, 'logout must not start private requests');
  app.setToken('verified-second');
  await flush();
  assert.equal(app.requests.length, 4, 'a fresh valid session refreshes only its own membership');
  assert.ok(app.requests.slice(2).every(item => item.authorization === 'Bearer verified-second'));
});

test('a signed-out or switched session does not continue a stale membership waterfall', async () => {
  const app = harness({ deferredPortfolio: true });
  app.setToken('old-token');
  assert.equal(app.pending.length, 1);
  app.setToken('');
  app.pending.shift()({ ok:true, status:200, json:async () => ({ services:[] }) });
  await flush();
  assert.equal(app.requests.length, 1, 'stale response must not request AI entitlements after logout');
  app.setToken('new-token');
  assert.equal(app.pending.length, 1);
  app.pending.shift()({ ok:true, status:200, json:async () => ({ services:[] }) });
  await flush();
  assert.equal(app.requests.length, 3, 'new verified token loads membership and entitlements');
  assert.equal(app.requests.at(-1).authorization, 'Bearer new-token');
});
