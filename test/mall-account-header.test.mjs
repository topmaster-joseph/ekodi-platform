import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { renderMallHeader } from '../mall-shared-header.js';

const script = readFileSync(new URL('../sites/ekodi-mall/assets/mall-account-header.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../sites/ekodi-mall/assets/mall-account-header.css', import.meta.url), 'utf8');
const centralKey = 'sb-renzehysxirjilvdxacv-auth-token';

function mount(session, user = {id:'verified',email:'buyer@example.com'}) {
  const nodes = {
    login: { hidden:false, href:'' },
    signed: { hidden:true },
    id: { textContent:'', title:'' },
    logout: { disabled:false, textContent:'로그아웃', addEventListener(type, callback) { if (type === 'click') this.click = callback; } },
  };
  const host = {
    querySelector(selector) {
      return ({
        '[data-mall-login]':nodes.login, '[data-mall-signed]':nodes.signed,
        '[data-mall-id]':nodes.id, '[data-mall-logout]':nodes.logout,
      })[selector];
    }
  };
  const store = new Map();
  if(session)store.set(centralKey, JSON.stringify(session));
  const localStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key,value),
    removeItem: key => store.delete(key)
  };
  let reloads = 0;
  const events = {};
  const window = {
    location: {
      href:'https://ekodi.kr/ekodimall/?category=book#shop',
      reload() { reloads += 1; }
    },
    addEventListener(type, callback) {events[type] = callback}
  };
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({url,options});
    if(url.endsWith('/auth/v1/user')) return {ok:!!user,json:async()=>user};
    if(url.includes('/auth/v1/logout')) return {ok:true};
    if(url.includes('/auth/v1/token')) return {ok:true,json:async()=>({access_token:'new-token',expires_in:3600})};
    throw new Error('unknown endpoint '+url);
  };
  const document = {
    querySelectorAll: selector => selector === '[data-mall-account]' ? [host] : [],
    addEventListener(type,callback) {events[type] = callback},
    hidden:false
  };
  vm.runInNewContext(script,{window,document,localStorage,fetch,URL,AbortController,Date,setTimeout,clearTimeout,JSON});
  const idle = () => new Promise(resolve => setImmediate(resolve));
  return {nodes,store,calls,events,idle,reloads:()=>reloads};
}

test('shared Mall header has verified account controls on home, catalog, weekly and supplier views', () => {
  for (const options of [{home:true},{home:false},{publicPrefix:'/ekodimall',home:false}]) {
    const html = renderMallHeader(options);
    assert.match(html,/data-mall-account/);
    assert.match(html,/data-mall-login/);
    assert.match(html,/data-mall-id/);
    assert.match(html,/data-mall-logout/);
    assert.match(html,/\/ekodimall\/assets\/mall-account-header\.js/);
    assert.match(html,/\/ekodimall\/assets\/mall-account-header\.css/);
    assert.match(html,/seller-mini/);
    assert.match(html,/mall-primary-nav/);
  }
});

test('verified central login shows the real ID and logout; preserves deep-link login return', async () => {
  const h = mount({access_token:'central-token',expires_at:4102444800});
  await h.idle();
  assert.equal(h.nodes.login.hidden,true);
  assert.equal(h.nodes.signed.hidden,false);
  assert.equal(h.nodes.id.textContent,'buyer@example.com');
  assert.equal(h.nodes.logout.textContent,'로그아웃');
  const url = new URL(h.nodes.login.href);
  assert.equal(url.pathname,'/auth/');
  assert.equal(url.searchParams.get('site'),'mall');
  assert.equal(url.searchParams.get('return_to'),'https://ekodi.kr/ekodimall/?category=book#shop');
  assert.ok(h.calls.some(v=>v.url.endsWith('/auth/v1/user')));
  assert.doesNotMatch(h.nodes.id.textContent,/central-token/);
});

test('empty or invalid central session never impersonates a member', async () => {
  for(const session of [null,{access_token:'expired',expires_at:4102444800}]){
    const h=mount(session, session ? null : undefined);
    await h.idle();
    assert.equal(h.nodes.login.hidden,false);
    assert.equal(h.nodes.signed.hidden,true);
    assert.equal(h.nodes.id.textContent,'');
  }
});

test('logout revokes the current central session and stays on the exact Mall URL', async () => {
  const h = mount({access_token:'central-token',expires_at:4102444800});
  await h.idle();
  await h.nodes.logout.click();
  assert.equal(h.store.has(centralKey),false);
  assert.equal(h.nodes.login.hidden,false);
  assert.equal(h.nodes.signed.hidden,true);
  assert.equal(h.reloads(),1);
  assert.equal(h.calls.filter(v=>v.url.includes('/auth/v1/logout')).length,1);
});

test('mobile account remains displayed even when the seller action is hidden', () => {
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/grid-template-areas:"mall-brand mall-account"/);
  assert.match(css,/\.mall-header \.mall-account-id/);
  assert.doesNotMatch(css,/\.mall-account\s*\{display:none/);
});
