import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('six-menu header shares one external responsive CSS without dropdowns',async()=>{
  const [css,main,worker]=await Promise.all([
    source('sites/seonammedi/public/shared-site-header.css'),
    source('sites/seonammedi/public/index.html'),
    source('services/independent-board/worker.js')
  ]);
  for(const selector of ['.site-header>.brand strong','.site-header>.ekodi-six-nav>a','@media(max-width:780px)'])assert.ok(css.includes(selector));
  assert.match(main,/shared-site-header\\.css/);
  assert.match(worker,/shared-site-header\\.css/);
  assert.match(main,/href="\\/seonammedi\\/app\\.css\\?/);
  assert.match(worker,/sitePath\\(req,'\\/app\\.css\\?/);
});

test('both external and internal independent board routes link the shared CSS and six-menu navigation',async()=>{
  const board=(await import(new URL('../services/independent-board/worker.js?shared-nav-style='+Date.now(),import.meta.url))).default;
  for(const host of ['https://seonammedi.kr','https://ekodi.kr/seonammedi']){
    for(const route of ['voices','finance','notices']){
      const response=await board.fetch(new Request(host+'/board/'+route),{});
      assert.equal(response.status,200);
      const html=await response.text();
      assert.match(html,/class="ekodi-six-nav"/);
      assert.doesNotMatch(html,/<nav class="ekodi-six-nav"[^>]*>[\\s\\S]*?class="nav-submenu"/);\n      assert.match(html,/shared-site-header\\.css/);
      assert.match(html,/\/app\.css\?v=/);
      for(const title of ['활동이력','관련소식','소통채널','시민의견','공지','조직'])
        assert.ok(html.includes(title),host+'/board/'+route+' missing '+title);
    }
  }
});
