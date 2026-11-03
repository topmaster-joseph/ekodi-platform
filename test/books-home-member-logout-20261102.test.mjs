import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../books/home-account.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../books/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../books/styles.css', import.meta.url), 'utf8');

async function mount(profile, hasSession = true, apiReject = false) {
  const elements = [];
  let signOuts = 0, reloads = 0, apiCalls = 0;
  const actions = { children: [], insertBefore(el, sibling) { this.children.push(el); this.before = sibling; },
    querySelector(selector) { return selector === '.ekc-menu' ? { className: 'ekc-menu' } : null; } };
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.textContent = ''; this.handlers = {}; this.attributes = {}; this.disabled = false; elements.push(this); }
    setAttribute(key,value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    async click() { await this.handlers.click(); }
  }
  const document = {querySelector: selector => selector === '.ekc-header[data-ekodi-chrome="books"] .ekc-actions' ? actions : null,createElement: tag => new Node(tag)};
  const window = { location: { reload() { reloads++; } }, EkodiBooksCommerce: {
    async session() {return hasSession ? {accessToken:'signed-in-token'} : null;},
    async api(path) {assert.equal(path,'library'); apiCalls++;if(apiReject)throw new Error('401');return profile;},
    async signOut() {signOuts++;}
  }};
  vm.runInNewContext(script,{document,window});
  await new Promise(resolve=>setImmediate(resolve));
  return {actions,elements,counts:()=>({signOuts,reloads,apiCalls})};
}

test('signed-in Kakao account shows concise name with adjacent working logout', async () => {
  const state = await mount({email:'identity+kakao.0123456789abcdef0123456789abcdef@ekodi.kr'});
  assert.equal(state.actions.children.length,1);
  const [label,button] = state.actions.children[0].children;
  assert.equal(label.textContent,'카카오 계정');
  assert.equal(button.textContent,'로그아웃');
  assert.equal(button.type,'button');
  assert.equal(button.className,'ekc-account-logout');
  await button.click();
  assert.deepEqual(state.counts(),{signOuts:1,reloads:1,apiCalls:1});
});

test('name or ordinary email is concise and never exposes internal alias', async () => {
  const named = await mount({displayName:'독자',email:'identity+naver.0123456789@ekodi.kr'});
  assert.equal(named.actions.children[0].children[0].textContent,'독자');
  const plain = await mount({email:'joseph@example.test'});
  assert.equal(plain.actions.children[0].children[0].textContent,'joseph님');
});

test('no session or invalid server auth cannot render logout', async () => {
  const out = await mount({},false);
  assert.equal(out.actions.children.length,0);
  assert.equal(out.counts().apiCalls,0);
  const invalid = await mount({},true,true);
  assert.equal(invalid.actions.children.length,0);
});

test('the bookstore home loads the shared auth client before the header control and is responsive',()=>{
  const client=html.indexOf('<script src="/buy/commerce-client.js" defer></script>');
  const account=html.indexOf('<script src="/home-account.js" defer></script>');
  assert.ok(client>0 && account>client);
  assert.match(css, /BOOKS-HOME-MEMBER-20261102/);
  assert.match(css, /\.ekc-account\{grid-column:1\/-1;grid-row:2/);
  assert.match(script, /await C\.signOut\(\)/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
});
