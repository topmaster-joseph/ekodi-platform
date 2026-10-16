import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const [home,css,ui,worker]=await Promise.all([
  read('sites/seonammedi/public/index.html'),
  read('sites/seonammedi/public/shared-site-header.css'),
  read('sites/seonammedi/public/board-central-category.js'),
  read('services/independent-board/worker.js')
]);

test('six-menu home loads the same read-only visual shell as independent boards',()=>{
  assert.ok(home.includes('src="/seonammedi/board/ui/central-category.js?v=20261016-home-photo-worker-1" defer'), 'home must load verified Worker asset');
  assert.ok(!home.includes('src="/seonammedi/board-central-category.js'), 'home must not depend on legacy static asset');
  assert.ok(home.includes('/seonammedi/board/ui/central-category.js'), 'home must reuse proven board Worker route');
  assert.ok(worker.includes("boardPath(req,'ui/central-category.js')"));
  assert.match(home,/id="organization"/);
  assert.match(home,/id="committee-activity"/);
  for(const label of ['공지','활동이력','관련소식','소통채널','시민의견','조직'])
    assert.ok(ui.includes("label:'"+label+"'"),label);
  assert.match(ui,/location\.pathname\.startsWith\('\/seonammedi\/'\)/);
  assert.match(ui,/base\+'board\/notices'/);
  assert.match(ui,/base\+'board\/voices\?compose=1&choose_account=1'/);
  assert.match(ui,/base\+'#committee-activity'/);
  assert.match(ui,/base\+'#organization'/);
});

test('the campaign artwork is the only main banner and no stock photo is inserted',()=>{
  assert.ok(!ui.includes('images.unsplash.com'));
  assert.ok(!ui.includes("const hero = el('section','seonam-visual-hero')"));
  assert.ok(ui.includes("header.insertAdjacentElement('afterend',preservedCampaign)"));
  assert.ok(css.includes('body.seonam-visual-ready>.campaign-hero .campaign-hero-image'));
  assert.ok(css.includes('body.seonam-visual-ready > .seonam-visual-hero{display:none!important}'));
});

test('central content is moved without replacing forms or mutation handlers',()=>{
  assert.match(ui,/while\(main\.firstChild\) content\.append\(main\.firstChild\)/);
  assert.match(ui,/content\.prepend\(outsideCategory\)/);
  assert.match(ui,/main\.append\(left,content,right\)/);
  assert.match(ui,/header\.insertAdjacentElement\('afterend',preservedCampaign\)/);
  assert.match(css,/body\.seonam-visual-ready>\.campaign-hero \.campaign-hero-image/);
  assert.match(css,/body\[data-seonammedi-image-mode="inner"\]\.seonam-visual-ready>\.campaign-hero/);
  assert.match(ui,/fetch\(base\+'board\/api\/notices',\{method:'GET',cache:'no-store'\}\)/);
  assert.doesNotMatch(ui,/fetch\([^)]*\{method:'(?:POST|PUT|DELETE)'/);
  assert.match(worker,/function noticesPage\(req\)/);
  assert.match(worker,/function boardPage\(req\)/);
  assert.match(worker,/\/board\/api\/admin\/notices/);
});

test('three-column shell is responsive and does not change user authorization contracts',()=>{
  assert.match(css,/grid-template-columns:minmax\(190px,230px\) minmax\(0,1fr\) minmax\(210px,260px\)/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/body\.seonam-visual-ready\.board-notices \.board-panel input\[type="checkbox"\]/);
  assert.match(css,/\.seonam-visual-side-nav a\[aria-current="page"\]/);
  assert.match(css,/body\[data-seonammedi-image-mode="inner"\]\.seonam-visual-ready/);
  assert.doesNotMatch(ui,/(?:localStorage|sessionStorage|auth\/v1\/|Bearer )/);
});

test('board routes preserve the unified header and original board APIs',async()=>{
  const {default:board}=await import('../services/independent-board/worker.js');
  for(const origin of ['https://seonammedi.kr','https://ekodi.kr']){
    const prefix=origin.includes('ekodi.kr')?'/seonammedi':'';
    for(const route of ['/board/notices','/board/voices']){
      const res=await board.fetch(new Request(origin+prefix+route),{});
      assert.equal(res.status,200,origin+route);
      const html=await res.text();
      assert.match(html,/class="site-header independent-board-header"/);
      assert.ok(html.includes('board/ui/central-category.js'));
      assert.match(html,/shared-site-header\.css/);
      const mountedAsset=origin+prefix+'/board/ui/central-category.js';
      const asset=await board.fetch(new Request(mountedAsset),{});
      assert.equal(asset.status,200,mountedAsset);
      assert.equal(await asset.text(),ui,'board must serve identical photo UI on both mounts');
      for(const text of ['공지','활동이력','관련소식','소통채널','시민의견','조직'])assert.ok(html.includes(text),text);
    }
  }
});
