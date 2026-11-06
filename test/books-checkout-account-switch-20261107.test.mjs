import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const script = read('books/buy/buy.js');
const page = read('books/buy/index.html');
const client = read('books/buy/commerce-client.js');

test('checkout account button revokes central session, not only the old book-local token', async () => {
  const listeners = new Map();
  let signOutCalls = 0, forgetCalls = 0, reloads = 0;
  const el = name => ({ name, disabled: false, hidden: false, textContent: '',
    addEventListener: (event, fn) => listeners.set(name + ':' + event, fn) });
  const elements = new Map(['signOut','payBtn','bookCoverButton','googleButton','buyRoot','buyError','buyErrorText','accountStatus'].map(n => [n, el(n)]));
  const commerce = {
    forget() { forgetCalls++; },
    async signOut() { signOutCalls++; },
    mountGoogle() {},
    under(x) { return x; },
  };
  const context = {
    URLSearchParams, Object,
    location: { search: '', pathname: '/books/buy/' },
    window: { EkodiBooksCommerce: commerce, location: { reload() { reloads++; } } },
    document: { getElementById: name => elements.get(name), querySelectorAll: () => [] },
  };
  vm.runInNewContext(script, context);
  const click = listeners.get('signOut:click');
  assert.equal(typeof click, 'function');
  await click();
  assert.deepEqual({ signOutCalls, forgetCalls, reloads }, { signOutCalls: 1, forgetCalls: 0, reloads: 1 });
  await click();
  assert.equal(signOutCalls, 1, 'repeated click during navigation must not start another logout');
});

test('shared signOut clears both central and legacy token keys and checkout shows explicit logout', () => {
  assert.match(client, /async function signOut\(\)/);
  assert.match(client, /forget\(\); try \{ localStorage\.removeItem\(CENTRAL_KEY\); \} catch \{\}/);
  assert.match(page, /id="signOut" class="linklike">로그아웃<\/button>/);
  assert.doesNotMatch(script, /C\.forget\(\); load\(\)/);
});
