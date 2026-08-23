import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { aiGatewayScript } from '../ai-gateway-page.js';

function element() {
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    className: '',
    addEventListener() {},
  };
}

async function runClient({ storageThrows = false } = {}) {
  const response = aiGatewayScript();
  const script = await response.text();
  const ids = [
    'signedIn','signedOut','overallDot','overallText','checkedAt','sessionIdentity',
    'loginTitle','loginMessage','refreshBtn','gatewayState','gatewayMeta','openaiState',
    'openaiMeta','fallbackState','fallbackMeta','testBtn','testResult','logoutBtn',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  elements.signedIn.hidden = true;
  elements.signedOut.hidden = false;

  const token = 'a'.repeat(64);
  const sequence = [];
  const storage = new Map();
  const sessionStorage = {
    getItem(key) {
      if (storageThrows) throw new Error('storage blocked');
      return storage.get(key) || null;
    },
    setItem(key, value) {
      if (storageThrows) throw new Error('storage blocked');
      storage.set(key, String(value));
    },
    removeItem(key) {
      if (storageThrows) throw new Error('storage blocked');
      storage.delete(key);
    },
  };

  const location = {
    hash: `#ekodi_admin_token=${token}`,
    pathname: '/',
    search: '',
  };
  const history = {
    replaceState(_state, _title, href) {
      sequence.push('clear-handoff');
      location.hash = '';
      location.href = href;
    },
  };

  const fetch = async (path, options = {}) => {
    const auth = options?.headers?.authorization || options?.headers?.Authorization || '';
    assert.equal(auth, `Bearer ${token}`, `${path} must receive the Google admin handoff token`);
    if (path === '/api/session') {
      sequence.push('session');
      return new Response(JSON.stringify({ authenticated:true, email:'admin@example.test', role:'super_admin' }), {
        status:200,
        headers:{ 'content-type':'application/json' },
      });
    }
    if (path === '/api/control/ai/provider-status') {
      sequence.push('provider');
      return new Response(JSON.stringify({
        ok:true,
        gateway:{ mode:'ai', policyVersion:'test', providerCount:1, providerIndependent:true, providerDisabled:false },
        openai:{ configured:true, available:true, model:'test-model' },
      }), { status:200, headers:{ 'content-type':'application/json' } });
    }
    throw new Error(`unexpected fetch ${path}`);
  };

  const context = vm.createContext({
    document: { getElementById: id => elements[id] || null, title:'EKODI AI Gateway' },
    location,
    history,
    sessionStorage,
    fetch,
    Response,
    Headers,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    Date,
    Object,
    JSON,
    String,
    Boolean,
    Number,
    Error,
  });

  vm.runInContext(script, context, { timeout: 2_000 });
  await new Promise(resolve => setTimeout(resolve, 30));
  return { elements, sequence, location, token };
}

test('Google admin handoff survives blocked sessionStorage and opens authenticated Gateway', async () => {
  const { elements, sequence, location } = await runClient({ storageThrows:true });
  assert.deepEqual(sequence.slice(0, 3), ['session', 'clear-handoff', 'provider']);
  assert.equal(location.hash, '');
  assert.equal(elements.signedOut.hidden, true);
  assert.equal(elements.signedIn.hidden, false);
  assert.match(elements.sessionIdentity.textContent, /admin@example\.test · super_admin/);
  assert.match(elements.overallText.textContent, /OpenAI 구성 정상/);
  assert.equal(elements.openaiState.textContent, '구성됨 · 런타임 준비');
});

test('handoff is removed only after session validation succeeds', async () => {
  const { sequence } = await runClient({ storageThrows:false });
  assert.equal(sequence[0], 'session');
  assert.equal(sequence[1], 'clear-handoff');
  assert.equal(sequence[2], 'provider');
});
