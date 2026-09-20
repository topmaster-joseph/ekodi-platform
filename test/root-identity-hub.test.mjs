import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const homepage=await readFile(new URL('../index.html',import.meta.url),'utf8');
const identity=await readFile(new URL('../homepage-identity.js',import.meta.url),'utf8');
const showcase=await readFile(new URL('../homepage-showcase.css',import.meta.url),'utf8');
const auth=await readFile(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
const shell=await readFile(new URL('../shell/shell.js',import.meta.url),'utf8');
const injector=await readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8');
const header=await readFile(new URL('../shell/user-ui-header.js',import.meta.url),'utf8');

test('ekodi.kr root is a character-led site directory instead of a global personal dashboard',()=>{
  assert.match(homepage,/data-living-gateway="v8-character-hub"/);
  assert.match(homepage,/class="character-world"/);
  assert.match(homepage,/각자의 길, 하나의 정체성/);
  assert.match(homepage,/관련 사이트 보기/);
  assert.match(homepage,/공통 정체성 ID만 이어 줍니다/);
  assert.doesNotMatch(homepage,/href="[^"]*\/my\/?/i);
  assert.doesNotMatch(homepage,/My EKODI/i);
});

test('root identity login returns to the root and only changes signed-in presentation',()=>{
  assert.match(homepage,/site=portal&amp;return_to=https%3A%2F%2Fekodi\.kr%2F/);
  assert.match(identity,/dataset\.ekodiIdentity=connected\?'connected':'guest'/);
  assert.match(identity,/EKODI ID 연결됨/);
  assert.doesNotMatch(identity,/\/my\//);
  assert.match(showcase,/html\[data-ekodi-identity="connected"\] \.guest-only/);
  assert.match(showcase,/html:not\(\[data-ekodi-identity="connected"\]\) \.member-only/);
});

test('legacy my auth realm converges to the root while service logins keep site-local My Pages',()=>{
  assert.match(auth,/'my':\{name:'EKODI',returnTo:'https:\/\/ekodi\.kr\/',open:true,kind:'portal'\}/);
  assert.match(auth,/if\(site==='my'\)return new URL\('https:\/\/ekodi\.kr\/'\)/);
  assert.match(auth,/return new URL\(`https:\/\/ekodi\.kr\$\{canonicalPath\}\/my`\)/);
});

test('platform shell has no global My fallback but retains current-site member homes',()=>{
  assert.match(shell,/const ROOT='https:\/\/ekodi\.kr\/'/);
  assert.match(shell,/return `https:\/\/ekodi\.kr\/\$\{encodeURIComponent\(id\)\}\/my`/);
  assert.doesNotMatch(shell,/const MY='https:\/\/ekodi\.kr\/my\/'/);
  assert.match(injector,/if\(!id\|\|id==='my'\|\|id==='ekodi'\)return 'https:\/\/ekodi\.kr\/'/);
  assert.match(header,/if\(!id\|\|id==='my'\|\|id==='ekodi'\)return 'https:\/\/ekodi\.kr\/'/);
});
