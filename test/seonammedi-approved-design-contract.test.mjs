import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';
const read=name=>readFile(new URL('../sites/seonammedi/public/'+name,import.meta.url),'utf8');
const order=['공지','활동이력','관련소식','소통채널','시민의견','조직'];
function menu(html){const nav=html.match(/<nav class="ekodi-six-nav" aria-label="주요 메뉴">([\\s\\S]*?)<\\/nav>/)?.[1];assert.ok(nav,'missing common menu');return [...nav.matchAll(/<a\\b[^>]*>([^<]+)<\\/a>/g)].map(m=>m[1]);}
test('all public entry pages agree on the same six-menu order and typography contract',async()=>{
  const css=await read('shared-site-header.css');
  for(const selector of ['.site-header>.brand strong','.site-header>.brand small','.site-header>.ekodi-six-nav>a','@media(max-width:780px)'])assert.ok(css.includes(selector),selector);
  for(const page of ['index.html','notices/index.html','finance/index.html']){const html=await read(page);assert.deepEqual(menu(html),order,page);assert.match(html,/href="\\/seonammedi\\/shared-site-header\\.css"/);}
  for(const origin of ['https://seonammedi.kr','https://ekodi.kr']){const path=origin.includes('seonammedi.kr')?'/board':'/seonammedi/board';for(const category of ['voices','notices','finance']){const response=await board.fetch(new Request(origin+path+'/'+category),{});assert.equal(response.status,200);const html=await response.text();assert.deepEqual(menu(html),order);assert.match(html,/shared-site-header\\.css/);assert.doesNotMatch(html,/campaign-hero-image/);}}
});
test('campaign hero exists on home only and routed views hide it',async()=>{
  const html=await read('index.html'),js=await read('app.js');
  assert.equal((html.match(/class="hero campaign-hero"/g)||[]).length,1);
  assert.match(js,/if\\(hero\\)hero\\.hidden=Boolean\\(key\\)/);
  assert.match(html,/id="homeSpotlight"/);
  assert.match(html,/id="homeLatestList"/);
});
