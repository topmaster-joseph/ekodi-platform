import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { renderMallHeader } from '../mall-shared-header.js';

const script = readFileSync(new URL('../sites/ekodi-mall/assets/mall-account-header.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../sites/ekodi-mall/assets/mall-account-header.css', import.meta.url), 'utf8');
const centralKey = 'sb-renzehysxirjilvdxacv-auth-token';

function mount(session, user = {id:'verified',email:'buyer@example.com'}, nav = null) {
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
    querySelector: selector => selector === '.mall-primary-nav' ? nav : null,
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


test('all six legacy Mall page templates load the same shared account controller', () => {
  const kinds=['product','store','seller','checkout','page','book-checkout'];
  for(const kind of kinds) {
    const page=readFileSync(new URL('../sites/ekodi-mall/src/'+kind+'.template.html',import.meta.url),'utf8');
    assert.match(page,/class="header"/,kind+' missing header');
    assert.match(page,/\/ekodimall\/assets\/mall-account-header\.js/,kind+' missing login controller');
    assert.match(page,/\/ekodimall\/assets\/mall-account-header\.css/,kind+' missing account layout');
  }
  assert.match(script,/legacy\.append\(host\)/);
  assert.match(css,/\.header:not\(\.mall-header\)>\.mall-account/);
});

test('legacy header receives one member ID/logout outside mobile-hidden navigation', async () => {
  const make = (tag) => ({
    tag, attrs:{},children:[],hidden:false, textContent:'',
    setAttribute(name,value){this.attrs[name]=value;},
    append(...items){this.children.push(...items);},
    addEventListener(type,listener){if(type==='click')this.click=listener;},
    querySelector(selector){
      const attribute=selector.slice(1,-1);
      const queue=[...this.children];
      while(queue.length){
        const node=queue.shift();
        if(Object.hasOwn(node.attrs,attribute))return node;
        queue.push(...node.children);
      }
      return null;
    }
  });
  const legacy=make('header');
  const storage=new Map([[centralKey,JSON.stringify({access_token:'valid-session',expires_at:4102444800})]]);
  const ctx={
    document:{
      querySelectorAll(){return [];},
      querySelector(selector){return selector==='header.header'?legacy:null;},
      createElement:make,addEventListener(){},hidden:false
    },
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    window:{location:{href:'https://ekodi.kr/ekodimall/products/book-a/',reload(){}},addEventListener(){}},
    fetch:async url=>({ok:true,json:async()=>({id:'member-1',email:'member@example.com'})}),
    URL,Date,JSON,AbortController,setTimeout,clearTimeout
  };
  vm.runInNewContext(script,ctx);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(legacy.children.length,1);
  const account=legacy.children[0];
  assert.ok(account.attrs['data-mall-account']!==undefined);
  const id=account.querySelector('[data-mall-id]');
  const logout=account.querySelector('[data-mall-logout]');
  assert.equal(id.textContent,'member@example.com');
  assert.equal(logout.textContent,'로그아웃');
  assert.equal(account.querySelector('[data-mall-signed]').hidden,false);
});


test('verified BBQ account is shown as 비비큐청계점 beside shortened search and logout', async () => {
  const session = {access_token:'central-bbq-token', expires_at:4102444800};
  const h = mount(session, {id:'verified-bbq-identity',email:'bbqmuancg@gmail.com'});
  await h.idle();
  assert.equal(h.nodes.id.textContent,'비비큐청계점');
  assert.equal(h.nodes.signed.hidden,false);
  assert.equal(h.nodes.logout.textContent,'로그아웃');
  assert.ok(h.calls.some(c=>c.url.endsWith('/auth/v1/user')));
  assert.doesNotMatch(h.nodes.id.textContent,/@/);

  const markup = renderMallHeader({home:true});
  const search = markup.indexOf('id="mallGlobalSearch"');
  const account = markup.indexOf('data-mall-account');
  const wish = markup.indexOf('id="wishBtn"');
  const seller = markup.indexOf('class="seller-mini"');
  const category = markup.indexOf('class="mall-primary-nav"');
  assert.ok(search >= 0 && search < account && account < wish &&
    wish < seller && seller < category, 'search -> account/logout -> wishlist/seller -> categories');
  assert.match(css,/max-width:310px/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.doesNotMatch(css,/\.mall-header \.mall-account\s*\{display:none/);
});

test('only duplicate verified account navigation item is removed; shopping categories remain', async () => {
  const nav = {children:[]};
  const item = (text, filterTarget) => ({
    textContent:text,
    dataset:filterTarget ? {filterTarget} : {},
    remove(){nav.children=nav.children.filter(child=>child!==this)}
  });
  const dupe = item('비비큐청계점');
  const book = item('책·배움','book');
  const giftOverwritten = item('비비큐청계점','gift');
  const other = item('전체상품','all');
  nav.children.push(other,book,dupe,giftOverwritten);
  const h=mount({access_token:'central-bbq-token',expires_at:4102444800},
    {id:'verified',email:'bbqmuancg@gmail.com'},nav);
  await h.idle();
  assert.equal(h.nodes.id.textContent,'비비큐청계점');
  assert.equal(nav.children.includes(dupe),false,'only injected account entry removed');
  assert.equal(nav.children.includes(book),true);
  assert.equal(nav.children.includes(other),true);
  assert.equal(nav.children.includes(giftOverwritten),true);
  assert.equal(giftOverwritten.textContent,'선물·기념품','restore genuine category link');
  assert.match(script,/categoryObserver\.observe\(nav/);
});

test('other verified identities keep their friendly profile name, without trusting a stored label', async () => {
  const h=mount({access_token:'central-other',expires_at:4102444800},
    {id:'identity-2',email:'member@example.com',user_metadata:{display_name:'동네서점'}});
  await h.idle();
  assert.equal(h.nodes.id.textContent,'동네서점');
  assert.equal(h.nodes.logout.textContent,'로그아웃');
  const guest=mount(null,{id:'verified-bbq-identity',email:'bbqmuancg@gmail.com'});
  await guest.idle();
  assert.equal(guest.nodes.signed.hidden,true,'no authenticated verification means no signed-in label');
  assert.equal(guest.nodes.login.hidden,false);
});
