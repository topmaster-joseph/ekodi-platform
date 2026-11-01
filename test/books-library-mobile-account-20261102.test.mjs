import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const js = readFileSync(new URL('../books/buy/library.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../books/library/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../books/buy/buy.css', import.meta.url), 'utf8');

function friendlyAccount() {
  const from = js.indexOf('  function friendlyAccount(data) {');
  const to = js.indexOf('\n  async function load() {', from);
  assert.ok(from >= 0 && to > from, 'friendlyAccount must be defined before load');
  return new Function(js.slice(from, to) + '\nreturn friendlyAccount;')();
}

test('federated internal aliases never appear in the reader account label', () => {
  const label = friendlyAccount();
  assert.equal(label({email:'identity+kakao.0123456789abcdef0123456789abcdef@ekodi.kr'}), '카카오 계정');
  assert.equal(label({email:'identity+naver.abcdef0123456789@ekodi.kr'}), '네이버 계정');
  assert.equal(label({email:'identity+other.abcdef0123456789@ekodi.kr'}), '연결 계정');
  assert.equal(label({email:'joseph@example.test'}), 'joseph님');
  assert.equal(label({displayName:'독자',email:'identity+kakao.abcdef@ekodi.kr'}), '독자');
  assert.equal(label({email:'averylonginternalusername_1234@example.test'}), 'averylonginternalus…님');
});

test('zero-book library has a short meaningful empty state', async () => {
  const elements = new Map();
  class Node {
    constructor(tag='div') { this.tagName=tag; this.children=[]; this.textContent=''; this.hidden=false; this.className=''; this.attributes={}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key,value) { this.attributes[key]=value; }
    addEventListener() {}
  }
  for (const id of ['libStatus','libLogin','libraryList','operatorPanel','operatorBooks']) elements.set(id,new Node());
  const document = {getElementById: id => elements.get(id), createElement: name => new Node(name),createDocumentFragment:()=>new Node('fragment')};
  const window = {EkodiBooksCommerce: {
    BASE:'/books', api: async path => {assert.equal(path,'library');return {email:'identity+kakao.0123456789abcdef@ekodi.kr',items:[]};},
    session:async()=>null,
  }};
  const context = {
    document, window, console, setTimeout, clearTimeout, alert:()=>{},
    fetch:async()=>({json:async()=>({books:[]})}),
  };
  vm.runInNewContext(js, context, {filename:'books/buy/library.js'});
  await new Promise(resolve => setImmediate(resolve));
  // 계정 표시 + 로그아웃 버튼(2026-11-02)
  const status = elements.get('libStatus').children.map(c => typeof c === 'string' ? c : c.textContent).join('');
  assert.equal(status,'카카오 계정 · 보유 도서 0권 로그아웃');
  const list=elements.get('libraryList');
  assert.equal(list.children.length,1);
  assert.equal(list.children[0].className,'library-empty');
  assert.equal(list.children[0].children[2].href,'/books/#catalog');
  assert.equal(elements.get('libLogin').hidden,true);
});

test('reader library uses scoped compact responsive layout, correct routes and a live status', () => {
  assert.match(html, /<body class="books-library-page">/);
  assert.match(html, /id="libStatus" role="status" aria-live="polite"/);
  assert.match(html, /href="https:\/\/ekodi.kr\/books\/#catalog"/);
  assert.match(html, /href="https:\/\/ekodi.kr\/publishing\/"/);
  assert.match(css, /\.books-library-page \.library-page\{min-height:0\}/);
  assert.match(css, /\.books-library-page \.ekc-network\{display:none\}/);
  assert.doesNotMatch(js, /libStatus'\)\.textContent = \x60\$\{data.email\}/);
});
