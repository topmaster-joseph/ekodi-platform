import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seonamSiteLogout,SITE_LOGOUT_JS} from '../services/independent-board/site-logout.mjs';

const KEY='sb-renzehysxirjilvdxacv-auth-token';
function store(seed){const m=new Map(seed?[[KEY,JSON.stringify({access_token:seed})]]:[]);return {getItem:k=>m.has(k)?m.get(k):null,removeItem:k=>m.delete(k),has:k=>m.has(k)}}
function run({revoke,seed,href='https://ekodi.kr/seonammedi/board/voices?reply=3&x=1#voice-3'}){
  const local=store(seed),session=store(seed),fetches=[],nav=[];let button=null;
  const footer={querySelector:()=>button,append:b=>{button=b}};
  const doc={querySelector:s=>s==='footer.site-footer'?footer:null,createElement:()=>({listeners:{},addEventListener(e,f){this.listeners[e]=f}})};
  const loc={href,search:new URL(href).search,reload:()=>nav.push('reload'),replace:u=>nav.push(u)};
  const fn=new Function('document','localStorage','sessionStorage','fetch','location','URL','return ('+seonamSiteLogout.toString()+')');
  fn(doc,local,session,async(u,o)=>{fetches.push([u,o])},loc,URL)(revoke);
  return {button:()=>button,local,session,fetches,nav};
}

test('no session: no logout button',()=>{
  assert.equal(run({revoke:true,seed:''}).button(),null);
});

test('board pages clear both storages, revoke this session only, and drop login intents',async()=>{
  const r=run({revoke:true,seed:'tok'});
  assert.equal(r.button().textContent,'로그아웃');
  await r.button().listeners.click();
  assert.equal(r.local.has(KEY),false);assert.equal(r.session.has(KEY),false);
  assert.equal(r.fetches.length,1);
  assert.equal(r.fetches[0][0],'https://renzehysxirjilvdxacv.supabase.co/auth/v1/logout?scope=local');
  assert.equal(r.fetches[0][1].headers.authorization,'Bearer tok');
  assert.deepEqual(r.nav,['https://ekodi.kr/seonammedi/board/voices?x=1#voice-3']);
});

test('home page (connect-src self) clears locally without a cross-origin call and reloads on hash-only URLs',async()=>{
  const r=run({revoke:false,seed:'tok',href:'https://ekodi.kr/seonammedi/#organization'});
  await r.button().listeners.click();
  assert.equal(r.fetches.length,0);
  assert.equal(r.local.has(KEY),false);
  assert.deepEqual(r.nav,['reload']);
});

test('logout is wired into the board shell and the home app with the same function',async()=>{
  const worker=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
  assert.match(worker,/<script>'\+script\+'\\n;'\+SITE_LOGOUT_JS\+'<\\\/script><\/body>/,'logout rides the single inline script');
  assert.ok(SITE_LOGOUT_JS.startsWith('try{(')&&SITE_LOGOUT_JS.endsWith(')(true)}catch{}'),'isolated from the page script');
  const app=await readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');
  assert.ok(app.includes('try{('+seonamSiteLogout.toString()+')(false)}catch{}'),'home app.js must carry the same logout function');
  const central=JSON.stringify(worker.match(/const BOARD_CATEGORY_CLIENT_JS=.*/)[0]);
  assert.doesNotMatch(central,/site-logout|removeItem/,'central-category stays free of credential handling');
});

test('phone footer keeps 관리·로그아웃 on the title row and every other footer item full width',async()=>{
  const css=await readFile(new URL('../sites/seonammedi/public/app.css',import.meta.url),'utf8');
  assert.match(css,/footer\.site-footer\{display:grid!important;grid-template-columns:minmax\(0,1fr\) auto auto/);
  assert.match(css,/footer\.site-footer>\.site-logout\{grid-column:3;grid-row:1/);
  assert.match(css,/footer\.site-footer>:not\(a\):not\(\.site-logout\):not\(\.site-footer-copy\)\{grid-column:1\/-1/);
});
