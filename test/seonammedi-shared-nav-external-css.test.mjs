import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('six-menu dropdown is styled by shared external CSS, not by a board-only inline style',async()=>{
  const [css,main,worker]=await Promise.all([
    source('sites/seonammedi/public/app.css'),
    source('sites/seonammedi/public/index.html'),
    source('services/independent-board/worker.js')
  ]);
  assert.match(css,/SEONAMMEDI-SHARED-SIX-NAV-DROPDOWN-001/);
  assert.match(css,/\.site-header nav\.ekodi-six-nav>\.nav-group>\.nav-submenu\{display:none!important;/);
  assert.match(css,/\.site-header nav\.ekodi-six-nav>\.nav-group:hover>\.nav-submenu/);
  assert.match(css,/\.site-header nav\.ekodi-six-nav>\.nav-group:focus-within>\.nav-submenu/);
  assert.match(css,/\.site-header nav\.ekodi-six-nav>\.nav-group\[data-open="true"\]>\.nav-submenu\{display:grid!important;/);
  assert.match(css,/\.site-header nav\.ekodi-six-nav>\.nav-group>button\{appearance:none;background:transparent!important;border:0!important;/);
  assert.match(css,/@media\(max-width:760px\)\{\.site-header nav\.ekodi-six-nav/);
  // Independent-board inline CSS declares flex-wrap:nowrap later in the cascade.
  // The shared stylesheet must use !important at <=760px, or mobile overflows.
  assert.match(css,/@media\(max-width:760px\)\{\.site-header nav\.ekodi-six-nav\{[^}]*flex-wrap:wrap!important;/);
  assert.match(worker,/\.site-header\.independent-board-header>nav\{display:flex;[^}]*flex-wrap:nowrap;/);

  assert.match(main,/href="\/seonammedi\/app\.css\?/);
  assert.match(worker,/sitePath\(req,'\/app\.css\?/);
});

test('both external and internal independent board routes link the shared CSS and six-menu navigation',async()=>{
  const board=(await import(new URL('../services/independent-board/worker.js?shared-nav-style='+Date.now(),import.meta.url))).default;
  for(const host of ['https://seonammedi.kr','https://ekodi.kr/seonammedi']){
    for(const route of ['voices','finance','notices']){
      const response=await board.fetch(new Request(host+'/board/'+route),{});
      assert.equal(response.status,200);
      const html=await response.text();
      assert.match(html,/class="ekodi-six-nav"/);
      assert.match(html,/class="nav-submenu"/);
      assert.match(html,/\/app\.css\?v=/);
      for(const title of ['공지','활동이력','관련소식','소통채널','시민의견','조직'])
        assert.ok(html.includes(title),host+'/board/'+route+' missing '+title);
    }
  }
});
