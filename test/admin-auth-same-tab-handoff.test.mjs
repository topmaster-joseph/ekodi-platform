import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../auth-site/admin-auth.js', import.meta.url), 'utf8');
const extracted = source.match(/async function completeGoogleLogin\(credential,challenge\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(extracted, 'canonical Google admin completion routine exists');

async function simulate({ authenticated = true, writable = true } = {}) {
  const actions = [];
  const saved = new Map();
  const context = {
    notice: () => {},
    request: async path => {
      if (path === '/api/google/login') return { token: 'test-only-valid-token' };
      if (path === '/api/session') {
        actions.push('validated');
        return { authenticated };
      }
      throw new Error('unexpected endpoint');
    },
    sessionStorage: {
      setItem: (key, value) => {
        if (!writable) throw new Error('storage disabled');
        saved.set(key, value);
        actions.push('stored');
      },
    },
    navigateToAdmin: () => actions.push('redirected'),
  };
  const result = vm.runInNewContext(extracted + "\ncompleteGoogleLogin('test-google-proof',{nonce:'test-nonce'})", context);
  let error = null;
  try { await result; } catch (e) { error = e; }
  return { actions, saved, error };
}

test('valid Google admin session is stored in same-origin sessionStorage before navigation', async () => {
  const { actions, saved, error } = await simulate();
  assert.equal(error, null);
  assert.deepEqual(actions, ['validated','stored','redirected']);
  assert.equal(saved.get('ekodi-auth-token'), 'test-only-valid-token');
});

test('server-rejected Google admin session cannot persist or redirect', async () => {
  const { actions, saved, error } = await simulate({ authenticated:false });
  assert.equal(error?.message, 'admin_session_not_ready');
  assert.deepEqual(actions, ['validated']);
  assert.equal(saved.size, 0);
});

test('blocked browser storage preserves existing URL-fragment handoff fallback', async () => {
  const { actions, saved, error } = await simulate({ writable:false });
  assert.equal(error, null);
  assert.deepEqual(actions, ['validated','redirected']);
  assert.equal(saved.size, 0);
});
